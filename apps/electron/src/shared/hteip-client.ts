import { getToken } from '../auth'

export interface HttpRequestOptions {
  /** HTTP 方法 */
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  /**
   * 查询参数（自动拼接到 URL 上）
   * 仅对 GET/DELETE 生效，POST/PUT/PATCH 会放入 body
   */
  params?: Record<string, string | number | boolean>
  /**
   * 请求体（POST/PUT/PATCH 时使用）
   * 若同时提供 params 和 body，POST/PUT 使用 body 作为请求体，
   * params 拼接到 URL
   */
  body?: unknown
  /** 额外请求头（会与 Cookie 合并） */
  headers?: Record<string, string>
  /** 超时时间（毫秒），默认 10_000 */
  timeoutMs?: number
  /** 信号（用于外部取消） */
  signal?: AbortSignal
}

export interface HttpResponse<T = unknown> {
  /** HTTP 状态码，网络错误时为 0 */
  status: number
  /** 是否成功（2xx） */
  ok: boolean
  /** 响应体（已 JSON 解析） */
  data: T | null
  /** 错误信息 */
  error?: string
}

const DEFAULT_TIMEOUT_MS = 10_000

/**
 * 发起 HTTP 请求，自动注入 EIPGW-TOKEN Cookie。
 */
export async function httpRequest<T = unknown>(
  url: string,
  options: HttpRequestOptions,
): Promise<HttpResponse<T>> {
  const { method, params, body, headers: extraHeaders, timeoutMs, signal } = options
  const timeout = timeoutMs ?? DEFAULT_TIMEOUT_MS

  // 1. 构建完整 URL（拼接查询参数）
  const fullUrl = buildUrl(url, method, params)

  // 2. 构建请求头（自动注入 Cookie）
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...buildAuthCookie(),
    ...extraHeaders,
  }

  // 3. 构建请求体
  const requestBody = (method === 'POST' || method === 'PUT' || method === 'PATCH')
    ? JSON.stringify(body ?? params)
    : undefined

  // 4. 发起请求
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    const combinedSignal = signal
      ? combineSignals(signal, controller.signal)
      : controller.signal

    const response = await fetch(fullUrl, {
      method,
      headers,
      body: requestBody,
      signal: combinedSignal,
    })

    clearTimeout(timeoutId)

    const data = await response.json().catch(() => null)

    return {
      status: response.status,
      ok: response.ok,
      data: data as T,
    }
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))
    if (error.name === 'AbortError') {
      return { status: 0, ok: false, data: null, error: '请求超时' }
    }
    return { status: 0, ok: false, data: null, error: error.message }
  }
}

export function httpGet<T = unknown>(
  url: string,
  options?: Omit<HttpRequestOptions, 'method'>,
): Promise<HttpResponse<T>> {
  return httpRequest<T>(url, { ...options, method: 'GET' })
}

export function httpPost<T = unknown>(
  url: string,
  options?: Omit<HttpRequestOptions, 'method'>,
): Promise<HttpResponse<T>> {
  return httpRequest<T>(url, { ...options, method: 'POST' })
}

export function httpPut<T = unknown>(
  url: string,
  options?: Omit<HttpRequestOptions, 'method'>,
): Promise<HttpResponse<T>> {
  return httpRequest<T>(url, { ...options, method: 'PUT' })
}

export function httpDelete<T = unknown>(
  url: string,
  options?: Omit<HttpRequestOptions, 'method'>,
): Promise<HttpResponse<T>> {
  return httpRequest<T>(url, { ...options, method: 'DELETE' })
}

// ---- 内部工具 ----

function buildUrl(
  url: string,
  method: string,
  params?: Record<string, string | number | boolean>,
): string {
  if (!params) return url

  const isReadMethod = method === 'GET' || method === 'DELETE'
  if (!isReadMethod) return url

  const searchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    searchParams.set(key, String(value))
  }
  const qs = searchParams.toString()
  if (!qs) return url

  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}${qs}`
}

function buildAuthCookie(): Record<string, string> {
  const token = getToken()
  if (token) {
    return { 'Cookie': `EIPGW-TOKEN=${token}` }
  }
  return {}
}

function combineSignals(s1: AbortSignal, s2: AbortSignal): AbortSignal {
  const controller = new AbortController()
  const onAbort = () => controller.abort()
  s1.addEventListener('abort', onAbort)
  s2.addEventListener('abort', onAbort)
  if (s1.aborted || s2.aborted) controller.abort()
  return controller.signal
}
