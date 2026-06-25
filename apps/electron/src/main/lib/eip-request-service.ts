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
  const response = await httpRequest(input.path, {
    method: input.method,
    query: input.query,
    body: input.body,
    headers: input.headers,
    timeoutMs: input.timeoutMs,
  })

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
}
