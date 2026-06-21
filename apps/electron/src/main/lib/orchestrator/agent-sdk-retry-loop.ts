/**
 * agent-sdk-retry-loop — SDK 单次运行器 + 通用工具函数
 *
 * 从 AgentOrchestrator 中抽取，负责：
 * - SDK 消息流遍历（while + Promise.race 循环）
 * - 错误检测分类
 * - 通用 API 错误提取/判断函数
 *
 * 模式特定行为（Auto Mode 切换 / 非 Auto 终止）通过 SdkRunCallbacks 注入。
 * 重试循环（for loop、退避等待）保留在 AgentOrchestrator 中，
 * 因为需要访问 this（recovery、buildSdkEnv 等私有方法）。
 */

import type { ClaudeAgentQueryOptions } from '../adapters/claude-agent-adapter'
import {
  isPromptTooLongError,
  friendlyErrorMessage,
  mapSDKErrorToTypedError,
  extractErrorDetails,
  shouldKeepChannelOpen,
} from '../adapters/claude-agent-adapter'
import {
  THINKING_SIGNATURE_ERROR_CODE,
} from '@proma/shared'
import type {
  SDKMessage,
  SDKAssistantMessage,
  SDKSystemMessage,
  TypedError,
} from '@proma/shared'
import {
  classifySdkError,
  classifyFromTypedError,
  type ClassifyResult,
} from './error-classifier'

// ===== 常量 =====

export const MAX_AUTO_RETRIES = 25
export const MAX_AUTO_RETRY_WAIT_MS = 5 * 60_000
const RETRY_MAX_DELAY_MS = 15_000

// ===== 自动重试判断 =====

/** 可自动重试的 TypedError 错误码 */
const AUTO_RETRYABLE_ERROR_CODES: ReadonlySet<string> = new Set([
  'rate_limited',
  'provider_error',
  'service_error',
  'service_unavailable',
  'network_error',
  'invalid_api_key',
])

export function isAutoRetryableTypedError(error: TypedError): boolean {
  if (!error.canRetry) return false
  return AUTO_RETRYABLE_ERROR_CODES.has(error.code)
}

export function isSessionNotFoundError(errorMessage: string, stderr?: string): boolean {
  const pattern = /No conversation found.*with session/i
  return pattern.test(errorMessage) || (!!stderr && pattern.test(stderr))
}

export function getRetryDelayMs(attempt: number, elapsedRetryDelayMs: number): number {
  const remainingMs = MAX_AUTO_RETRY_WAIT_MS - elapsedRetryDelayMs
  if (remainingMs <= 0) return 0
  const base = Math.min(1000 * Math.pow(2, attempt - 1), RETRY_MAX_DELAY_MS)
  const jitter = base * (Math.random() * 0.4 - 0.2)
  return Math.min(remainingMs, Math.max(0, Math.round(base + jitter)))
}

export function extractApiError(stderr: string): { statusCode: number; message: string } | null {
  if (!stderr) return null

  const jsonMatch = stderr.match(/(\d{3})\s+(\{[^}]*"error"[^}]*\})/s)
  if (jsonMatch) {
    try {
      const statusCode = parseInt(jsonMatch[1]!)
      const errorObj = JSON.parse(jsonMatch[2]!)
      const message = errorObj.error?.message || errorObj.message || '未知错误'
      return { statusCode, message }
    } catch { /* ignore */ }
  }

  const apiErrorMatch = stderr.match(/API error[^:]*:\s+(\d{3})\s+\d{3}\s+(\{.*?\})/s)
  if (apiErrorMatch) {
    try {
      const statusCode = parseInt(apiErrorMatch[1]!)
      const errorObj = JSON.parse(apiErrorMatch[2]!)
      const message = errorObj.error?.message || errorObj.message || '未知错误'
      return { statusCode, message }
    } catch { /* ignore */ }
  }

  const simpleMatch = stderr.match(/(\d{3})[:\s]+(.+?)(?:\n|$)/i)
  if (simpleMatch) {
    const statusCode = parseInt(simpleMatch[1]!)
    const message = simpleMatch[2]!.trim()
    if (statusCode >= 400 && statusCode < 600) {
      return { statusCode, message }
    }
  }

  return null
}

// ===== 上下文与回调类型 =====

