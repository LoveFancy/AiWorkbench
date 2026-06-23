/**
 * ObservabilityService — 观测上报核心服务
 *
 * 收集事件（用户行为 + 异常），定时批量 POST 到服务端，
 * 失败时回写队列并落盘兜底。
 */

import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { platform, release } from 'node:os'
import { getToken, getJobId, hasValidSession } from '../../auth'
import { getConfigDir } from './config-paths'
import { safeStringify } from './utils/safe-stringify'
import {
  getSerializedEventBytes,
  normalizeObservabilityEvent,
  upsertDiskCacheContent,
} from './observability-event-utils'
import type {
  Breadcrumb,
  ObservabilityEventItem,
  ObservabilityConfig,
} from '../../types/workmate'

// ===== 模块状态 =====

const breadcrumbs: Breadcrumb[] = []
let eventQueue: ObservabilityEventItem[] = []
let diskCachePath: string | null = null
let config: ObservabilityConfig | null = null
let flushTimer: ReturnType<typeof setInterval> | null = null
let isFlushing = false
let currentFlushPromise: Promise<void> | null = null
let isReportingError = false

// ===== 客户端信息 =====

/** 模块级函数，不 export，避免与其他模块同名冲突 */
function getClientInfo(): { appVersion: string; platform: string; osVersion: string } {
  return {
    appVersion: app.getVersion(),
    platform: platform(),
    osVersion: release(),
  }
}

// ===== Error 信息提取（复用） =====

function extractErrorInfo(error: Error, extras?: { fingerprint?: string }): NonNullable<ObservabilityEventItem['error']> {
  return {
    type: error.name,
    message: error.message,
    stack: error.stack,
    ...extras,
  }
}

// ===== 指纹生成 =====

/**
 * 生成错误指纹。客户端生成的 fingerprint 仅供透传参考，
 * 服务端在入库时会以自有算法（md5(errorType|errorMessage)）统一重算并覆盖。
 */
function generateFingerprint(errorType: string, errorMessage: string): string {
  const raw = `${errorType}:${errorMessage.slice(0, 100)}`
  return createHash('md5').update(raw).digest('hex').slice(0, 16)
}

// ===== 初始化 =====

export function init(obsConfig: ObservabilityConfig): void {
  config = obsConfig
  if (!config.enabled) return

  // 磁盘缓存路径
  const dir = getConfigDir()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  diskCachePath = join(dir, 'obs-queue.jsonl')

  // 启动时从磁盘恢复未发送的事件
  restoreFromDiskCache()

  // 启动定时冲刷
  flushTimer = setInterval(() => {
    void flushQueue()
  }, config.flushIntervalMs ?? 5000)
}

// ===== 关闭 =====

export async function shutdown(): Promise<void> {
  if (flushTimer) {
    clearInterval(flushTimer)
    flushTimer = null
  }
  // 等待当前正在进行的冲刷完成，再尝试最后一次冲刷
  if (currentFlushPromise) {
    await currentFlushPromise
  }
  await flushQueue()
}

// ===== 面包屑记录 =====

export function addBreadcrumb(crumb: Omit<Breadcrumb, 'timestamp'>): void {
  if (!config?.enableBreadcrumbs) return
  const max = config.maxBreadcrumbs ?? 20
  breadcrumbs.push({ ...crumb, timestamp: Date.now() } as Breadcrumb)
  while (breadcrumbs.length > max) {
    breadcrumbs.shift()
  }
}

// ===== 通用事件入队 =====

