/**
 * 联网搜索工具模块（Chat 模式）
 *
 * 基于数智中台搜索服务提供实时联网搜索能力。
 * 数智中台搜索服务使用内置 appId 与 API Key，无需用户额外配置凭据。
 */

import type { ToolCall, ToolResult, ToolDefinition } from '@proma/core'
import type { ChatToolMeta } from '@proma/shared'
import { Agent, fetch as undiciFetch } from 'undici'
import type {
  RequestInfo as UndiciRequestInfo,
  RequestInit as UndiciRequestInit,
  Response as UndiciResponse,
} from 'undici'

const COMPASS_SEARCH_ENDPOINT = 'http://168.63.65.40:8090/ai-service/v1/api/web/search'
const COMPASS_APP_ID = '001421'
const COMPASS_API_KEY = 'ngaflkmmttnaab2jzkaa'
const DEFAULT_WEB_SEARCH_TIME_RANGE = 'OneMonth'
const WEB_SEARCH_TIME_RANGE_VALUES = ['OneDay', 'OneWeek', 'OneMonth', 'OneYear'] as const

export type WebSearchTimeRange = typeof WEB_SEARCH_TIME_RANGE_VALUES[number]

export interface WebSearchOptions {
  timeRange?: WebSearchTimeRange
}

// ===== 工具元数据 =====

export const WEB_SEARCH_TOOL_META: ChatToolMeta = {
  id: 'web-search',
  name: '联网搜索',
  description: '实时搜索互联网获取最新信息',
  params: [
    { name: 'query', type: 'string', description: '搜索查询', required: true },
    {
      name: 'timeRange',
      type: 'string',
      description: '检索有效期。根据内容时效性选择：OneDay、OneWeek、OneMonth、OneYear；默认 OneMonth',
      required: false,
      enum: [...WEB_SEARCH_TIME_RANGE_VALUES],
    },
  ],
  icon: 'Globe',
  category: 'builtin',
  executorType: 'builtin',
  systemPromptAppend: `
<web_search_instructions>
你拥有联网搜索能力。

**web_search — 搜索：**
当用户询问你不确定或可能过时的信息时主动调用：
- 时事新闻、最新数据、实时信息
- 你不确定的事实性问题
- 用户明确要求搜索或查找信息

搜索时使用简洁明确的关键词，返回结果后综合整理回答用户。
根据问题的时效性选择 timeRange：
- OneDay：今天、现在、实时行情、突发新闻、正在发生的事件
- OneWeek：本周、最近几天、近期发布、短期事件进展
- OneMonth：默认范围，适合最新版本、近期政策、产品动态、招聘、常规现状确认
- OneYear：年度趋势、生态调研、较稳定但可能变化的技术资料、历史回顾
如用户明确指定时间范围，优先按用户要求选择最接近的 timeRange；结果不足时可以扩大时间范围后再次搜索。
</web_search_instructions>`,
}

// ===== 工具定义（ToolDefinition 格式，传给 Provider） =====

export const WEB_SEARCH_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'web_search',
    description: 'Search the internet for real-time information. Use this when the user asks about current events, recent data, or information you are unsure about.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query string' },
        timeRange: {
          type: 'string',
          description: 'Search time range. Choose by content freshness: OneDay for today/live/breaking updates, OneWeek for recent days, OneMonth for default current facts and releases, OneYear for trends or stable-but-changing research. Broaden if results are insufficient.',
          enum: [...WEB_SEARCH_TIME_RANGE_VALUES],
        },
      },
      required: ['query'],
    },
  },
]

// ===== 可用性检查 =====

/**
 * 获取内置搜索服务 API Key。
 *
 * 数智中台搜索服务由内部系统分配固定凭据，用户只需要控制开关。
 */
export function getBuiltinWebSearchApiKey(): string {
  return COMPASS_API_KEY
}

/**
 * 检查搜索工具是否可用。
 */
