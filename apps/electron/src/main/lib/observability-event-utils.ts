import { safeStringify } from './utils/safe-stringify'
import type { ObservabilityEventItem } from '../../types/workmate'

const STRING_LIMITS = {
  question: 8_000,
  errorMessage: 4_000,
  errorStack: 16_000,
  tagValue: 1_000,
  breadcrumbMessage: 1_000,
  breadcrumbDataValue: 1_000,
}

function truncateString(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength)}...[truncated]`
}

function normalizeTags(tags: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!tags) return undefined
  const normalized: Record<string, string> = {}
  for (const [key, value] of Object.entries(tags)) {
    normalized[truncateString(key, 64)] = truncateString(value, STRING_LIMITS.tagValue)
  }
  return normalized
}

export function normalizeObservabilityEvent(event: ObservabilityEventItem): ObservabilityEventItem {
  return {
    ...event,
    question: event.question ? truncateString(event.question, STRING_LIMITS.question) : event.question,
    error: event.error ? {
      ...event.error,
      message: truncateString(event.error.message, STRING_LIMITS.errorMessage),
      stack: event.error.stack ? truncateString(event.error.stack, STRING_LIMITS.errorStack) : event.error.stack,
    } : event.error,
    tags: normalizeTags(event.tags),
    breadcrumbs: event.breadcrumbs?.map((breadcrumb) => ({
      ...breadcrumb,
      message: truncateString(breadcrumb.message, STRING_LIMITS.breadcrumbMessage),
      data: breadcrumb.data ? Object.fromEntries(
        Object.entries(breadcrumb.data).map(([key, value]) => [
          truncateString(key, 64),
          typeof value === 'string' ? truncateString(value, STRING_LIMITS.breadcrumbDataValue) : value,
        ]),
      ) : breadcrumb.data,
    })),
  }
}

export function getSerializedEventBytes(event: ObservabilityEventItem): number {
  return Buffer.byteLength(JSON.stringify(event), 'utf8')
}

export function upsertDiskCacheContent(existingContent: string, batch: ObservabilityEventItem[]): string {
  const events: ObservabilityEventItem[] = []
  const seen = new Set<string>()

  for (const line of existingContent.split('\n').filter(Boolean)) {
    try {
      const event = JSON.parse(line) as ObservabilityEventItem
      if (!event.eventId || seen.has(event.eventId)) continue
      seen.add(event.eventId)
      events.push(event)
    } catch {
      // 单行损坏忽略
    }
  }

  for (const event of batch) {
    if (seen.has(event.eventId)) continue
    seen.add(event.eventId)
    events.push(event)
  }

  return events.length > 0 ? `${events.map((event) => safeStringify(event)).join('\n')}\n` : ''
}
