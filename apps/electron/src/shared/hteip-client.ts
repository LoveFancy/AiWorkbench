/* ------------------------------------------------------------------ */
/*  hteip-client  —  WorkMate 网关统一 HTTP 客户端                     */
/*                                                                     */
/*  职责：                                                              */
/*    1. URL 域名自动拼接（路径 → `${apiBase}${path}`）                 */
/*    2. Cookie 自动注入（EIPGW-TOKEN）                                 */
/*    3. 超时控制 + AbortSignal 合并                                    */
/*    4. 响应 JSON 解析 + 错误归一化（不抛异常）                        */
/*    5. 文件上传（multipart/form-data）                                */
/* ------------------------------------------------------------------ */

import { getToken, getEipGatewayBase } from '../auth'

// ============================================================================
// 1. URL 解析
// ============================================================================

/** 模块级缓存：去掉 /gateway 后的 EIP 网关 host */
let _apiBase: string | null = null

/** 获取网关 host，惰性求值（首次调用后缓存） */
export function resolveApiBase(): string {
  if (_apiBase !== null) return _apiBase
  _apiBase = getEipGatewayBase().replace(/\/gateway\/?$/, '')
  return _apiBase
}

/**
 * 解析请求 URL：
 *   `http(s)://...` → 完整 URL，原样透传
 *   其他             → 视为路径，拼接 `${apiBase}${path}`
 */
function resolveUrl(urlOrPath: string): string {
  return urlOrPath.startsWith('http://') || urlOrPath.startsWith('https://')
    ? urlOrPath
    : `${resolveApiBase()}${urlOrPath}`
}

/** 重置缓存（仅测试用） */
export function resetApiBaseForTest(): void {
  _apiBase = null
}

// ============================================================================
// 2. 公开类型
// ============================================================================

export interface HttpRequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  /** 查询参数（GET/DELETE → 拼 URL；POST/PUT/PATCH → 兜底 body） */
  params?: Record<string, string | number | boolean>
  /** 请求体（POST/PUT/PATCH 时序列化为 JSON） */
  body?: unknown
  /** 额外请求头（会与 Cookie 合并） */
  headers?: Record<string, string>
  /** 超时毫秒，默认 10_000 */
  timeoutMs?: number
  /** 外部取消信号 */
  signal?: AbortSignal
}

export interface HttpUploadOptions {
  /** FormData（含文件和附加字段） */
  formData: FormData
  /** 额外请求头（不含 Content-Type，浏览器自动设 multipart boundary） */
  headers?: Record<string, string>
  /** 超时毫秒，默认 30_000 */
  timeoutMs?: number
  /** 外部取消信号 */
  signal?: AbortSignal
}

export interface HttpResponse<T = unknown> {
  status: number      // HTTP 状态码，网络错误时为 0
  ok: boolean         // 2xx
  data: T | null      // JSON 解析结果
  error?: string      // 错误描述
}

const DEFAULT_TIMEOUT_MS = 10_000
const DEFAULT_UPLOAD_TIMEOUT_MS = 30_000

// ============================================================================
// 3. 内部工具
// ============================================================================

function buildUrl(
  url: string,
  method: string,
  params?: Record<string, string | number | boolean>,
): string {
  if (!params) return url
  if (method !== 'GET' && method !== 'DELETE') return url

  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) qs.set(k, String(v))

  const qsStr = qs.toString()
  if (!qsStr) return url
  return `${url}${url.includes('?') ? '&' : '?'}${qsStr}`
}

function buildAuthCookie(): Record<string, string> {
  const token = getToken()
  return token ? { 'Cookie': `EIPGW-TOKEN=${token}` } : {}
}

function combineSignals(s1: AbortSignal, s2: AbortSignal): AbortSignal {
  const ctrl = new AbortController()
  const abort = () => ctrl.abort()
  s1.addEventListener('abort', abort)
  s2.addEventListener('abort', abort)
  if (s1.aborted || s2.aborted) ctrl.abort()
  return ctrl.signal
}

function toHttpResponse<T>(res: Response, data: T | null): HttpResponse<T> {
  return { status: res.status, ok: res.ok, data }
}

function toErrorResponse(error: unknown): HttpResponse<never> {
  const err = error instanceof Error ? error : new Error(String(error))
  const message = err.name === 'AbortError' ? '请求超时' : err.message
  return { status: 0, ok: false, data: null, error: message }
}

