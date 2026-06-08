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
 *
 * 这是所有与 WorkMate Server / EIP 网关通信的统一入口。
 * 内部已自动处理以下细节，调用方无需关心：
 *
 * 1. **身份注入**：自动读取 `auth-service.getToken()` 并以 `Cookie: EIPGW-TOKEN=<jwt>`
 *    形式注入请求头；未登录时 Cookie 字段会被省略（不会发空值）。
 * 2. **方法路由**：
 *    - `GET` / `DELETE`：把 `options.params` 拼到 URL 查询串上，`body` 字段会被忽略。
 *    - `POST` / `PUT` / `PATCH`：把 `options.body` 序列化为 JSON 请求体；如未提供 `body`
 *      但有 `params`，则将 `params` 作为请求体（兜底）。
 * 3. **超时控制**：默认 10s 超时，可通过 `timeoutMs` 覆盖；若外部同时传 `signal`，
 *    两者会合并，任一触发即中止请求。
 * 4. **响应解析**：自动 `await response.json()`，非 JSON 响应降级为 `null`。
 * 5. **错误归一化**：不抛异常。网络错（超时 / DNS / 断网等）→ `status=0, ok=false`；
 *    HTTP 4xx/5xx → `status=4xx/5xx, ok=false`；2xx → `status=2xx, ok=true`。
 *
 * 通常**优先使用便捷方法** `httpGet` / `httpPost` / `httpPut` / `httpDelete`，
 * 仅在需要更细控制（如自定义 method 字符串）时才直接调用 `httpRequest`。
 *
 * @typeParam T - 期望的响应数据类型（已被 JSON.parse 后的对象）
 * @param url - 完整请求 URL（如 `${serverUrl}/workmate/models`）。无需手动拼查询参数。
 * @param options - 请求配置
 * @returns `HttpResponse<T>`：通过 `status` / `ok` / `data` / `error` 字段判断结果
 *
 * @example 基础 GET 请求（最常见用法）
 * ```ts
 * import { httpGet } from '@app/shared/hteip-client'
 *
 * const res = await httpGet<{ code: number; data: ModelListResponse }>(
 *   `${serverUrl}/workmate/models`,
 * )
 * if (res.ok && res.data?.code === 0) {
 *   console.log('模型列表:', res.data.data)
 * }
 * ```
 *
 * @example POST 请求，提交 JSON body
 * ```ts
 * import { httpPost } from '@app/shared/hteip-client'
 *
 * const res = await httpPost(`${serverUrl}/workmate/observability/events`, {
 *   body: { events: [...] },
 *   timeoutMs: 5000,
 * })
 * if (!res.ok) {
 *   console.warn('[观测上报] 失败 status=%d err=%s', res.status, res.error)
 * }
 * ```
 *
 * @example 携带额外请求头 + AbortSignal 取消
 * ```ts
 * const controller = new AbortController()
 * setTimeout(() => controller.abort(), 3000)
 *
 * const res = await httpPost(`${serverUrl}/workmate/chat/completions`, {
 *   body: { prompt: 'hi' },
 *   headers: { 'X-Trace-Id': traceId },
 *   signal: controller.signal,
 * })
 * ```
 *
 * @example 错误处理的标准模式
 * ```ts
 * const res = await httpGet<UserInfo>(`${serverUrl}/workmate/users/me`)
 * if (res.status === 0) {
 *   // 网络层失败：超时 / DNS / 断网 / abort
 *   console.error('网络异常:', res.error)
 * } else if (!res.ok) {
 *   // 服务端返回 4xx / 5xx
 *   console.error('服务端错误 status=%d', res.status)
 * } else {
 *   // res.data 可能是 null（响应体不是合法 JSON）
 *   const user = res.data
 * }
 * ```
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
