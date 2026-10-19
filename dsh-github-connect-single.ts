// ============================================================
// 单文件 DSH 插件：github_api 工具 + OAuth 设备流 / PAT 连接
// 保存为 dsh-github-connect-single.ts
// 通过 profile 的 cordis.patch.yml 以本地绝对路径加载：
//   - insert:
//       - id: dsh-github-connect-single
//         name: '/absolute/path/to/dsh-github-connect-single.ts'
// 重启 DSH 后可用工具：github_connect / github_api / github_status / github_disconnect
// 注意：这是简化教学版，生产请用官方 dsh-github-connect 插件。
// ============================================================

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

export const name = 'dsh-github-connect-single'
export const inject = ['tools']

// ------------------------------------------------------------
// 配置与路径
// ------------------------------------------------------------
const DSH_HOME = process.env.DSH_HOME || join(homedir(), '.dsh')
const AUTH_DIR = join(DSH_HOME, '.dsh-github-connect')
const AUTH_FILE = join(AUTH_DIR, 'auth.json')
const GITHUB_API = 'https://api.github.com'

interface AuthData {
  token: string
  method: 'oauth' | 'pat'
  savedAt: string
}

// ------------------------------------------------------------
// 令牌读写
// ------------------------------------------------------------
async function loadToken(): Promise<string | null> {
  try {
    if (!existsSync(AUTH_FILE)) return null
    const raw = await readFile(AUTH_FILE, 'utf8')
    const data: AuthData = JSON.parse(raw)
    return data.token || null
  } catch {
    return null
  }
}

async function saveToken(token: string, method: 'oauth' | 'pat'): Promise<void> {
  await mkdir(AUTH_DIR, { recursive: true })
  const data: AuthData = {
    token,
    method,
    savedAt: new Date().toISOString(),
  }
  await writeFile(AUTH_FILE, JSON.stringify(data, null, 2), 'utf8')
}

async function clearToken(): Promise<void> {
  try { await unlink(AUTH_FILE) } catch { /* ignore */ }
}

// ------------------------------------------------------------
// GitHub API 调用
// ------------------------------------------------------------
async function callGitHub(
  token: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const url = `${GITHUB_API}${path}`
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'dsh-github-connect-single',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  if (body) headers['Content-Type'] = 'application/json'

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  const text = await res.text()
  let data: unknown = text
  try { data = JSON.parse(text) } catch { /* keep text */ }

  return { ok: res.ok, status: res.status, data }
}

// ------------------------------------------------------------
// OAuth 设备流
// ------------------------------------------------------------
async function startDeviceFlow(clientId: string): Promise<{
  userCode: string
  verificationUri: string
  deviceCode: string
  interval: number
}> {
  const res = await fetch('https://github.com/login/device/code', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: clientId,
      scope: 'repo read:user',
    }),
  })
  const data = await res.json() as {
    device_code: string
    user_code: string
    verification_uri: string
    interval: number
  }
  return {
    userCode: data.user_code,
    verificationUri: data.verification_uri,
    deviceCode: data.device_code,
    interval: data.interval,
  }
}

async function pollDeviceFlow(
  clientId: string,
  deviceCode: string,
  interval: number,
): Promise<string> {
  while (true) {
    await new Promise(r => setTimeout(r, interval * 1000))
    const res = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        device_code: deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
    })
    const data = await res.json() as {
      access_token?: string
      error?: string
      interval?: number
    }
    if (data.access_token) return data.access_token
    if (data.error === 'authorization_pending') continue
    if (data.error === 'slow_down') {
      interval = data.interval || interval + 5
      continue
    }
    throw new Error(`OAuth failed: ${data.error || 'unknown error'}`)
  }
}

