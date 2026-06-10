import type { ChannelModelTestInput, ChannelModelTestResult, ProviderType } from '@proma/shared'
import { normalizeAnthropicProviderUrl } from '@proma/core'

interface AnthropicTextBlock {
  type?: string
  text?: string
}

interface AnthropicModelResponse {
  content?: AnthropicTextBlock[] | string
  error?: {
    message?: string
    type?: string
  } | string
}

function extractErrorMessage(data: unknown, fallback: string): string {
  if (!data || typeof data !== 'object') return fallback
  const record = data as Record<string, unknown>
  const error = record.error
  if (typeof error === 'string') return error
  if (error && typeof error === 'object') {
    const message = (error as Record<string, unknown>).message
    if (typeof message === 'string' && message.trim()) return message
  }
  const message = record.message
  if (typeof message === 'string' && message.trim()) return message
  return fallback
}

function extractModelContent(data: AnthropicModelResponse): string {
  if (typeof data.content === 'string') return data.content
  if (Array.isArray(data.content)) {
    return data.content
      .map((block) => block.text ?? '')
      .filter((text) => text.trim().length > 0)
      .join('\n')
  }
  return ''
}

async function readJsonOrText(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => '')
  if (!text.trim()) return {}
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function formatResponseData(data: unknown): string {
  if (typeof data === 'string') return data.slice(0, 1000)
  try {
    return JSON.stringify(data).slice(0, 1000)
  } catch {
    return String(data).slice(0, 1000)
  }
}

const ANTHROPIC_PROTOCOL_PROVIDERS: ReadonlySet<ProviderType> = new Set<ProviderType>([
  'anthropic',
  'anthropic-compatible',
  'deepseek',
  'kimi-api',
  'kimi-coding',
  'zhipu-coding',
  'minimax',
  'huatai-anthropic',
  'xiaomi',
  'xiaomi-token-plan',
])

function buildAnthropicMessagesUrl(baseUrl: string, provider: ProviderType): string {
  return `${normalizeAnthropicProviderUrl(baseUrl, provider)}/messages`
}

export async function testChannelModelWithFetch(
  input: ChannelModelTestInput,
  fetchFn: typeof fetch,
): Promise<ChannelModelTestResult> {
  if (!ANTHROPIC_PROTOCOL_PROVIDERS.has(input.provider)) {
    return { success: false, message: `暂不支持测试该供应商的模型: ${input.provider}` }
  }

  const response = await fetchFn(buildAnthropicMessagesUrl(input.baseUrl, input.provider), {
    method: 'POST',
    headers: {
      'X-Api-Key': input.apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages: [{ role: 'user', content: '只回复 ECHO，不要输出其他内容。' }],
      stream: false,
      model: input.model,
      max_tokens: 2000,
      temperature: 0.8,
    }),
  })

  const data = await readJsonOrText(response)
  if (!response.ok) {
    return {
      success: false,
      message: `请求失败 (${response.status}): ${extractErrorMessage(data, formatResponseData(data))}`,
    }
  }

  const parsed = data as AnthropicModelResponse
  if (parsed.error) {
    return { success: false, message: extractErrorMessage(parsed, '模型测试失败') }
  }

  const content = extractModelContent(parsed)
  if (!content.trim()) {
    return { success: false, message: `模型未返回文本内容: ${formatResponseData(data)}` }
  }

  return {
    success: true,
    message: '模型响应正常',
    content,
  }
}
