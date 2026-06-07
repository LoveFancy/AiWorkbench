import apiClient from './client'

export interface ObservabilityEvent {
  id: number
  eventId: string | null
  userId: string
  eventType: string
  questionLength: number | null
  modelId: string | null
  channelId: string | null
  sessionId: string | null
  workspaceId: string | null
  result: string | null
  responseDurationMs: number | null
  clientVersion: string
  clientPlatform: string
  clientOsVersion: string | null
  createdAt: string
}

export interface ObservabilityError {
  id: number
  eventId: string | null
  userId: string
  sessionId: string | null
  workspaceId: string | null
  errorType: string | null
  errorMessage: string | null
  errorStack: string | null
  errorFingerprint: string | null
  errorStatusCode: number | null
  breadcrumbs: string | null
  tags: string | null
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

/** 管理台：查询业务事件（按年） */
export function fetchEvents(params: {
  page: number
  pageSize: number
  eventType?: string
  userId?: string
  year: number
  clientVersion?: string
}): Promise<{ data: { total: number; events: ObservabilityEvent[] } }> {
  return apiClient.get('/observability/events', { params })
}

/** 管理台：查询异常事件（按年） */
export function fetchErrors(params: {
  page: number
  pageSize: number
  userId?: string
  year: number
  clientVersion?: string
  errorFingerprint?: string
}): Promise<{ data: { total: number; errors: ObservabilityError[] } }> {
  return apiClient.get('/observability/errors', { params })
}

/** 管理台：观测统计概览 */
export function fetchEventStats(params: {
  year?: number
}): Promise<{ data: EventStats }> {
  return apiClient.get('/observability/stats', { params })
}
