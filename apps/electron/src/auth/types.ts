/** 登录状态 */
export interface AuthState {
  isLoggedIn: boolean
  jobId?: string
  displayName?: string
  lastLoginAt?: number
}

/** 持久化的认证数据 */
export interface PersistedAuthData {
  // —— 长期 Token（用于日常接口调用，有效期 365 天）——
  encryptedToken?: string   // safeStorage 加密后的长期 Token（base64）
  token?: string            // 长期 Token 明文（加密不可用时回退）
  expiresAt: number         // 长期 Token 自身过期时间（Unix 毫秒）
  createdAt: number         // 长期 Token 初始签发时间（Unix 毫秒），用于 180 天强制重登判定

  // —— 短期 Token（EIP 网关 Set-Cookie 下发，有效期 4 小时）——
  encryptedShortToken?: string  // safeStorage 加密后的短期 Token（base64）
  shortToken?: string           // 短期 Token 明文（加密不可用时回退）
  shortTokenExpiresAt: number   // 短期 Token 过期时间（签发时间 + 4 小时）

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
  token: string             // 长期 EIPGW-TOKEN JWT 字符串
  shortToken?: string       // 短期 EIPGW-TOKEN JWT 字符串（可能已过期）
  jobId: string             // 工号
  displayName?: string      // 显示名称
  lastLoginAt: number       // 最后登录时间（Unix 毫秒）
  expiresAt: number         // 长期 Token 自身过期时间（Unix 毫秒）
  shortTokenExpiresAt?: number  // 短期 Token 过期时间（Unix 毫秒）
  createdAt: number         // 长期 Token 初始签发时间（Unix 毫秒）
  needsReauth: boolean      // 是否已超过 180 天，需要强制重新登录
}
