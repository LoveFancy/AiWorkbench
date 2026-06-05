/** 登录状态 */
export interface AuthState {
  isLoggedIn: boolean
  jobId?: string
  displayName?: string
  lastLoginAt?: number
}

/** 持久化的认证数据 */
export interface PersistedAuthData {
  encryptedToken?: string   // safeStorage 加密后的 base64
  token?: string            // 明文（加密不可用时回退）
  expiresAt: number         // Token 自身过期时间（Unix 毫秒）
  createdAt: number         // Token 初始签发时间（Unix 毫秒），用于 180 天强制重登判定
  jobId: string
  displayName?: string
  lastLoginAt: number       // 最后一次登录时间
}

/** 登录结果 */
export interface LoginResult {
  success: boolean
  message: string
  jobId?: string
  tokenExpiresAt?: number
}

/** 统一对外返回的认证信息（getAuthInfo() 返回值） */
export interface AuthInfo {
  token: string             // EIPGW-TOKEN JWT 字符串
  jobId: string             // 工号
  displayName?: string      // 显示名称
  lastLoginAt: number       // 最后登录时间（Unix 毫秒）
  expiresAt: number         // Token 自身过期时间（Unix 毫秒）
  createdAt: number         // Token 初始签发时间（Unix 毫秒）
  needsReauth: boolean      // 是否已超过 180 天，需要强制重新登录
}
