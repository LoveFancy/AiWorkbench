// ===== 升级相关类型 =====

export type RuleType = 'list' | 'range' | 'prefix' | 'suffix'

export type ReleaseType = 'UPGRADE' | 'ROLLBACK'

export type StrategyStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'FINISHED'

// ===== 观测事件类型 =====

export type ObservabilityEventType =
  | 'user_login'
  | 'user_logout'
  | 'chat_question'
  | 'agent_question'
  | 'error'
  | 'upgrade_check'

export interface ObservabilityEventDTO {
  eventId?: string
  type: ObservabilityEventType
  userId?: string
  userName?: string
  timestamp: number
  question?: string
  questionLength?: number
  modelId?: string
  channelId?: string
  sessionId?: string
  workspaceId?: string
  result?: 'success' | 'failure' | 'pending'
  responseDurationMs?: number
  error?: {
    type: string
    message: string
    stack?: string
    statusCode?: number
    fingerprint?: string
  }
  breadcrumbs?: Array<{
    type: string
    category: string
    message: string
    timestamp: number
    data?: Record<string, unknown>
  }>
  tags?: Record<string, string>
  client: {
    appVersion: string
    platform: string
    osVersion?: string
  }
}

// ===== 升级检测相关类型 =====

export interface UpgradeCheckRequest {
  currentVersion: string
  platform: string
}

export interface UpgradeCheckResponse {
  hasUpdate: boolean
  forceUpdate: boolean
  releaseType: ReleaseType | null
  latestVersion: string | null
  downloadUrl: string | null
  releaseNotes: string | null
  minVersion: string | null
  hint: string | null
}

// ===== 模型相关类型 =====

export interface ModelInfo {
  id: string
  name: string
  description?: string
  provider?: string
  maxTokens?: number
  enabled: boolean
}

export interface ModelListResponse {
  models: ModelInfo[]
  total: number
}

// ===== 统一响应格式 =====

export interface ApiResponse<T = unknown> {
  code: number
  message: string
  data?: T
  timestamp: number
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}