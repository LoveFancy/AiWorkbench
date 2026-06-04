import apiClient from './client'

export interface ObservabilityEvent {
  id: number
  eventId: string | null
  userId: string
  userName: string | null
  eventType: string
  question: string | null
  questionLength: number | null
  modelId: string | null
  channelId: string | null
  sessionId: string | null
  result: string | null
  responseDurationMs: number | null
  errorType: string | null
  errorMessage: string | null
  errorFingerprint: string | null
  errorStatusCode: number | null
  clientVersion: string
  clientPlatform: string
  clientOsVersion: string | null
  createdAt: string
}

export interface EventStats {
  totalEvents: number
  errorEvents: number
  errorRate: number
  topErrors: Array<{ fingerprint: string; count: number }>
}

export function fetchEvents(params: {
  page: number
  pageSize: number
  eventType?: string
  userId?: string
  startDate?: string
  endDate?: string
  clientVersion?: string
  errorFingerprint?: string
}): Promise<{ data: { total: number; events: ObservabilityEvent[] } }> {
  return apiClient.get('/observability/events', { params })
}

export function fetchEventStats(params: {
  startDate?: string
  endDate?: string
}): Promise<{ data: EventStats }> {
  return apiClient.get('/observability/stats', { params })
}