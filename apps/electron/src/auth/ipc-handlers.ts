import { ipcMain } from 'electron'
import { loginWithEipGateway, getJobId, isLoggedIn, logout, getAuthInfo } from './auth-service'
import { onLoginSuccess } from '../main/lib/updater/auto-updater'

export const AUTH_IPC_CHANNELS = {
  GET_AUTH_STATE: 'auth:get-state',
  CHECK_SESSION: 'auth:check-session',
  LOGIN: 'auth:login',
  LOGOUT: 'auth:logout',
} as const

export function registerAuthIpcHandlers(): void {
  ipcMain.handle(AUTH_IPC_CHANNELS.GET_AUTH_STATE, () => {
    return { isLoggedIn: isLoggedIn(), jobId: getJobId() }
  })

  ipcMain.handle(AUTH_IPC_CHANNELS.CHECK_SESSION, () => {
    const info = getAuthInfo()
    if (!info) {
      return { isLoggedIn: false }
    }
    return {
      isLoggedIn: true,
      jobId: info.jobId,
      needsReauth: info.needsReauth,
    }
  })

  ipcMain.handle(AUTH_IPC_CHANNELS.LOGIN, async (_event, username: string, password: string, days?: number) => {
    const result = await loginWithEipGateway(username, password, days)

    // 上报登录事件（动态 import 避免循环依赖）
    const { reportLoginEvent } = await import('../main/lib/observability-service')
    const jobId = result.jobId ?? username
    if (result.success) {
      reportLoginEvent(jobId, 'success')
      try { onLoginSuccess() } catch { /* ignore updater errors */ }
    } else {
      reportLoginEvent(jobId, 'failure', new Error(result.message))
    }

    return result
  })

  ipcMain.handle(AUTH_IPC_CHANNELS.LOGOUT, () => {
    const jobId = getJobId()
    logout()

    // 上报登出事件（动态 import 避免循环依赖）
    if (jobId) {
      import('../main/lib/observability-service').then(
        ({ reportLogoutEvent }) => reportLogoutEvent(jobId),
      ).catch(() => { /* 上报失败不影响登出 */ })
    }

    return { success: true }
  })
}