export interface SdkRunContext {
  sessionId: string
  existingSdkSessionId: string | undefined
  capturedSdkSessionId: string | undefined
  queryOptions: ClaudeAgentQueryOptions
  resolvedModel: string
  activeModelId: string
  accumulatedMessages: SDKMessage[]
  stderrChunks: string[]
  contextualMessage: string | undefined
  agentCwd: string | undefined
  retryDelayElapsedMs: number
  retryAttemptsScheduled: number
  skipNextRetryDelay: boolean
  thinkingSignatureRecoveryAttempted: boolean
  invisibleRecoveryAttempts: number
  /** Plan 模式是否已进入 */
  planModeEntered: boolean
}

export interface SdkRunCallbacks {
  /**
   * api_retry 检测到时的处理。
   * 返回 'retry'（Auto Mode: 设置切换计数后继续）、'throw'（非 Auto: 抛异常终止）。
   */
  onApiRetry: (
    retryError: string,
    ctx: SdkRunContext,
  ) => Promise<'retry' | 'throw'>

  /**
   * assistant 消息中 tool_use block 的 plan 模式同步。
   * 由 orchestrator 提供闭包，修改 planModeEntered 并 emit 事件。
   */
  onSyncPlanMode: (toolName: string) => void
}

export interface SdkRunnerDeps {
  isActive: (sessionId: string) => boolean
  abort: (sessionId: string) => void
  emit: (sessionId: string, event: any) => void
  persistMessages: (sessionId: string, messages: SDKMessage[], elapsedMs: number) => void
  query: (options: ClaudeAgentQueryOptions) => AsyncIterable<SDKMessage>
}

// ===== 单次运行结果 =====

export interface SingleRunResult {
  kind: 'success' | 'stopped_by_user' | 'error_break' | 'unexpected_end'
  capturedResultSubtype?: string
  /** error_break 时，caller 根据此标志决定是否继续重试 */
  shouldRetryFromError?: boolean
  /** 恢复类型（仅 shouldRetryFromError 为 true 时有意义） */
  recoveryType?: 'session_not_found' | 'thinking_signature' | 'api_failure'
  /** 可重试错误的用户可见原因，用于 UI 展示 */
  retryReason?: string
  /** 可重试错误的分类型，用于重试策略决策 */
  retryCategory?: import('./error-classifier').ErrorCategory
  /** 不可重试错误时，附带统一的分类结果（display + category + raw 信息） */
  fatalError?: ClassifyResult
}

const RESULT_DRAIN_TIMEOUT_MS = 2_000

