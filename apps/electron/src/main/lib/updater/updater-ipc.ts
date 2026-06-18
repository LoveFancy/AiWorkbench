/**
 * 自动更新 IPC 处理器
 *
 * 注册更新相关的 IPC 通道，供渲染进程调用。
 */

import { ipcMain } from 'electron'
import { UPDATER_IPC_CHANNELS } from './updater-types'
import type { UpdateStatus } from './updater-types'
import {
  checkForUpdates,
  getUpdateStatus,
  quitAndInstall,
} from './auto-updater'

/** 注册更新 IPC 处理器 */
export function registerUpdaterIpc(): void {
  ipcMain.handle(
    UPDATER_IPC_CHANNELS.CHECK_FOR_UPDATES,
    (_event, opts?: { silent?: boolean }): void => {
      // 不 await，状态变更通过 updater:status-changed 事件推送
      void checkForUpdates(true, opts?.silent ?? false)
    }
  )

  ipcMain.handle(
    UPDATER_IPC_CHANNELS.GET_STATUS,
    async (): Promise<UpdateStatus> => {
      return getUpdateStatus()
    }
  )

  ipcMain.handle(
    UPDATER_IPC_CHANNELS.QUIT_AND_INSTALL,
    (): void => {
      quitAndInstall()
    }
  )
}
