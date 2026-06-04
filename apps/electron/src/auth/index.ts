// 类型
export type { AuthState, PersistedAuthData, LoginResult, AuthInfo } from './types'
export type { AuthAtomState } from './atoms'
export type { AuthElectronAPI } from './preload-bridge'

// 服务层
export {
  loginWithEipGateway,
  getToken,
  getJobId,
  isLoggedIn,
  needsReauth,
  getAuthInfo,
  logout,
  buildAuthHeaders,
} from './auth-service'

// IPC 注册
export { registerAuthIpcHandlers, AUTH_IPC_CHANNELS } from './ipc-handlers'

// Preload 桥接
export { createAuthPreloadApi } from './preload-bridge'

// 状态
export { authStateAtom, isLoggedInAtom, currentJobIdAtom } from './atoms'

// 组件
export { LoginView } from './LoginView'
