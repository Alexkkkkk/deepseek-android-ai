// ============================================================
// 单文件 DSH 插件：github_api + OAuth Device Flow / PAT
// 保存为 dsh-github-connect-single.ts
// 在 profile 的 cordis.patch.yml 中加载：
//   - insert:
//       - id: dsh-github-connect-single
//         name: '/absolute/path/to/dsh-github-connect-single.ts'
// 重启 DSH 后可用：github_connect / github_api / github_status / github_disconnect
// ============================================================

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

export const name = 'dsh-github-connect-single'
export const inject = ['tools']

const DSH_HOME = process.env.DSH_HOME || join(homedir(), '.dsh')
const AUTH_DIR = join(DSH_HOME, '.dsh-github-connect')
const AUTH_FILE = join(AUTH_DIR, 'auth.json')
const GITHUB_API = 'https://api.github.com'

interface AuthData { token: string; method: 'oauth' | 'pat'; savedAt: string }

async function loadToken(): Promise<string | null> {
  try {
    if (!existsSync(AUTH_FILE)) return null
    const data: AuthData = JSON.parse(await readFile(AUTH_FILE, 'utf8'))
    return data.token || null
  } catch { return null }
}

async function saveToken(token: string, method: 'oauth' | 'pat'): Promise<void> {
  await mkdir(AUTH_DIR, { recursive: true })
  await writeFile(AUTH_FILE, JSON.stringify({ token, method, savedAt: new Date().toISOString() }, null, 2), 'utf8')
}

async function clearToken(): Promise<void> {
  try { await unlink(AUTH_FILE) } catch { /* ignore */ }
}

async function callGitHub(token: string, method: string, path: string, body?: unknown) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'dsh-github-connect-single',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  if (body) headers['Content-Type'] = 'application/json'
  const res = await fetch(`${GITHUB_API}${path}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data: unknown = text
  try { data = JSON.parse(text) } catch { /* keep text */ }
  return { ok: res.ok, status: res.status, data }
}

async function startDeviceFlow(clientId: string) {
  const res = await fetch('https://github.com/login/device/code', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, scope: 'repo read:user' }),
  })
  const d = await res.json() as any
  return { userCode: d.user_code, verificationUri: d.verification_uri, deviceCode: d.device_code, interval: d.interval }
}

async function pollDeviceFlow(clientId: string, deviceCode: string, interval: number): Promise<string> {
  while (true) {
    await new Promise(r => setTimeout(r, interval * 1000))
    const res = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, device_code: deviceCode, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' }),
    })
    const d = await res.json() as any
    if (d.access_token) return d.access_token
    if (d.error === 'authorization_pending') continue
    if (d.error === 'slow_down') { interval = d.interval || interval + 5; continue }
    throw new Error(`OAuth failed: ${d.error || 'unknown'}`)
  }
}

export function apply(ctx: Context) {
  ctx.tools.register(defineTool({
    name: 'github_api',
    description: '调用 GitHub REST API。需要先通过 github_connect 连接账号。',
    parameters: {
      method: { type: 'string', required: true, description: 'HTTP 方法：GET/POST/PATCH/PUT/DELETE' },
      path: { type: 'string', required: true, description: '例如 /repos/octocat/Hello-World/issues' },
      body: { type: 'string', description: '可选 JSON 字符串' },
    },
    output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
    async execute(args) {
      const token = await loadToken()
      if (!token) return '未连接 GitHub。请先调用 github_connect。'
      let body: unknown
      if (args.body) { try { body = JSON.parse(args.body) } catch { return `body 不是合法 JSON` } }
      const r = await callGitHub(token, args.method.toUpperCase(), args.path, body)
      return JSON.stringify(r, null, 2)
    },
  }))

  ctx.tools.register(defineTool({
    name: 'github_connect',
    description: '连接 GitHub。method=pat 时传 token；method=oauth 时传 clientId。',
    parameters: {
      method: { type: 'string', required: true, description: 'pat 或 oauth' },
      token: { type: 'string', description: 'PAT（method=pat 时必填）' },
      clientId: { type: 'string', description: 'OAuth App Client ID（method=oauth 时必填）' },
    },
    output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
    async execute(args) {
      if (args.method === 'pat') {
        if (!args.token) return 'method=pat 时必须提供 token。'
        const r = await callGitHub(args.token, 'GET', '/user')
        if (!r.ok) return `令牌无效 (HTTP ${r.status}): ${JSON.stringify(r.data)}`
        await saveToken(args.token, 'pat')
        const u = r.data as any
        return `已连接: ${u.login}`
      }
      if (args.method === 'oauth') {
        if (!args.clientId) return 'method=oauth 时必须提供 clientId。'
        const f = await startDeviceFlow(args.clientId)
        pollDeviceFlow(args.clientId, f.deviceCode, f.interval)
          .then(t => saveToken(t, 'oauth')).catch(() => {})
        return `请在浏览器打开 ${f.verificationUri}，输入验证码 ${f.userCode}。授权后令牌自动保存。`
      }
      return 'method 必须是 pat 或 oauth。'
    },
  }))

  ctx.tools.register(defineTool({
    name: 'github_status',
    description: '检查 GitHub 连接状态。',
    parameters: {},
    output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
    async execute() {
      const token = await loadToken()
      if (!token) return '未连接 GitHub。'
      const r = await callGitHub(token, 'GET', '/user')
      if (!r.ok) return `令牌已失效 (HTTP ${r.status})。请重新 github_connect。`
      const u = r.data as any
      return `已连接: ${u.login} (${u.name || '无名称'})`
    },
  }))

  ctx.tools.register(defineTool({
    name: 'github_disconnect',
    description: '断开 GitHub（删除本地令牌）。',
    parameters: {},
    output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
    async execute() { await clearToken(); return '已断开 GitHub，本地令牌已删除。' },
  }))
}