export function isWebSearchAvailable(): boolean {
  return true
}

// ===== 工具执行 =====

/** 搜索工具名称集合 */
const WEB_SEARCH_TOOL_NAMES = new Set(['web_search'])

/**
 * 判断是否为搜索工具调用
 */
export function isWebSearchToolCall(toolName: string): boolean {
  return WEB_SEARCH_TOOL_NAMES.has(toolName)
}

/** 数智中台搜索结果（内部标准化结构） */
interface CompassSearchResult {
  title: string
  url: string
  content?: string
}

interface CompassSearchRequest {
  url: string
  init: RequestInit
}

interface WebSearchResponse {
  ok: boolean
  status: number
  text(): Promise<string>
  json(): Promise<unknown>
}

type WebSearchFetch = (input: string, init: RequestInit) => Promise<WebSearchResponse>

export interface WebSearchConnectionTestResult {
  success: boolean
  message: string
  details?: string
}

const WEB_SEARCH_DIRECT_DISPATCHER = new Agent()

/**
 * 创建联网搜索专用 fetch。
 *
 * web_search 访问的是内网数智中台服务，必须显式直连，避免复用全局 fetch
 * 或全局 dispatcher 上的代理配置导致请求被转发到外部代理后不可达。
 */
export function createNoProxyWebSearchFetch(): WebSearchFetch {
  return async (input, init) => {
    return undiciFetch(input as UndiciRequestInfo, {
      ...(init as UndiciRequestInit | undefined),
      dispatcher: WEB_SEARCH_DIRECT_DISPATCHER,
    }) as Promise<UndiciResponse>
  }
}

const noProxyWebSearchFetch = createNoProxyWebSearchFetch()

function formatNetworkError(error: unknown, depth = 0): string {
  if (depth > 3) return String(error)
  if (!isRecord(error)) return error instanceof Error ? error.message : String(error)

  const message = error instanceof Error
    ? error.message
    : typeof error.message === 'string'
      ? error.message
      : String(error)

  const fields = ['code', 'errno', 'syscall', 'address', 'port', 'hostname']
    .map((key) => {
      const value = error[key]
      if (typeof value !== 'string' && typeof value !== 'number') return null
      return `${key}=${value}`
    })
    .filter((item): item is string => item !== null)

  const cause = error.cause
  const suffixParts: string[] = []
  if (fields.length > 0) suffixParts.push(fields.join(', '))
  if (cause) suffixParts.push(`cause: ${formatNetworkError(cause, depth + 1)}`)

  if (suffixParts.length === 0) return message
  return `${message} (${suffixParts.join('; ')})`
}

export function testWebSearchConnection(fetchFn?: WebSearchFetch): Promise<WebSearchConnectionTestResult>
export function testWebSearchConnection(query?: string, fetchFn?: WebSearchFetch): Promise<WebSearchConnectionTestResult>
export function testWebSearchConnection(query?: string, options?: WebSearchOptions, fetchFn?: WebSearchFetch): Promise<WebSearchConnectionTestResult>
export async function testWebSearchConnection(
  queryOrFetch?: string | WebSearchFetch,
  optionsOrFetch?: WebSearchOptions | WebSearchFetch,
  maybeFetchFn?: WebSearchFetch,
): Promise<WebSearchConnectionTestResult> {
  const query = typeof queryOrFetch === 'string' ? queryOrFetch.trim() : ''
  const fetchFn = typeof queryOrFetch === 'function'
    ? queryOrFetch
    : typeof optionsOrFetch === 'function'
      ? optionsOrFetch
      : maybeFetchFn ?? noProxyWebSearchFetch
  const options = typeof optionsOrFetch === 'object' && optionsOrFetch !== null
    ? optionsOrFetch
    : undefined

  try {
    const request = buildCompassSearchRequest(query || 'test connection', getBuiltinWebSearchApiKey(), options)
    const response = await fetchFn(request.url, request.init)
    if (!response.ok) {
      const errorText = await response.text()
      return { success: false, message: `API 请求失败 (${response.status}): ${errorText}` }
    }

    if (query) {
      const data = await response.json() as unknown
      const results = parseCompassSearchResponse(data)
      if (results.length === 0) {
        return {
          success: false,
          message: `连接成功，但关键词「${query}」未找到相关结果`,
          details: '接口已正常返回，请换一个更具体或更常见的关键词重试。',
        }
      }
      return {
        success: true,
        message: `搜索成功，返回 ${results.length} 条结果`,
        details: formatCompassSearchResults(results),
      }
    }

    return { success: true, message: '连接成功，数智中台搜索 API 可用' }
  } catch (error) {
    const msg = formatNetworkError(error)
    return { success: false, message: `连接失败: ${msg}` }
  }
}

