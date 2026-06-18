/**
 * 工作区附加目录/文件聚合
 */

import { dirname } from 'node:path'
import type { AgentSessionMeta } from '@proma/shared'
import {
  getWorkspaceAttachedDirectories,
  getWorkspaceAttachedFiles,
} from '../agent-workspace-manager'
import { getWorkspaceFilesDir } from '../config-paths'

/**
 * 聚合一次 SDK 调用涉及的所有附加目录（去重，保持插入顺序）。
 *
 * 发消息（sendMessage）和回退恢复文件（rewindSession）必须使用同一份聚合结果，
 * 否则 SDK 写入 file-history-snapshot 时使用的目录范围，与回退时校验路径越界的目录范围不一致，
 * 会导致 attachedDirectories 内的文件在回退时被静默跳过（"会话回退、代码不回退"）。
 *
 * 来源：
 *   1. extraDirs：调用方传入的临时附加目录（例如 sendMessage 时用户当次提交的目录）
 *   2. 会话级 attachedDirectories + attachedFiles 的父目录
 *   3. 工作区级 attachedDirectories + attachedFiles 的父目录
 *   4. 工作区文件目录 workspace-files/
 */
export function collectAttachedDirectories(params: {
  sessionMeta?: AgentSessionMeta
  workspaceSlug?: string
  extraDirs?: string[]
}): string[] {
  const { sessionMeta, workspaceSlug, extraDirs } = params
  const result: string[] = []
  const push = (dir: string | undefined | null) => {
    if (!dir) return
    if (!result.includes(dir)) result.push(dir)
  }

  for (const d of extraDirs ?? []) push(d)
  for (const d of sessionMeta?.attachedDirectories ?? []) push(d)
  for (const file of sessionMeta?.attachedFiles ?? []) push(dirname(file))

  if (workspaceSlug) {
    for (const d of getWorkspaceAttachedDirectories(workspaceSlug)) push(d)
    for (const f of getWorkspaceAttachedFiles(workspaceSlug)) push(dirname(f))
    push(getWorkspaceFilesDir(workspaceSlug))
  }

  return result
}
