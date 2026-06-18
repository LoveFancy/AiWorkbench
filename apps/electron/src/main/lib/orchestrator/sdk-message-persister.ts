/**
 * SDK 消息持久化
 *
 * 过滤并持久化累积的 SDKMessage 到 JSONL。
 * 只保留 assistant、user、result 和特定的 system 消息。
 */

import type { SDKMessage } from '@proma/shared'
import { appendSDKMessages } from '../agent-session-manager'

/**
 * 持久化累积的 SDKMessage
 *
 * 只持久化 assistant、user、result 和需要长期可见的 system 消息
 *（跳过 tool_progress、compacting 等临时消息）。
 */
export function persistSDKMessages(
  sessionId: string,
  accumulatedMessages: SDKMessage[],
  durationMs?: number,
): void {
  if (accumulatedMessages.length === 0) return

  const toPersist = accumulatedMessages
    .filter(
      (m) =>
        m.type === 'assistant' ||
        m.type === 'user' ||
        m.type === 'result' ||
        (m.type === 'system' &&
          ['compact_boundary', 'permission_denied'].includes(
            (m as import('@proma/shared').SDKSystemMessage).subtype ?? '',
          )),
    )
    .filter((m) => {
      // 过滤 SDK 内部生成的 user 文本消息（如 Skill 展开 prompt），与实时流过滤逻辑一致
      if (m.type === 'user') {
        const content = (m as { message?: { content?: Array<{ type: string }> } }).message?.content
        const hasToolResult = Array.isArray(content) && content.some((b) => b.type === 'tool_result')
        if (!hasToolResult) return false
      }
      return true
    })

  if (toPersist.length === 0) return

  // 为没有 _createdAt 的消息补上时间戳（assistant 消息来自 SDK 原始输出，不含时间）
  const now = Date.now()
  const withTimestamps = toPersist.map((m) => {
    const msg = m as Record<string, unknown>
    if (typeof msg._createdAt === 'number') return m
    // 为 result 消息附加 _durationMs
    if (m.type === 'result' && durationMs != null) {
      return { ...m, _createdAt: now, _durationMs: durationMs } as unknown as SDKMessage
    }
    return { ...m, _createdAt: now } as unknown as SDKMessage
  })

  appendSDKMessages(sessionId, withTimestamps)
}
