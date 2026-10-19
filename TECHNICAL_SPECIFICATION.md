# ============================================================
# ТЕХНИЧЕСКОЕ ЗАДАНИЕ
# Android-приложение «DeepSeek GitHub Connector»
# Версия: 1.0 | Дата: 2026-10-19
# ============================================================

## 1. ВВЕДЕНИЕ

### 1.1. Наименование
Android-приложение для интеграции DeepSeek API с GitHub.

### 1.2. Цель
Создать нативное Android-приложение, позволяющее пользователю авторизоваться в GitHub и управлять репозиториями (Issues, PR, комментарии) через естественный язык с помощью DeepSeek API.

### 1.3. Актуальность
Существующие решения (DSH-плагины) требуют серверной среды или Termux. Нативное приложение упрощает доступ и повышает безопасность за счёт системного шифрованного хранилища.


## 2. ФУНКЦИОНАЛЬНЫЕ ТРЕБОВАНИЯ

### 2.1. Аутентификация GitHub
Поддержать два метода:
1. OAuth 2.0 Device Flow (рекомендуется): запрос device_code и user_code, отображение кода и URL https://github.com/login/device, опрос endpoint токена с соблюдением interval.
2. Personal Access Token (PAT): ввод fine-grained PAT, сохранение в зашифрованном виде.

### 2.2. Интеграция с DeepSeek API
- Base URL: https://api.deepseek.com
- Модель: deepseek-flash (с возможностью смены в настройках)
- Интерфейс чата с лентой сообщений
- Поддержка Function Calling / Tools: передача описания GitHub-инструментов модели, чтобы она генерировала вызовы функций

### 2.3. Исполнитель GitHub-команд (Tool Executor)
На основе function_call от DeepSeek выполнять REST-запросы к GitHub API.
Минимальный набор инструментов:
- list_repos: GET /user/repos
- list_issues: GET /repos/{owner}/{repo}/issues
- create_issue_comment: POST /repos/{owner}/{repo}/issues/{issue_number}/comments
- list_pull_requests: GET /repos/{owner}/{repo}/pulls

### 2.4. Интерфейс пользователя (UI)
1. Экран авторизации: кнопка «Войти через GitHub» (Device Flow) и поле для ввода PAT.
2. Экран чата: поле ввода, лента сообщений (запрос → вызов инструмента → ответ), индикация загрузки.
3. Экран настроек: отзыв токена, очистка истории, выбор модели DeepSeek, ввод API-ключа DeepSeek.


## 3. ТЕХНИЧЕСКИЕ ТРЕБОВАНИЯ

### 3.1. Платформа и стек
- ОС: Android 8.0 (API 26) и выше
- Язык: Kotlin
- UI: Jetpack Compose
- Сеть: Retrofit 2 + OkHttp + Gson (или Moshi)
- Асинхронность: Kotlin Coroutines + Flow

### 3.2. Безопасность
- Хранение токенов: EncryptedSharedPreferences (AndroidX Security) или DataStore с шифрованием. Запрещено хранить в открытом виде.
- Сеть: только HTTPS. Запрещено логирование заголовков Authorization в production.

### 3.3. Архитектура
Паттерн MVVM:
- Data Layer: GitHubRepository, DeepSeekRepository (сетевые вызовы)
- Domain Layer: модели ChatMessage, GitHubTool (описание функций)
- UI Layer: Composable-экраны и ViewModel с UiState


## 4. ТРЕБОВАНИЯ К НАДЁЖНОСТИ

1. Сетевые ошибки: при отсутствии интернета или таймауте показывать Snackbar с предложением повторить.
2. Ошибки авторизации:
   - 401 Unauthorized → предложить повторную авторизацию
   - Device Flow: authorization_pending (продолжать опрос), slow_down (увеличить интервал), expired_token (остановить, начать заново)
3. Ошибки DeepSeek API: обрабатывать 4xx/5xx, показывать текст ошибки, не падать.
4. Ограничение прав: предупреждать о необходимых scopes (repo, read:user), рекомендовать fine-grained токены.


## 5. ЭТАПЫ РАЗРАБОТКИ И КРИТЕРИИ ПРИЁМКИ

### Этап 1: Каркас и авторизация
Результат: приложение запускается, экран входа, успешный OAuth Device Flow или ввод PAT, токен сохранён в зашифрованном хранилище.
Критерий: после авторизации переход на экран чата, в настройках статус «Подключено к GitHub».

### Этап 2: Интеграция с DeepSeek (текстовый чат)
Результат: отправка текстовых сообщений в DeepSeek API, отображение ответов.
Критерий: пользователь отправляет «Привет», получает осмысленный ответ.

### Этап 3: Function Calling и GitHub-инструменты
Результат: DeepSeek получает описания функций list_issues и create_issue_comment. При запросе «Покажи Issues в репозитории X» модель возвращает tool_call, приложение выполняет запрос к GitHub, результат возвращается в модель, пользователь видит финальный ответ.
Критерий: запрос «Создай комментарий к Issue #1 в репозитории X с текстом "Тест"» приводит к реальному появлению комментария на GitHub.

### Этап 4: Полировка и безопасность
Результат: обработка всех краевых случаев (потеря сети, истёкший токен). Проверка, что токены не попадают в логи.
Критерий: при отзыве токена на стороне GitHub приложение корректно предлагает переавторизоваться.


