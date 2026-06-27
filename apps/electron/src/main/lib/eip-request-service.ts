import { httpRequest, type HttpResponse } from '../../shared/hteip-client'

export interface EipRequestInput {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  path: string
  query?: Record<string, string | number | boolean>
  body?: unknown
  headers?: Record<string, string>
  timeoutMs?: number
  resultPath?: string
}

const SENSITIVE_HEADER_NAMES = new Set([
  'authorization',
  'cookie',
  'proxy-authorization',
  'set-cookie',
  'x-csrf-token',
])

const ALLOWED_EIP_ORIGINS = new Set([
  'http://eip.htsc.com.cn',
  'https://eip.htsc.com.cn',
])

const EIP_REQUEST_MIN_INTERVAL_MS = 1000

let lastRequestStartedAt = 0
let requestQueue: Promise<void> = Promise.resolve()

async function sleep(ms: number): Promise<void> {
  if (ms <= 0) return
  await new Promise<void>((resolve) => setTimeout(resolve, ms))
}

async function runWithRateLimit<T>(operation: () => Promise<T>): Promise<T> {
  const previous = requestQueue
  let releaseQueue: () => void = () => {}
  requestQueue = new Promise<void>((resolve) => {
    releaseQueue = resolve
  })

  await previous

  try {
    const now = Date.now()
    const waitMs = EIP_REQUEST_MIN_INTERVAL_MS - (now - lastRequestStartedAt)
    if (waitMs > 0) {
      console.log('[EIP 请求] 触发限流，等待 %dms 后继续', waitMs)
      await sleep(waitMs)
    }

    lastRequestStartedAt = Date.now()
    return await operation()
  } finally {
    releaseQueue()
  }
}

function assertSafePath(path: string): void {
  if (!path.trim()) throw new Error('path 不能为空')

  if (path.startsWith('http://') || path.startsWith('https://')) {
    const url = new URL(path)
    if (!ALLOWED_EIP_ORIGINS.has(url.origin)) {
      throw new Error(`不允许请求非 EIP 域名: ${url.origin}`)
    }
    return
  }

  if (!path.startsWith('/') || path.startsWith('//')) {
    throw new Error('path 必须是以 / 开头的相对路径，或允许的 EIP 完整 URL')
  }
}

function assertSafeHeaders(headers?: Record<string, string>): void {
  if (!headers) return

  for (const key of Object.keys(headers)) {
    if (SENSITIVE_HEADER_NAMES.has(key.toLowerCase())) {
      throw new Error(`禁止通过 eip_request 传入敏感请求头: ${key}`)
    }
  }
}

function extractByPath(data: unknown, path?: string): unknown {
  if (!path?.trim()) return data

  const parts = path.split('.').filter(Boolean)
  let current = data
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

export async function executeEipRequest(input: EipRequestInput): Promise<HttpResponse> {
  assertSafePath(input.path)
  assertSafeHeaders(input.headers)

  console.log('[EIP 请求] %s %s', input.method, input.path)
  const response = await runWithRateLimit(() =>
    httpRequest(input.path, {
      method: input.method,
      query: input.query,
      body: input.body,
      headers: input.headers,
      timeoutMs: input.timeoutMs,
    }),
  )

  if (!response.ok || !input.resultPath) return response

  return {
    ...response,
    data: extractByPath(response.data, input.resultPath),
  }
}

export const __eipRequestServiceTest = {
  assertSafePath,
  assertSafeHeaders,
  extractByPath,
  resetRateLimitForTest: () => {
    lastRequestStartedAt = 0
    requestQueue = Promise.resolve()
  },
}