export function reportEvent(item: Omit<ObservabilityEventItem, 'eventId'>): void {
  if (!config?.enabled) return
  // 未登录（含 Token 缺失/已过期）时不上报：EIP 未登录则无有效身份，事件一律丢弃
  if (!hasValidSession()) return

  const event = normalizeObservabilityEvent({
    ...item,
    eventId: randomUUID(),
  })

  // 单事件体积保护：按真实 UTF-8 字节数计算，超过 maxEventBytes 拒绝入队
  const maxBytes = config.maxEventBytes ?? 256 * 1024
  const bytes = getSerializedEventBytes(event)
  if (bytes > maxBytes) {
    console.warn('[观测上报] 事件体积超限，已丢弃', { type: event.type, bytes })
    return
  }

  eventQueue.push(event)
  if (eventQueue.length >= (config.maxQueueSize ?? 200)) {
    void flushQueue()
  }

  // 硬上限保护：超出上限时丢弃最旧的事件，防止持续上报失败导致内存无限增长
  const hardLimit = (config.maxQueueSize ?? 200) * QUEUE_HARD_LIMIT_MULTIPLIER
  while (eventQueue.length > hardLimit) {
    const dropped = eventQueue.shift()
    console.warn('[观测上报] 队列超硬上限，已丢弃最旧事件', { type: dropped?.type, eventId: dropped?.eventId })
  }
}

// ===== 各类事件上报快捷方法 =====

export function reportChatEvent(params: {
  userId: string; modelId: string;
  result: 'success' | 'failure'; responseDurationMs: number; error?: Error;
}): void {
  reportEvent({
    type: 'chat_question',
    userId: params.userId,
    timestamp: Date.now(),
    modelId: params.modelId,
    result: params.result,
    responseDurationMs: params.responseDurationMs,
    error: params.error ? extractErrorInfo(params.error) : undefined,
    client: getClientInfo(),
  })
}

export function reportAgentEvent(params: {
  userId: string; modelId: string;
  result: 'success' | 'failure'; responseDurationMs: number; error?: Error;
  sessionId?: string; workspaceId?: string;
}): void {
  reportEvent({
    type: 'agent_question',
    userId: params.userId,
    timestamp: Date.now(),
    modelId: params.modelId,
    sessionId: params.sessionId,
    workspaceId: params.workspaceId,
    result: params.result,
    responseDurationMs: params.responseDurationMs,
    error: params.error ? extractErrorInfo(params.error) : undefined,
    client: getClientInfo(),
  })
}

export function reportLoginEvent(
  jobId: string, result: 'success' | 'failure', error?: Error,
): void {
  reportEvent({
    type: 'user_login',
    userId: jobId,
    timestamp: Date.now(),
    result,
    error: error ? extractErrorInfo(error) : undefined,
    client: getClientInfo(),
  })
}

export function reportLogoutEvent(jobId: string): void {
  reportEvent({
    type: 'user_logout',
    userId: jobId,
    timestamp: Date.now(),
    result: 'success',
    client: getClientInfo(),
  })
}

export function reportUpgradeCheckEvent(result: 'success' | 'failure', error?: Error): void {
  reportEvent({
    type: 'upgrade_check',
    userId: getJobId() ?? 'unknown',
    timestamp: Date.now(),
    result,
    error: error ? extractErrorInfo(error) : undefined,
    client: getClientInfo(),
  })
}

export function reportStartupEvent(startupDurationMs: number): void {
  reportEvent({
    type: 'app_startup',
    userId: getJobId() ?? 'unknown',
    timestamp: Date.now(),
    result: 'success',
    startupDurationMs,
    client: getClientInfo(),
  })
}

// ===== 异常上报（自动附加面包屑） =====

export function reportErrorEvent(error: Error, context?: { tags?: Record<string, string> }): void {
  if (isReportingError) return
  if (!config?.enabled) return
  isReportingError = true
  try {
    const fingerprint = generateFingerprint(error.name, error.message)
    reportEvent({
      type: 'error',
      userId: getJobId() ?? 'unknown',
      timestamp: Date.now(),
      result: 'failure',
      error: extractErrorInfo(error, { fingerprint }),
      breadcrumbs: [...breadcrumbs],
      tags: context?.tags,
      client: getClientInfo(),
    })
  } finally {
    isReportingError = false
  }
}

// ===== 重试限制 =====

const MAX_RETRIES = 3

/** 队列硬上限（与 maxQueueSize 一致），防止持续上报失败导致内存无限增长 */
const QUEUE_HARD_LIMIT_MULTIPLIER = 1

