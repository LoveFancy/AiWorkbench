/**
 * 快照回退
 *
 * 回退会话到指定消息点：
 * 1. 从 SDK JSONL 的 file-history-snapshot 恢复文件
 * 2. 截断 Proma JSONL
 * 3. 记录 resumeAtMessageUuid 供下次 resume
 */

import { homedir } from 'node:os'
import type { RewindSessionResult } from '@proma/shared'
import { getAgentWorkspace } from '../agent-workspace-manager'
import { getAgentSessionWorkspacePath } from '../config-paths'
import { getAgentSessionMeta, truncateSDKMessages, updateAgentSessionMeta, resolveUserUuidFromSDK, rewindFilesFromSnapshot } from '../agent-session-manager'
import { collectAttachedDirectories } from './workspace-context'

/**
 * 回退会话到指定消息点
 *
 * @param activeSessions 运行中会话集合（用于并发保护）
 */
export async function rewindSession(
  sessionId: string,
  assistantMessageUuid: string,
  activeSessions: Map<string, number>,
): Promise<RewindSessionResult> {
  // 0. 阻止运行中会话回退（JSONL 并发写入会损坏文件）
  if (activeSessions.has(sessionId)) {
    throw new Error('会话正在运行中，请停止后再回退')
  }

  const sessionMeta = getAgentSessionMeta(sessionId)
  if (!sessionMeta?.sdkSessionId) {
    throw new Error('会话没有 SDK session ID，无法回退')
  }

  // 0.5 从 SDK session JSONL 解析对应的 user message UUID
  let projectDir: string | undefined
  let workspaceSlug: string | undefined
  if (sessionMeta.workspaceId) {
    const ws = getAgentWorkspace(sessionMeta.workspaceId)
    if (ws) {
      workspaceSlug = ws.slug
      projectDir = getAgentSessionWorkspacePath(ws.slug, sessionMeta.id)
    }
  }
  const userMessageUuid = resolveUserUuidFromSDK(
    sessionMeta.sdkSessionId,
    assistantMessageUuid,
    projectDir,
    sessionMeta.forkSourceSdkSessionId,
  )
  console.log(
    `[Agent 编排] 回退: 解析 user uuid=${userMessageUuid || '未找到'} (assistant uuid=${assistantMessageUuid}, forkSource=${sessionMeta.forkSourceSdkSessionId ?? 'none'})`,
  )

  // 1. 文件恢复：直接从 SDK JSONL 的 file-history-snapshot 恢复
  let fileRewindResult: {
    canRewind: boolean
    error?: string
    filesChanged?: string[]
    insertions?: number
    deletions?: number
  } | undefined
  if (userMessageUuid === '__LAST_TURN__') {
    console.log(`[Agent 编排] 回退: 最后一个 turn，跳过文件恢复`)
    fileRewindResult = { canRewind: true, filesChanged: [] }
  } else if (userMessageUuid) {
    try {
      let cwd = homedir()
      if (projectDir) cwd = projectDir
      const rewindAttachedDirs = collectAttachedDirectories({ sessionMeta, workspaceSlug })
      console.log(
        `[Agent 编排] 回退: 直接从 snapshot 恢复文件 (cwd=${cwd}, forkSource=${sessionMeta.forkSourceSdkSessionId ?? 'none'}, attachedDirs=${rewindAttachedDirs.length})`,
      )
      fileRewindResult = rewindFilesFromSnapshot(
        sessionMeta.sdkSessionId,
        userMessageUuid,
        cwd,
        projectDir,
        sessionMeta.forkSourceSdkSessionId,
        rewindAttachedDirs,
      )
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      console.warn('[Agent 编排] 文件恢复失败，继续截断对话:', errMsg)
      if (err instanceof Error && err.stack)
        console.warn('[Agent 编排] 文件恢复错误堆栈:', err.stack)
      fileRewindResult = { canRewind: false, error: errMsg }
    }
  } else {
    fileRewindResult = {
      canRewind: false,
      error: '无法从 SDK session 中解析 user message UUID',
    }
  }

  // 2. 截断 Proma JSONL
  const kept = truncateSDKMessages(sessionId, assistantMessageUuid)

  // 3. 记录 resumeAtMessageUuid
  updateAgentSessionMeta(sessionId, { resumeAtMessageUuid: assistantMessageUuid })

  console.log(
    `[Agent 编排] 回退完成: sessionId=${sessionId}, 保留 ${kept.length} 条消息, 文件恢复=${fileRewindResult?.canRewind ?? '跳过'}`,
  )

  return {
    remainingMessages: kept.length,
    fileRewind: fileRewindResult,
  }
}