export async function sdkRunSingleAttempt(
  ctx: SdkRunContext,
  deps: SdkRunnerDeps,
  callbacks: SdkRunCallbacks,
  attempt: number,
  queryStartedAt: number,
): Promise<SingleRunResult> {
  const queryIterable = deps.query(ctx.queryOptions)
  const queryIterator = queryIterable[Symbol.asyncIterator]()

  let pendingNext: Promise<IteratorResult<SDKMessage>> | null = null
  let capturedResultSubtype: string | undefined
  let drainTimeoutPromise: Promise<'drain_timeout'> | null = null
  let awaitingBackgroundWake = false
  let lastMsgTime = Date.now()
  let stallCheckTimer: ReturnType<typeof setTimeout> | null = null

  const armStallCheck = (): void => {
    if (stallCheckTimer) clearTimeout(stallCheckTimer)
    stallCheckTimer = setTimeout(() => {
      const silentSec = Math.round((Date.now() - lastMsgTime) / 1000)
      console.warn(`[Agent 编排] ⚠️ SDK 已静默 ${silentSec}s (attempt ${attempt}/${MAX_AUTO_RETRIES}, model=${ctx.queryOptions.model}, resume=${ctx.queryOptions.resumeSessionId || '无'}, stderrLen=${ctx.stderrChunks.join('').length})`)
    }, 10_000)
  }

  try {
    while (true) {
      if (!pendingNext) {
        pendingNext = queryIterator.next()
      }

      const racePromises: Array<Promise<{ kind: string; result: IteratorResult<SDKMessage> | null }>> = [
        pendingNext.then((r) => ({ kind: 'event' as const, result: r })),
      ]
      if (drainTimeoutPromise) {
        racePromises.push(drainTimeoutPromise.then(() => ({ kind: 'drain_timeout' as const, result: null })))
      }

      armStallCheck()
      const raceResult = await Promise.race(racePromises)
      if (stallCheckTimer) { clearTimeout(stallCheckTimer); stallCheckTimer = null }
      lastMsgTime = Date.now()

      if (raceResult.kind === 'drain_timeout') {
        console.warn(`[Agent 编排] drain timeout: SDK iterator 在 result 后 ${RESULT_DRAIN_TIMEOUT_MS}ms 内未关闭，强制退出`)
        pendingNext?.catch(() => {})
        pendingNext = null
        queryIterator.return?.(undefined as never).catch(() => {})
        return { kind: 'success' }
      }

      const iterResult = raceResult.result
      if (!iterResult || iterResult.done) break

      pendingNext = null
      const msg = iterResult.value

      // ============ api_retry 检测 ============
      if (msg.type === 'system' && (msg as { subtype?: string }).subtype === 'api_retry') {
        const retryError = (msg as { error?: string }).error || '未知'
        deps.abort(ctx.sessionId)
        if (pendingNext) { (pendingNext as Promise<unknown>).catch(() => {}); pendingNext = null }
        const action = await callbacks.onApiRetry(retryError, ctx)
        if (action === 'throw') {
          throw new Error(`API 请求失败 (${retryError})`)
        }
        // Auto Mode → 标记为可重试
        return {
          kind: 'error_break',
          shouldRetryFromError: true,
          recoveryType: 'api_failure',
        }
      }

      // ============ 后台任务唤醒 ============
      if (awaitingBackgroundWake) {
        const sub = msg.type === 'system' ? (msg as { subtype?: string }).subtype : undefined
        if (msg.type === 'assistant' || msg.type === 'user' || sub === 'task_started' || sub === 'task_progress') {
          awaitingBackgroundWake = false
          deps.emit(ctx.sessionId, { kind: 'proma_event', event: { type: 'run_resumed', sessionId: ctx.sessionId } })
        }
      }

      // ============ Plan mode 同步 ============
      if (msg.type === 'assistant') {
        const assistantMsg = msg as SDKAssistantMessage
        if (!assistantMsg.isReplay) {
          for (const block of assistantMsg.message.content) {
            if (block.type === 'tool_use' && 'name' in block && typeof block.name === 'string') {
              callbacks.onSyncPlanMode(block.name)
            }
          }
        }
      }

      // ============ assistant 错误检测 ============
      if (msg.type === 'assistant') {
        const assistantMsg = msg as SDKAssistantMessage
        if (assistantMsg.error) {
          const { detailedMessage, originalError } = extractErrorDetails(assistantMsg as unknown as Parameters<typeof extractErrorDetails>[0])
          let errorCode = assistantMsg.error.errorType || 'unknown_error'
          if (isPromptTooLongError(detailedMessage, originalError)) {
            errorCode = 'prompt_too_long'
          }
          const typedError = mapSDKErrorToTypedError(errorCode, friendlyErrorMessage(detailedMessage), originalError)

          // Session 不存在
          if (isSessionNotFoundError(detailedMessage, originalError) && ctx.existingSdkSessionId) {
            return {
              kind: 'error_break',
              shouldRetryFromError: true,
              recoveryType: 'session_not_found',
            }
          }

          // Thinking signature
          if (typedError.code === THINKING_SIGNATURE_ERROR_CODE) {
            return {
              kind: 'error_break',
              shouldRetryFromError: true,
              recoveryType: 'thinking_signature',
            }
          }

          // 可自动重试
          if (isAutoRetryableTypedError(typedError)) {
            deps.persistMessages(ctx.sessionId, ctx.accumulatedMessages, Date.now() - queryStartedAt)
            ctx.accumulatedMessages.length = 0
            ctx.stderrChunks.length = 0
            return {
              kind: 'error_break',
              shouldRetryFromError: true,
              recoveryType: 'api_failure',
              retryReason: typedError.message,
              retryCategory: 'api_retryable',
            }
          }

          // 不可重试 → 只返回 fatalError，编排器统一处理展示
          deps.persistMessages(ctx.sessionId, ctx.accumulatedMessages, Date.now() - queryStartedAt)

          const fatalError = classifyFromTypedError(typedError, detailedMessage, extractApiError(ctx.stderrChunks.join('')))
          if (fatalError.category === 'api_retryable') {
            ctx.accumulatedMessages.length = 0
            ctx.stderrChunks.length = 0
            return {
              kind: 'error_break',
              shouldRetryFromError: true,
              recoveryType: 'api_failure',
              retryReason: fatalError.display.errorContent,
              retryCategory: fatalError.category,
            }
          }
          return { kind: 'error_break', shouldRetryFromError: false, fatalError }
        }
      }

      // ============ 消息累积 ============
      if (msg.type === 'assistant' || msg.type === 'user' || msg.type === 'result') {
        const msgRecord = msg as Record<string, unknown>
        if (!msgRecord.isReplay) {
          if (msg.type === 'user') {
            const content = (msg as { message?: { content?: Array<{ type: string }> } }).message?.content
            const hasToolResult = Array.isArray(content) && content.some((b) => b.type === 'tool_result')
            if (hasToolResult) {
              ctx.accumulatedMessages.push(msg)
            }
          } else {
            ctx.accumulatedMessages.push(msg)
          }
        }
      } else if (msg.type === 'system') {
        const sysMsg = msg as SDKSystemMessage
        if (sysMsg.subtype === 'compact_boundary' || sysMsg.subtype === 'permission_denied' || sysMsg.subtype === 'model_switched') {
          ctx.accumulatedMessages.push(msg)
        }
      }

      // ============ result 处理 ============
      if (msg.type === 'result') {
        capturedResultSubtype = (msg as { subtype?: string }).subtype
        deps.persistMessages(ctx.sessionId, ctx.accumulatedMessages, Date.now() - queryStartedAt)
        ctx.accumulatedMessages.length = 0

        const resultTerminalReason = (msg as { terminal_reason?: string }).terminal_reason
        const keptOpenForTasks = (msg as Record<string, unknown>)._keepChannelOpenForTasks === true
        const keepChannelOpen = shouldKeepChannelOpen(resultTerminalReason) || keptOpenForTasks

        if (keptOpenForTasks) {
          awaitingBackgroundWake = true
        } else if (!keepChannelOpen && !drainTimeoutPromise) {
          drainTimeoutPromise = new Promise((resolve) =>
            setTimeout(() => resolve('drain_timeout'), RESULT_DRAIN_TIMEOUT_MS),
          )
        }
      }

      // ============ 消息推送 ============
      let shouldEmit = true
      if (msg.type === 'user') {
        const content = (msg as { message?: { content?: Array<{ type: string }> } }).message?.content
        const hasToolResult = Array.isArray(content) && content.some((b) => b.type === 'tool_result')
        if (!hasToolResult) {
          shouldEmit = false
        }
      }
      if (shouldEmit) {
        deps.emit(ctx.sessionId, { kind: 'sdk_message', message: msg })
      }
    }

    // 正常退出 while 循环
    return { kind: 'success', capturedResultSubtype }

  } catch (error) {
    // ============ catch 路径 ============
    if (!deps.isActive(ctx.sessionId)) {
      return { kind: 'stopped_by_user' }
    }

    // 从 stderr 提取 API 错误
    const stderrOutput = ctx.stderrChunks.join('').trim()
    const apiError = extractApiError(stderrOutput)
    const rawErrorMessage = error instanceof Error ? error.message : ''
    const rawStack = error instanceof Error ? (error.stack ?? error.message) : String(error)

    // 统一分类
    const classified = classifySdkError({
      rawErrorMessage,
      rawStack,
      stderrOutput,
      apiError,
      existingSdkSessionId: ctx.existingSdkSessionId,
    })

    // 根据分类做恢复决策
    if (classified.category === 'api_retryable') {
      deps.persistMessages(ctx.sessionId, ctx.accumulatedMessages, Date.now() - queryStartedAt)
      ctx.accumulatedMessages.length = 0
      ctx.stderrChunks.length = 0
      return {
        kind: 'error_break',
        shouldRetryFromError: true,
        recoveryType: 'api_failure',
        retryReason: classified.display.errorContent,
        retryCategory: classified.category,
      }
    }

    if (classified.category === 'session_not_found') {
      return {
        kind: 'error_break',
        shouldRetryFromError: true,
        recoveryType: 'session_not_found',
      }
    }

    if (classified.category === 'thinking_signature') {
      return {
        kind: 'error_break',
        shouldRetryFromError: true,
        recoveryType: 'thinking_signature',
      }
    }

    // api_fatal — 不可重试
    console.error(`[Agent 编排] catch → fatal: apiError=${apiError ? `status=${apiError.statusCode} msg=${apiError.message}` : 'null'} raw=${rawErrorMessage.slice(0, 200)} stderrLen=${stderrOutput.length}`)
    return {
      kind: 'error_break',
      shouldRetryFromError: false,
      fatalError: classified,
    }

  } finally {
    if (stallCheckTimer) clearTimeout(stallCheckTimer)
  }
}
