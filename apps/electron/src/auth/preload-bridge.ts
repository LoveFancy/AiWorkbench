import { ipcRenderer } from 'electron'
import { AUTH_IPC_CHANNELS } from './ipc-handlers'

export interface AuthElectronAPI {
  getAuthState: () => Promise<{ isLoggedIn: boolean; jobId?: string }>
  getAuthInfo: () => Promise<{
    jobId: string; displayName?: string; lastLoginAt: number
    expiresAt: number; createdAt: number; needsReauth: boolean
  } | null>
  checkSession: () => Promise<{ isLoggedIn: boolean; jobId?: string; needsReauth?: boolean }>
  login: (username: string, password: string, days?: number) => Promise<{
    success: boolean; message: string; jobId?: string; tokenExpiresAt?: number
  }>
  logout: () => Promise<{ success: boolean }>
  quit: () => Promise<void>
}

/**
 * 返回 auth 相关的 preload API，供 preload/index.ts 合并到 electronAPI 中。
 *
 * 调用方式（preload/index.ts 中）：
 *   import { createAuthPreloadApi } from '../auth'
 *   const electronAPI: ElectronAPI = { ...existingAPI, ...createAuthPreloadApi() }
 */
export function createAuthPreloadApi(): { auth: AuthElectronAPI } {
  return {
    auth: {
      getAuthState: () => ipcRenderer.invoke(AUTH_IPC_CHANNELS.GET_AUTH_STATE),
      getAuthInfo: () => ipcRenderer.invoke(AUTH_IPC_CHANNELS.GET_AUTH_INFO),
      checkSession: () => ipcRenderer.invoke(AUTH_IPC_CHANNELS.CHECK_SESSION),
      login: (username: string, password: string, days?: number) =>
        ipcRenderer.invoke(AUTH_IPC_CHANNELS.LOGIN, username, password, days),
      logout: () => ipcRenderer.invoke(AUTH_IPC_CHANNELS.LOGOUT),
      quit: () => ipcRenderer.invoke(AUTH_IPC_CHANNELS.QUIT),
    },
  }
}
