/**
 * 问题上报 IPC handler — 副作用自注册
 *
 * import 本模块即自动完成 ipcMain.handle 注册。
 * 调用方只需在 main/index.ts 中加一行：
 *   import './lib/issue-report'
 */

import { ipcMain } from 'electron'
import { submitIssue, ISSUE_SUBMIT_IPC_CHANNEL } from './issue-report-service'
import type { IssueSubmitInput } from './issue-report-service'

ipcMain.handle(
  ISSUE_SUBMIT_IPC_CHANNEL,
  async (_event, input: IssueSubmitInput) => {
    try {
      return await submitIssue(input)
    } catch (err) {
      const message = err instanceof Error ? err.message : '问题提交失败'
      console.error('[IPC] issue:submit 失败:', message)
      return { success: false, error: message }
    }
  },
)