/**
 * 构造数智中台搜索请求。
 */
export function buildCompassSearchRequest(
  query: string,
  apiKey: string,
  options: WebSearchOptions & { appId?: string; endpoint?: string } = {},
): CompassSearchRequest {
  const appId = options.appId ?? COMPASS_APP_ID
  const endpoint = options.endpoint ?? COMPASS_SEARCH_ENDPOINT
  const timeRange = normalizeWebSearchTimeRange(options.timeRange)

  return {
    url: endpoint,
    init: {
      method: 'POST',
      headers: {
        apiKey,
        appId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        SearchType: 'web',
        count: 10,
        Filter: {
          NeedContent: false,
          NeedUrl: true,
          Sites: null,
          AuthInfoLevel: '0',
        },
        NeedSummary: false,
        TimeRange: timeRange,
      }),
    },
  }
}

function normalizeWebSearchTimeRange(value: unknown): WebSearchTimeRange {
  return WEB_SEARCH_TIME_RANGE_VALUES.includes(value as WebSearchTimeRange)
    ? value as WebSearchTimeRange
    : DEFAULT_WEB_SEARCH_TIME_RANGE
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return undefined
}

function getNestedValue(record: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.')
  let current: unknown = record

  for (const part of parts) {
    if (!isRecord(current)) return undefined
    current = current[part]
  }

  return current
}

function readNumberFromPaths(data: unknown, paths: string[]): number | undefined {
  if (!isRecord(data)) return undefined
  for (const path of paths) {
    const value = getNestedValue(data, path)
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim()) {
      const numeric = Number(value)
      if (Number.isFinite(numeric)) return numeric
    }
  }
  return undefined
}

function previewLogText(value: string | undefined, maxLength = 220): string | undefined {
  if (!value) return undefined
  const compact = value.replace(/\s+/g, ' ').trim()
  if (compact.length <= maxLength) return compact
  return `${compact.slice(0, maxLength)}...`
}

function getCompassResponseResultCount(data: unknown): number | undefined {
  return readNumberFromPaths(data, [
    'result.resultCount',
    'result.count',
    'result.total',
    'data.resultCount',
    'data.count',
    'data.total',
    'resultCount',
    'count',
    'total',
  ])
}

function logWebSearchRequest(query: string, timeRange: WebSearchTimeRange, endpoint: string): void {
  console.info('[联网搜索] 请求', {
    query,
    timeRange,
    endpoint,
  })
}

function logWebSearchHttpError(query: string, timeRange: WebSearchTimeRange, status: number, errorText: string): void {
  console.warn('[联网搜索] 请求失败', {
    query,
    timeRange,
    status,
    errorText: previewLogText(errorText),
  })
}

function logWebSearchResponse(
  query: string,
  timeRange: WebSearchTimeRange,
  status: number,
  data: unknown,
  results: CompassSearchResult[],
): void {
  console.info('[联网搜索] 返回', {
    query,
    timeRange,
    status,
    resultCount: getCompassResponseResultCount(data) ?? results.length,
    parsedCount: results.length,
    summaries: results.slice(0, 5).map((result) => ({
      title: result.title,
      url: result.url,
      summary: previewLogText(result.content),
    })),
  })
}

