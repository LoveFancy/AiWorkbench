/**
 * 上下文回填 / Session 恢复 / 引用会话的 prompt 构建工具
 */

import {
  getAgentSessionSDKMessages,
  getAgentSessionMeta,
} from '../agent-session-manager'
import { getConfigDirName } from '../config-paths'

/** 最大回填消息条数 */
export const MAX_CONTEXT_MESSAGES = 20

/** 单条工具摘要最大字符数 */
export const MAX_TOOL_SUMMARY_LENGTH = 200

/**
 * 从 SDKMessage assistant 消息的 content 中提取工具活动摘要
 */
function extractSDKToolSummary(content: Array<{ type: string; name?: string; input?: Record<string, unknown> }>): string {
  const summaries: string[] = []
  for (const block of content) {
    if (block.type === 'tool_use' && block.name) {
      const input = block.input ?? {}
      const keyParam = input.file_path ?? input.command ?? input.path ?? input.query ?? ''
      const paramStr = keyParam ? `: ${String(keyParam).slice(0, 100)}` : ''
      summaries.push(`[tool: ${block.name}${paramStr}]`)
    }
  }
  if (summaries.length === 0) return ''
  const joined = summaries.join(' ')
  return joined.length > MAX_TOOL_SUMMARY_LENGTH
    ? joined.slice(0, MAX_TOOL_SUMMARY_LENGTH) + '...'
    : joined
}

/**
 * 构建带历史上下文的 prompt
 *
 * 当 resume 不可用时，将最近消息拼接为上下文注入 prompt，
 * 让新 SDK 会话保留对话记忆。包含文本内容和工具活动摘要。
 */
export function buildContextPrompt(sessionId: string, currentUserMessage: string, sessionHint?: { agentCwd: string }): string {
  const allMessages = getAgentSessionSDKMessages(sessionId)
  if (allMessages.length === 0) return currentUserMessage

  const history = allMessages.slice(0, -1)
  if (history.length === 0) return currentUserMessage

  const recent = history.slice(-MAX_CONTEXT_MESSAGES)
  const lines = recent
    .filter((m) => (m.type === 'user' || m.type === 'assistant'))
    .map((m) => {
      const content = (m as { message?: { content?: Array<{ type: string; text?: string; name?: string; input?: Record<string, unknown> }> } }).message?.content
      if (!Array.isArray(content)) return null

      const textParts = content
        .filter((b) => b.type === 'text' && b.text)
        .map((b) => b.text!)
      const text = textParts.join('\n')
      if (!text) return null

      let line = `[${m.type}]: ${text}`
      if (m.type === 'assistant') {
        const toolSummary = extractSDKToolSummary(content)
        if (toolSummary) {
          line += `\n  工具活动: ${toolSummary}`
        }
      }
      return line
    })
    .filter(Boolean)

  if (lines.length === 0) return currentUserMessage

  const sessionInfoBlock = sessionHint
    ? `\n<session_info>\nSession ID: ${sessionId}\nSession CWD: ${sessionHint.agentCwd}\nNote: 上方为近期对话摘要。如需更多上下文，可读取 ~/${getConfigDirName()}/agent-sessions/${sessionId}.jsonl 获取完整历史。\n</session_info>\n`
    : ''

  return `<conversation_history>${sessionInfoBlock}\n${lines.join('\n')}\n</conversation_history>\n\n${currentUserMessage}`
}

/**
 * 构建 Session 恢复 prompt
 *
 * 当 SDK resume 失败（session 过期、thinking signature 不兼容等）时，
 * 注入 <session_recovery> 标签指向当前会话的完整 JSONL 历史文件，
 * 让 Agent 自己读取完整历史后无缝继续工作。
 */
export function buildRecoveryPrompt(
  sessionId: string,
  currentUserMessage: string,
  sessionHint: { agentCwd: string },
): string {
  const meta = getAgentSessionMeta(sessionId)
  const title = meta ? escapeContextAttr(meta.title) : sessionId
  const historyPath = `~/${getConfigDirName()}/agent-sessions/${sessionId}.jsonl`

  const recoveryBlock =
    `<session_recovery>\n` +
    `你正在接续一个已有的 Agent 会话（因模型切换等原因需要重新建立连接）。\n` +
    `当前会话的完整历史记录在下方路径中，请先读取它以恢复上下文，然后继续处理用户的最新请求。\n` +
    `<session id="${sessionId}" title="${title}" cwd="${sessionHint.agentCwd}">\n` +
    `History path: ${historyPath}\n` +
    `</session>\n` +
    `</session_recovery>`

  return `${recoveryBlock}\n\n${currentUserMessage}`
}

function escapeContextAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * 构建引用会话提示
 */
export function buildReferencedSessionsPrompt(
  currentSessionId: string,
  mentionedSessionIds?: string[],
  workspaceId?: string,
): string {
  const uniqueIds = [...new Set((mentionedSessionIds ?? []).filter(Boolean))]
  if (uniqueIds.length === 0) return ''

  const currentWorkspaceId = workspaceId ?? getAgentSessionMeta(currentSessionId)?.workspaceId
  const sessionBlocks: string[] = []

  for (const referencedSessionId of uniqueIds) {
    if (referencedSessionId === currentSessionId) continue

    const meta = getAgentSessionMeta(referencedSessionId)
    if (!meta || meta.archived) continue
    if (currentWorkspaceId && meta.workspaceId !== currentWorkspaceId) continue

    const title = escapeContextAttr(meta.title)
    const historyPath = `~/${getConfigDirName()}/agent-sessions/${referencedSessionId}.jsonl`
    sessionBlocks.push(
      `<session id="${referencedSessionId}" title="${title}" updatedAt="${meta.updatedAt}">\n` +
      `History path: ${historyPath}\n` +
      '</session>',
    )
  }

  if (sessionBlocks.length === 0) return ''

  return `<referenced_sessions>\n用户在消息中明确引用了以下同工作区 Agent 会话。不要假设这些会话的内容；需要上下文时，请先读取对应的 History path，再基于读取结果继续完成任务。\n${sessionBlocks.join('\n\n')}\n</referenced_sessions>`
}
