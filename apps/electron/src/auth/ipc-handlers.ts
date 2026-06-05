import { ipcMain } from 'electron'
import { loginWithEipGateway, getJobId, isLoggedIn, logout } from './auth-service'

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
    return loginWithEipGateway(username, password, days)
  })

  ipcMain.handle(AUTH_IPC_CHANNELS.LOGOUT, () => {
    logout()
    return { success: true }
  })
}
