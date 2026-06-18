/**
 * WorkMate 观测上报类型定义
 *
 * 独立于 @proma/shared，不侵入 Proma 上游核心类型。
 */

// ===== 事件类型 =====

export type ObservabilityEventType =
  | 'user_login' | 'user_logout' | 'chat_question' | 'agent_question'
  | 'error' | 'upgrade_check' | 'app_startup'

// ===== 面包屑 =====

export interface Breadcrumb {
  type: 'navigation' | 'user_action' | 'system' | 'http'
  category: string
  message: string
  timestamp: number
  /** 受控大小（仅允许基础类型），单条面包屑 data 序列化后不超过 4KB */
  data?: Record<string, string | number | boolean | null>
}

// ===== 事件数据 =====

export interface ObservabilityEventItem {
  eventId: string            // 事件唯一标识（UUID），用于服务端去重
  type: ObservabilityEventType
  userId: string             // 用户工号（由 auth-service.getJobId() 填充，服务端以 req.jobId 覆盖）
  timestamp: number          // 毫秒级时间戳（Date.now()），服务端转换后写入 created_at。依赖客户端时钟
  question?: string
  questionLength?: number
  modelId?: string
  channelId?: string
  sessionId?: string
  workspaceId?: string
  result?: 'success' | 'failure' | 'pending'
  responseDurationMs?: number
  startupDurationMs?: number // app_startup 事件：启动耗时（毫秒）
  error?: { type: string; message: string; stack?: string; statusCode?: number; fingerprint?: string }
  breadcrumbs?: Breadcrumb[] // 事件发生前的用户操作路径（error 事件自动附加）
  /**
   * 扩展标签。用于 reportErrorEvent 传入 context 参数。
   * 类型限定为 string→string，避免 spread 任意键污染 ObservabilityEventItem。
   */
  tags?: Record<string, string>
  client: { appVersion: string; platform: string; osVersion: string }
  /** 内部字段：重试次数（不上报给服务端），达到上限后丢弃 */
  _retryCount?: number
}

/** 批量上报请求体，与 POST body 的 JSON 结构一致 */
export interface ObservabilityReportBody {
  events: ObservabilityEventItem[]
}

// ===== 配置 =====

export interface ObservabilityConfig {
  enabled: boolean
  url: string              // 完整上报地址，如 https://host/workmate/observability/events
  timeoutMs?: number
  maxQueueSize?: number
  flushIntervalMs?: number
  maxBatchSize?: number
  /** 采样率 0.0~1.0，默认 1.0（暂不实现，字段保留） */
  sampleRate?: number
  /** 每分钟最大事件数，默认 60（暂不实现，字段保留） */
  maxEventsPerMinute?: number
  /** 是否启用面包屑，默认 true */
  enableBreadcrumbs?: boolean
  /** 面包屑最大数量，默认 20 */
  maxBreadcrumbs?: number
  /** 单个事件序列化后最大字节数，默认 256KB（防面包屑 data 过大撑爆 payload） */
  maxEventBytes?: number
}
