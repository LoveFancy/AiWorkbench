/**
 * 日志上报 IPC handler 注册
 *
 * 在 index.ts 初始化阶段调用 registerLogUploadIpc() 即可。
 */

import { ipcMain } from 'electron'
import { uploadSystemLog, LOG_UPLOAD_IPC_CHANNEL } from './log-uploader'
import type { LogUploadInput } from './log-uploader'

export function registerLogUploadIpc(): void {
  ipcMain.handle(
    LOG_UPLOAD_IPC_CHANNEL,
    async (_event, input: LogUploadInput | undefined) => {
      try {
        return await uploadSystemLog(input ?? {})
      } catch (err) {
        const message =
          err instanceof Error ? err.message : '日志上报失败'
        console.error('[IPC] system-log:upload 失败:', message)
        return { success: false, error: message }
      }
    },
  )
}