/** 剥离内部字段，构造上报用的事件副本 */
function stripInternalFields(batch: ObservabilityEventItem[]): ObservabilityEventItem[] {
  return batch.map(({ _retryCount, ...rest }) => rest)
}

// ===== 冲刷上报 =====

export async function flushQueue(): Promise<void> {
  if (isFlushing) {
    await currentFlushPromise
    return
  }
  if (eventQueue.length === 0) return
  if (!config?.enabled || !config.url) return

  currentFlushPromise = doFlushQueue()
  await currentFlushPromise
}

async function doFlushQueue(): Promise<void> {
  if (!config?.enabled || !config.url) return

  isFlushing = true
  const batch = eventQueue.splice(0, config.maxBatchSize ?? 50)
  const token = getToken()

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (token) {
      headers['Cookie'] = `EIPGW-TOKEN=${token}`
    }

    console.log('[观测上报] 开始上报, url=%s, events=%d', config.url, batch.length)

    const response = await fetch(config.url, {
      method: 'POST',
      headers,
      body: safeStringify({ events: stripInternalFields(batch) }),
      signal: AbortSignal.timeout(config.timeoutMs ?? 5000),
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    // 业务码校验：服务端返回 { code, message, data }，仅 code === 0 视为成功
    const body = await response.json().catch(() => null) as { code?: number; message?: string } | null
    if (!body || body.code !== 0) {
      throw new Error(`业务错误 code=${body?.code ?? 'unknown'} message=${body?.message ?? ''}`)
    }
  } catch (error) {
    // 递增重试次数，超出上限的事件丢弃
    const retryable: ObservabilityEventItem[] = []
    let discarded = 0
    for (const event of batch) {
      const count = (event._retryCount ?? 0) + 1
      if (count >= MAX_RETRIES) {
        discarded++
      } else {
        event._retryCount = count
        retryable.push(event)
      }
    }
    if (retryable.length > 0) {
      eventQueue.unshift(...retryable)
      writeToDiskCache(retryable)
    }
    console.warn('[观测上报] 上报失败, url=%s, events=%d, retryable=%d, discarded=%d, error=',
      config.url, batch.length, retryable.length, discarded, error)
  } finally {
    isFlushing = false
    currentFlushPromise = null
  }
}

// ===== 磁盘缓存（失败兜底） =====

function writeToDiskCache(batch: ObservabilityEventItem[]): void {
  if (!diskCachePath) return
  try {
    const existing = existsSync(diskCachePath) ? readFileSync(diskCachePath, 'utf-8') : ''
    writeFileSync(diskCachePath, upsertDiskCacheContent(existing, batch), 'utf-8')
  } catch (error) {
    console.warn('[观测上报] 写磁盘缓存失败:', error)
  }
}

function restoreFromDiskCache(): void {
  if (!diskCachePath || !existsSync(diskCachePath)) return
  try {
    const content = readFileSync(diskCachePath, 'utf-8')
    const lines = content.split('\n').filter(Boolean)
    const restored: ObservabilityEventItem[] = []
    for (const line of lines) {
      try {
        restored.push(JSON.parse(line) as ObservabilityEventItem)
      } catch {
        // 单行损坏忽略
      }
    }
    if (restored.length > 0) {
      eventQueue.unshift(...restored)
      // 恢复后清空磁盘文件（事件已回到内存队列）
      writeFileSync(diskCachePath, '', 'utf-8')
      // 硬上限保护：恢复后裁剪队列（config 已由 init() 赋值）
      const hardLimit = (config?.maxQueueSize ?? 200) * QUEUE_HARD_LIMIT_MULTIPLIER
      while (eventQueue.length > hardLimit) {
        eventQueue.shift()
      }
      console.log(`[观测上报] 从磁盘恢复 ${restored.length} 条事件`)
    }
  } catch (error) {
    console.warn('[观测上报] 读取磁盘缓存失败:', error)
  }
}
