export interface LocalApiCurlExampleInput {
  baseUrl: string
  token: string | null
}

export interface LocalApiExampleBaseUrlInput {
  statusUrl: string | null
  settingsHost: string
  port: number
}

export interface LocalApiStatusDisplayInput {
  running: boolean
  url: string | null
}

export interface LocalApiStatusDisplay {
  tone: 'running' | 'stopped'
  label: '运行中' | '未运行'
  description: string
}

export function getApiTokenActionLabel(hasApiToken: boolean): '生成' | '重置' {
  return hasApiToken ? '重置' : '生成'
}

export function getLocalApiStatusDisplay(input: LocalApiStatusDisplayInput): LocalApiStatusDisplay {
  if (input.running) {
    return {
      tone: 'running',
      label: '运行中',
      description: input.url ?? '服务正在运行',
    }
  }

  return {
    tone: 'stopped',
    label: '未运行',
    description: '默认关闭，仅在启用后监听本机端口。',
  }
}

export function getLocalApiExampleBaseUrl(input: LocalApiExampleBaseUrlInput): string {
  const fallbackHost = input.settingsHost === '0.0.0.0' ? '127.0.0.1' : input.settingsHost
  if (!input.statusUrl) return `http://${fallbackHost}:${input.port}`

  try {
    const url = new URL(input.statusUrl)
    if (url.hostname === '0.0.0.0') {
      url.hostname = '127.0.0.1'
    }
    return url.origin
  } catch {
    return `http://${fallbackHost}:${input.port}`
  }
}

export function buildLocalApiCurlExample(input: LocalApiCurlExampleInput): string {
  const token = input.token ?? '<API_TOKEN>'
  return [
    `curl -X POST '${input.baseUrl}/api/agent/sessions' \\`,
    `  -H 'Authorization: Bearer ${token}' \\`,
    `  -H 'Content-Type: application/json' \\`,
    `  -d '{`,
    `    "title": "Local API Session"`,
    `  }'`,
  ].join('\n')
}