function findResultArray(data: unknown): unknown[] {
  if (Array.isArray(data)) return data
  if (!isRecord(data)) return []

  const paths = [
    'data.results',
    'data.list',
    'data.items',
    'data.records',
    'data.webResults',
    'result.webResults',
    'result.results',
    'result.list',
    'result.items',
    'result.records',
    'webResults',
    'results',
    'list',
    'items',
    'records',
    'Result',
    'Data.Results',
  ]

  for (const path of paths) {
    const value = getNestedValue(data, path)
    if (Array.isArray(value)) return value
  }

  for (const value of Object.values(data)) {
    if (!Array.isArray(value)) continue
    if (value.some((item) => isRecord(item))) {
      return value
    }
  }

  return []
}

/**
 * 解析数智中台搜索响应。
 *
 * 服务响应字段暂未固定在代码里，因此这里兼容常见的 results/list/items
 * 以及 title/url/snippet/content 等字段，降低服务字段微调带来的影响。
 */
export function parseCompassSearchResponse(data: unknown): CompassSearchResult[] {
  return findResultArray(data)
    .filter(isRecord)
    .map((item) => {
      const url = readString(item, ['url', 'URL', 'Url', 'link', 'Link', 'sourceUrl', 'source_url']) ?? ''
      const title = readString(item, ['title', 'Title', 'name', 'Name']) ?? url
      const content = readString(item, ['content', 'Content', 'summary', 'Summary', 'snippet', 'Snippet', 'description', 'Description', 'abstract', 'Abstract'])
      return { title, url, content }
    })
    .filter((item) => item.title || item.url)
}

/**
 * 格式化搜索结果为 LLM 可读文本。
 */
export function formatCompassSearchResults(results: CompassSearchResult[]): string {
  if (results.length === 0) return '未找到相关结果。'

  const parts = ['**搜索结果：**']
  for (const result of results) {
    const title = result.title || result.url
    if (result.url) {
      parts.push(`- [${title}](${result.url})`)
    } else {
      parts.push(`- ${title}`)
    }

    if (result.content) {
      parts.push(`  ${result.content.slice(0, 300)}`)
    }
    parts.push('')
  }

  return parts.join('\n').trim()
}

/**
 * 执行联网搜索工具调用。
 */
export async function executeWebSearchTool(
  toolCall: ToolCall,
  fetchFn: WebSearchFetch = noProxyWebSearchFetch,
): Promise<ToolResult> {
  try {
    const query = toolCall.arguments.query as string | undefined
    const timeRange = normalizeWebSearchTimeRange(toolCall.arguments.timeRange)

    if (!query) {
      return {
        toolCallId: toolCall.id,
        content: '搜索参数缺失: query',
        isError: true,
      }
    }

    const request = buildCompassSearchRequest(query, getBuiltinWebSearchApiKey(), { timeRange })
    logWebSearchRequest(query, timeRange, request.url)
    const response = await fetchFn(request.url, request.init)

    if (!response.ok) {
      const errorText = await response.text()
      logWebSearchHttpError(query, timeRange, response.status, errorText)
      return {
        toolCallId: toolCall.id,
        content: `搜索请求失败 (${response.status}): ${errorText}`,
        isError: true,
      }
    }

    const data = await response.json() as unknown
    const results = parseCompassSearchResponse(data)
    logWebSearchResponse(query, timeRange, response.status, data, results)
    return {
      toolCallId: toolCall.id,
      content: formatCompassSearchResults(results),
    }
  } catch (error) {
    const msg = formatNetworkError(error)
    console.error('[联网搜索] 执行失败:', error)
    return {
      toolCallId: toolCall.id,
      content: `搜索失败: ${msg}`,
      isError: true,
    }
  }
}