/**
 * 为 fetch 提供超时 + 外部信号合并的能力。
 * @returns { signal, clear } — 调用方在 finally 中调用 clear
 */
function withTimeout(timeoutMs: number, externalSignal?: AbortSignal) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)

  const signal = externalSignal
    ? combineSignals(externalSignal, ctrl.signal)
    : ctrl.signal

  return { signal, clear: () => clearTimeout(timer) }
}

// ============================================================================
// 4. JSON API 请求
// ============================================================================

/**
 * 通用 JSON API 请求 — 底层实现。
 *
 * 自动：拼接域名、注入 Cookie、序列化 body、JSON 解析、超时控制。
 * 通常使用便捷方法 httpGet / httpPost / httpPut / httpDelete。
 *
 * @example
 * // 路径模式 → 自动拼接网关域名
 * httpGet('/workmate/models')
 *
 * // 完整 URL 模式 → 原样透传
 * httpGet('http://localhost:6173/workmate/models')
 */
export async function httpRequest<T = unknown>(
  urlOrPath: string,
  opts: HttpRequestOptions,
): Promise<HttpResponse<T>> {
  const { method, params, body, headers: extra, timeoutMs, signal: extSignal } = opts

  const fullUrl = buildUrl(resolveUrl(urlOrPath), method, params)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...buildAuthCookie(),
    ...extra,
  }
  const reqBody = (method === 'POST' || method === 'PUT' || method === 'PATCH')
    ? JSON.stringify(body ?? params)
    : undefined

  const { signal, clear } = withTimeout(timeoutMs ?? DEFAULT_TIMEOUT_MS, extSignal)

  try {
    const res = await fetch(fullUrl, { method, headers, body: reqBody, signal })
    const data = await res.json().catch(() => null)
    return toHttpResponse(res, data as T)
  } catch (err) {
    return toErrorResponse(err)
  } finally {
    clear()
  }
}

export function httpGet<T = unknown>(
  urlOrPath: string,
  opts?: Omit<HttpRequestOptions, 'method'>,
): Promise<HttpResponse<T>> {
  return httpRequest<T>(urlOrPath, { ...opts, method: 'GET' })
}

export function httpPost<T = unknown>(
  urlOrPath: string,
  opts?: Omit<HttpRequestOptions, 'method'>,
): Promise<HttpResponse<T>> {
  return httpRequest<T>(urlOrPath, { ...opts, method: 'POST' })
}

export function httpPut<T = unknown>(
  urlOrPath: string,
  opts?: Omit<HttpRequestOptions, 'method'>,
): Promise<HttpResponse<T>> {
  return httpRequest<T>(urlOrPath, { ...opts, method: 'PUT' })
}

export function httpDelete<T = unknown>(
  urlOrPath: string,
  opts?: Omit<HttpRequestOptions, 'method'>,
): Promise<HttpResponse<T>> {
  return httpRequest<T>(urlOrPath, { ...opts, method: 'DELETE' })
}

// ============================================================================
// 5. 文件上传
// ============================================================================

/**
 * multipart/form-data 文件上传。
 *
 * 与 httpPost 的区别：不设 Content-Type、不序列化 body，直接传 FormData。
 * Cookie 注入、超时控制、错误归一化与 JSON 请求完全一致。
 *
 * @example
 * const fd = new FormData()
 * fd.append('file', new Blob([buf], { type: 'application/zip' }), 'log.zip')
 * fd.append('userId', '022480')
 * const res = await httpUpload('/workmate/console/logs/upload', { formData: fd })
 */
export async function httpUpload<T = unknown>(
  urlOrPath: string,
  opts: HttpUploadOptions,
): Promise<HttpResponse<T>> {
  const { formData, headers: extra, timeoutMs, signal: extSignal } = opts

  const headers: Record<string, string> = {
    ...buildAuthCookie(),
    ...extra,
  }

  const { signal, clear } = withTimeout(timeoutMs ?? DEFAULT_UPLOAD_TIMEOUT_MS, extSignal)

  try {
    const res = await fetch(resolveUrl(urlOrPath), {
      method: 'POST',
      headers,
      body: formData,
      signal,
    })
    const data = await res.json().catch(() => null)
    return toHttpResponse(res, data as T)
  } catch (err) {
    return toErrorResponse(err)
  } finally {
    clear()
  }
}