## 6. ОГРАНИЧЕНИЯ И ЗАВИСИМОСТИ

1. Требуется API-ключ DeepSeek (вводится пользователем в настройках, хранится в зашифрованном виде).
2. Требуются права, предоставленные GitHub-токеном. Приложение не обходит rate limiting GitHub.
3. Полностью клиентское приложение (Client-Side Only): все запросы идут напрямую с устройства на api.github.com и api.deepseek.com.


## 7. КРИТЕРИИ КАЧЕСТВА (Definition of Done)

- Код проходит статический анализ (Detekt / ktlint)
- Unit-тесты для слоя репозиториев (MockWebServer для имитации GitHub и DeepSeek)
- Ручное тестирование на устройстве с Android 10+
- README с процедурой сборки и настройки (создание OAuth App на GitHub, получение ключа DeepSeek)


## 8. ПРИМЕЧАНИЕ

Данное ТЗ описывает создание отдельного нативного приложения. Оно не является модификацией репозитория Alexkkkkk/deepseek-android-ai (который сейчас пуст), а представляет собой спецификацию для нового проекта. Для реализации потребуется среда разработки Android Studio на компьютере.


## 9. ПРИЛОЖЕНИЕ А. Референсная реализация GitHub-инструментов (DSH-плагин, TypeScript)

Одностраничный плагин `dsh-github-connect-single.ts` — упрощёна реализация того же
контракта, что требуется от Android-приложения (разделы 2.1, 2.3, 4). Он используется
как эталон поведения: набор инструментов, последовательность Device Flow, коды ошибок
OAuth и формат ответа GitHub API.

Соответствие плагина и слоёв Android-приложения:

| Плагин (TS) | Android-приложение (Kotlin) |
|---|---|
| `github_connect` (method=pat / oauth) | Этап 1: экран авторизации, `GitHubAuthRepository` |
| `startDeviceFlow` / `pollDeviceFlow` | Device Flow: `authorization_pending`, `slow_down`, `expired_token` (п. 4.2) |
| `saveToken` / `loadToken` / `clearToken` | `EncryptedSharedPreferences` / DataStore с шифрованием (п. 3.2) |
| `github_api` (method + path + body) | Tool Executor: REST-вызовы к `api.github.com` (п. 2.3) |
| `github_status` | Индикатор «Подключено к GitHub» на экране настроек (п. 5, Этап 1) |
| `github_disconnect` | Отзыв токена / очистка хранилища (п. 2.4) |
| `defineTool({ name, description, parameters })` | Описания функций `GitHubTool` для Function Calling DeepSeek (п. 2.2) |

Отличия, которые обязательно нужно учесть при переносе в Android: в плагине токен
лежит в открытом JSON-файле `~/.dsh/.dsh-github-connect/auth.json` (недопустимо по
п. 3.2); фоновый опрос Device Flow через `setTimeout` не выживает при сворачивании
приложения — нужен `WorkManager`/`CoroutineScope` уровня процесса; заголовки
`Authorization` не должны попадать в логи; `scope` при Device Flow должен включать
`repo` и `read:user`.

```ts
// ============================================================
// 单文件 DSH 插件：github_api 工具 + OAuth 设备流 / PAT 连接
// 用法：将本文件保存为 dsh-github-connect-single.ts，
//       通过 profile 的 cordis.patch.yml 以本地路径加载。
// 注意：这是简化版，仅实现核心逻辑；生产使用请安装官方
//       dsh-github-connect 插件。
// ============================================================

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

export const name = 'dsh-github-connect-single'
export const inject = ['tools']

// ------------------------------------------------------------------
// 配置
// ------------------------------------------------------------------
const DSH_HOME = process.env.DSH_HOME || join(homedir(), '.dsh')
const AUTH_DIR = join(DSH_HOME, '.dsh-github-connect')
const AUTH_FILE = join(AUTH_DIR, 'auth.json')
const GITHUB_API = 'https://api.github.com'

interface AuthData {
  token: string
  method: 'oauth' | 'pat'
  savedAt: string
}

// ------------------------------------------------------------------
// 令牌读写
// ------------------------------------------------------------------
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
  try {
    const { unlink } = await import('node:fs/promises')
    await unlink(AUTH_FILE)
  } catch { /* ignore */ }
}

// ------------------------------------------------------------------
// GitHub API 调用
// ------------------------------------------------------------------
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

// ------------------------------------------------------------------
// OAuth 设备流（简化：需要用户提供 OAuth App Client ID）
// ------------------------------------------------------------------
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

// ------------------------------------------------------------------
// 插件入口
// ------------------------------------------------------------------
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
      async execute(args, exec) {
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
      async execute(args, exec) {
        if (args.method === 'pat') {
          if (!args.token) return 'method=pat 时必须提供 token 参数。'
          // 验证令牌
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
          // 返回给用户看的信息（模型会转述给用户）
          const msg = [
            `请在浏览器打开: ${flow.verificationUri}`,
            `输入验证码: ${flow.userCode}`,
            `等待授权中... (轮询间隔 ${flow.interval}s)`,
          ].join('\n')

          // 在后台轮询（不阻塞工具返回）
          pollDeviceFlow(args.clientId, flow.deviceCode, flow.interval)
            .then(async token => {
              await saveToken(token, 'oauth')
            })
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
```