// ------------------------------------------------------------
// 插件入口
// ------------------------------------------------------------
export function apply(ctx: Context) {
  // ---------- 工具 1：github_api ----------
  ctx.tools.register(
    defineTool({
      name: 'github_api',
      description: '调用 GitHub REST API。需要先通过 github_connect 连接账号。',
      parameters: {
        method: {
          type: 'string',
          required: true,
          description: 'HTTP 方法：GET / POST / PATCH / PUT / DELETE',
        },
        path: {
          type: 'string',
          required: true,
          description: 'GitHub API 路径，例如 /repos/octocat/Hello-World/issues',
        },
        body: {
          type: 'string',
          description: '可选 JSON 字符串，作为请求体',
        },
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      async execute(args) {
        const token = await loadToken()
        if (!token) {
          return '未连接 GitHub。请先调用 github_connect 工具完成授权。'
        }
        let body: unknown
        if (args.body) {
          try { body = JSON.parse(args.body) } catch {
            return `body 不是合法 JSON: ${args.body}`
          }
        }
        const result = await callGitHub(
          token,
          args.method.toUpperCase(),
          args.path,
          body,
        )
        return JSON.stringify(result, null, 2)
      },
    }),
  )

  // ---------- 工具 2：github_connect ----------
  ctx.tools.register(
    defineTool({
      name: 'github_connect',
      description: '连接 GitHub 账号。支持 PAT 直接粘贴，或 OAuth 设备流（需要 OAuth App Client ID）。',
      parameters: {
        method: {
          type: 'string',
          required: true,
          description: '连接方式：pat 或 oauth',
        },
        token: {
          type: 'string',
          description: '当 method=pat 时必填：GitHub Personal Access Token',
        },
        clientId: {
          type: 'string',
          description: '当 method=oauth 时必填：GitHub OAuth App Client ID',
        },
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      async execute(args) {
        if (args.method === 'pat') {
          if (!args.token) return 'method=pat 时必须提供 token 参数。'
          const result = await callGitHub(args.token, 'GET', '/user')
          if (!result.ok) {
            return `令牌无效或网络错误 (HTTP ${result.status}): ${JSON.stringify(result.data)}`
          }
          await saveToken(args.token, 'pat')
          const user = result.data as { login?: string }
          return `已连接 GitHub 账号: ${user.login || '未知用户'}`
        }

        if (args.method === 'oauth') {
          if (!args.clientId) return 'method=oauth 时必须提供 clientId 参数。'
          const flow = await startDeviceFlow(args.clientId)
          const msg = [
            `请在浏览器打开: ${flow.verificationUri}`,
            `输入验证码: ${flow.userCode}`,
            `等待授权中... (轮询间隔 ${flow.interval}s)`,
          ].join('\n')

          pollDeviceFlow(args.clientId, flow.deviceCode, flow.interval)
            .then(async token => { await saveToken(token, 'oauth') })
            .catch(() => { /* 静默失败，用户可重试 */ })

          return msg + '\n\n授权完成后，令牌会自动保存。之后可调用 github_api。'
        }

        return 'method 必须是 pat 或 oauth。'
      },
    }),
  )

  // ---------- 工具 3：github_status ----------
  ctx.tools.register(
    defineTool({
      name: 'github_status',
      description: '检查 GitHub 连接状态。',
      parameters: {},
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      async execute() {
        const token = await loadToken()
        if (!token) return '未连接 GitHub。'
        const result = await callGitHub(token, 'GET', '/user')
        if (!result.ok) {
          return `令牌已失效 (HTTP ${result.status})，请重新调用 github_connect。`
        }
        const user = result.data as { login?: string; name?: string }
        return `已连接: ${user.login} (${user.name || '无名称'})`
      },
    }),
  )

  // ---------- 工具 4：github_disconnect ----------
  ctx.tools.register(
    defineTool({
      name: 'github_disconnect',
      description: '断开 GitHub 连接（删除本地令牌）。',
      parameters: {},
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      async execute() {
        await clearToken()
        return '已断开 GitHub 连接，本地令牌已删除。'
      },
    }),
  )
}
