/**
 * Resume 失败恢复
 *
 * 当 SDK session 过期或 thinking signature 跨模型不兼容时，
 * 清除失效的 SDK resume 关系并注入 session 自引用，
 * 让 Agent 读取完整历史继续工作。
 */

import type { SDKMessage } from '@proma/shared'
import type { ClaudeAgentQueryOptions } from '../adapters/claude-agent-adapter'
import { updateAgentSessionMeta } from '../agent-session-manager'
import { buildRecoveryPrompt } from './context-prompt'
import { persistSDKMessages } from './sdk-message-persister'

/**
 * Resume 失败恢复：清除 SDK resume 关系，注入 session 自引用
 *
 * 适用于 SDK session 过期、thinking signature 跨模型不兼容等场景。
 * 使用 <session_recovery> 标签指向当前会话的 JSONL 历史文件，Agent 会自动读取并恢复上下文，
 * 比 buildContextPrompt（仅注入 20 条摘要）提供完整得多的上下文连续性。
 */
export function prepareResumeFallbackRecovery(
  sessionId: string,
  queryOptions: ClaudeAgentQueryOptions,
  contextualMessage: string,
  agentCwd: string,
  accumulatedMessages: SDKMessage[],
  queryStartedAt: number,
  logMessage: string,
  retryReason: string,
): string {
  console.log(`[Agent 编排] ${logMessage}`)
  // 先持久化当前已累积的消息，确保 JSONL 文件包含最新内容
  persistSDKMessages(sessionId, accumulatedMessages, Date.now() - queryStartedAt)
  accumulatedMessages.length = 0
  // 清除失效的 SDK session，新 SDK 会话产生的 sdkSessionId 会通过 onSessionId 回调自动保存
  try { updateAgentSessionMeta(sessionId, { sdkSessionId: undefined }) } catch { /* 忽略 */ }
  queryOptions.resumeSessionId = undefined
  queryOptions.resumeSessionAt = undefined
  queryOptions.prompt = buildRecoveryPrompt(sessionId, contextualMessage, { agentCwd })
  return retryReason
}

/**
 * Session-not-found 恢复
 *
 * 当 resume 的目标 session 已过期/被清理时，SDK 会抛出 "No conversation found" 错误。
 * 此方法执行恢复的公共逻辑，调用方负责设置 existingSdkSessionId = undefined 和流程控制。
 *
 * @returns lastRetryableError 描述字符串
 */
export function prepareSessionNotFoundRecovery(
  sessionId: string,
  queryOptions: ClaudeAgentQueryOptions,
  contextualMessage: string,
  agentCwd: string,
  accumulatedMessages: SDKMessage[],
  queryStartedAt: number,
): string {
  return prepareResumeFallbackRecovery(
    sessionId,
    queryOptions,
    contextualMessage,
    agentCwd,
    accumulatedMessages,
    queryStartedAt,
    '检测到 session-not-found 错误，清除 sdkSessionId 并切换到上下文回填模式',
    'Session 已失效，切换到上下文回填模式',
  )
}
