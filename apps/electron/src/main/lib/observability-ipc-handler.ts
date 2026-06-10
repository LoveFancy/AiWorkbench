export interface NormalizedRendererErrorPayload {
  name: string
  message: string
  stack?: string
  componentStack?: string
}

const LIMITS = {
  name: 128,
  message: 4_000,
  stack: 16_000,
  componentStack: 4_000,
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength)}...[truncated]`
}

export function normalizeRendererErrorPayload(payload: unknown): NormalizedRendererErrorPayload | null {
  if (!payload || typeof payload !== 'object') return null

  const record = payload as Record<string, unknown>
  if (typeof record.message !== 'string' || record.message.length === 0) return null

  const normalized: NormalizedRendererErrorPayload = {
    name: typeof record.name === 'string' && record.name.length > 0
      ? truncate(record.name, LIMITS.name)
      : 'RendererError',
    message: truncate(record.message, LIMITS.message),
  }

  if (typeof record.stack === 'string' && record.stack.length > 0) {
    normalized.stack = truncate(record.stack, LIMITS.stack)
  }
  if (typeof record.componentStack === 'string' && record.componentStack.length > 0) {
    normalized.componentStack = truncate(record.componentStack, LIMITS.componentStack)
  }

  return normalized
}
