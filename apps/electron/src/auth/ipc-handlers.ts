import { ipcMain } from 'electron'
import { loginWithEipGateway, getJobId, isLoggedIn, logout } from './auth-service'
import { onLoginSuccess } from '../main/lib/updater/auto-updater'

export const AUTH_IPC_CHANNELS = {
  GET_AUTH_STATE: 'auth:get-state',
  LOGIN: 'auth:login',
  LOGOUT: 'auth:logout',
} as const

export function registerAuthIpcHandlers(): void {
  ipcMain.handle(AUTH_IPC_CHANNELS.GET_AUTH_STATE, () => {
    return { isLoggedIn: isLoggedIn(), jobId: getJobId() }
  })

  ipcMain.handle(AUTH_IPC_CHANNELS.LOGIN, async (_event, username: string, password: string, days?: number) => {
    const result = await loginWithEipGateway(username, password, days)
    if (result.success) {
      // 登录成功后触发升级检测
      try { onLoginSuccess() } catch { /* ignore updater errors */ }
    }
    return result
  })

  ipcMain.handle(AUTH_IPC_CHANNELS.LOGOUT, () => {
    logout()
    return { success: true }
  })
}
