import { safeStorage } from 'electron'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { getConfigDir, getSettingsPath } from '../main/lib/config-paths'
import type { LoginResult, PersistedAuthData, AuthInfo } from './types'

const AUTH_FILE = 'auth.json'

export interface AuthPathProvider {
  getConfigDir(): string
  getSettingsPath(): string
}

const defaultPathProvider: AuthPathProvider = {
  getConfigDir,
  getSettingsPath,
}

let pathProvider = defaultPathProvider

/** 测试专用：避免全局 mock config-paths 影响同一进程里的其他测试。 */
export function setAuthPathProviderForTest(provider: AuthPathProvider | null): void {
  pathProvider = provider ?? defaultPathProvider
}

/** 从 settings.json 读取 eipGatewayBase，未配置时回退到生产地址 */
export function getEipGatewayBase(): string {
  const settingsPath = pathProvider.getSettingsPath()
  try {
    if (existsSync(settingsPath)) {
      const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
      if (typeof settings.eipGatewayBase === 'string' && settings.eipGatewayBase.trim()) {
        return settings.eipGatewayBase.trim()
      }
    }
  } catch { /* settings.json 损坏时走默认 */ }
  return 'http://eip.htsc.com.cn/gateway'
}

/** 强制重新登录天数：自 Token 初始签发起超过此天数必须重新登录 */
const FORCED_REAUTH_DAYS = 30

function getAuthFilePath(): string {
  return join(pathProvider.getConfigDir(), AUTH_FILE)
}

// ===== 总入口：完整登录流程 =====

export async function loginWithEipGateway(
  username: string, password: string, longTermDays: number = 30,
): Promise<LoginResult> {
  console.log('[Auth] 开始登录流程 username=%s days=%d base=%s', username, longTermDays, getEipGatewayBase())

  // Step 1: EIP 网关登录
  const loginResult = await login(username, password)
  if (!loginResult.success || !loginResult.jobId || !loginResult.shortToken) {
    console.error('[Auth] Step 1 登录失败: %s', loginResult.message)
    return { success: false, message: loginResult.message }
  }
  console.log('[Auth] Step 1 登录成功 jobId=%s', loginResult.jobId)

  // Step 2: 换取长期 Token
  const longTerm = await getLongTermToken(loginResult.shortToken, longTermDays)
  if (!longTerm) {
    console.error('[Auth] Step 2 获取长期Token失败')
    return { success: false, message: '获取长期 Token 失败' }
  }
  console.log('[Auth] Step 2 长期Token获取成功 days=%d', longTerm.days)

  // Step 3: 安全存储长期 Token
  saveToken(longTerm.token, loginResult.jobId, longTermDays)
  console.log('[Auth] Step 3 Token已存储到 %s', getAuthFilePath())

  return {
    success: true,
    message: '登录成功',
    jobId: loginResult.jobId,
    tokenExpiresAt: Date.now() + longTermDays * 24 * 60 * 60 * 1000,
  }
}

// ===== Step 1: EIP 网关登录 =====

async function login(
  username: string, password: string,
): Promise<{ success: boolean; message: string; jobId?: string; shortToken?: string }> {
  const base = getEipGatewayBase()
  const url = `${base}/login`
  console.log('[Auth] POST %s', url)

  // 从 base URL 解析 Origin / Host
  const parsed = new URL(base)
  const origin = parsed.origin
  const host = parsed.host

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': origin,
        'Host': host,
      },
      body: JSON.stringify({ username, password }),
      redirect: 'manual',
    })

    if (response.status !== 200) {
      console.error('[Auth] 登录响应 HTTP %d', response.status)
      return { success: false, message: `登录失败: HTTP ${response.status}` }
    }

    const setCookie = response.headers.get('set-cookie') ?? ''
    const token = extractToken(setCookie)
    if (!token) {
      console.error('[Auth] 未从响应中提取到 EIPGW-TOKEN, set-cookie=%s', setCookie)
      return { success: false, message: '登录失败: 未获取到 EIPGW-TOKEN' }
    }

    const jobId = parseJobId(token)
    return { success: true, message: '登录成功', jobId: jobId ?? username, shortToken: token }
  } catch (error) {
    console.error('[Auth] 登录请求异常: %s', (error as Error).message)
    return { success: false, message: `登录请求异常: ${(error as Error).message}` }
  }
}

// ===== Step 2: 获取长期 Token =====

async function getLongTermToken(
  shortTermToken: string, days: number = 365,
): Promise<{ token: string; days: number } | null> {
  const url = `${getEipGatewayBase()}/manage/user/token/generate?days=${days}`
  console.log('[Auth] GET %s', url)
  try {
    const response = await fetch(url,
      { headers: { 'Cookie': `EIPGW-TOKEN=${shortTermToken}` } },
    )
    if (!response.ok) {
      console.error('[Auth] 长期Token请求失败 HTTP %d', response.status)
      return null
    }

    const text = await response.text()
    // 匹配 "您的token为：<token>" — token 后紧跟逗号或空白，用 [^,\s]+ 兜底捕获
    // JWT 字符集为 base64url：A-Za-z0-9 - _ . 但用排除法更鲁棒
    const match = text.match(/您的token为[：:]\s*([^,\s]+)/)
    if (!match || !match[1]) {
      console.error('[Auth] 长期Token响应格式不匹配: %s', text.substring(0, 200))
      return null
    }
    return { token: match[1], days }
  } catch (err) {
    console.error('[Auth] 长期Token请求异常: %s', (err as Error).message)
    return null
  }
}

// ===== Step 3: 本地安全存储 =====

function saveToken(token: string, jobId: string, days: number): void {
  const now = Date.now()
  const expiresAt = now + days * 24 * 60 * 60 * 1000
  const authData: PersistedAuthData = {
    jobId,
    expiresAt,
    createdAt: now,
    lastLoginAt: now,
  }

  if (safeStorage.isEncryptionAvailable()) {
    authData.encryptedToken = safeStorage.encryptString(token).toString('base64')
  } else {
    authData.token = token
  }

  writeFileSync(getAuthFilePath(), JSON.stringify(authData, null, 2), 'utf-8')
}

// ===== 读取方法（供其他模块调用）=====

export function getToken(): string | null {
  const filePath = getAuthFilePath()
  if (!existsSync(filePath)) return null

  try {
    const data: PersistedAuthData = JSON.parse(readFileSync(filePath, 'utf-8'))
    if (data.expiresAt && Date.now() > data.expiresAt) return null

    if (data.encryptedToken && safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(Buffer.from(data.encryptedToken!, 'base64'))
    }
    return data.token ?? null
  } catch { return null }
}

export function getJobId(): string | null {
  try {
    const data: PersistedAuthData = JSON.parse(readFileSync(getAuthFilePath(), 'utf-8'))
    return data.jobId ?? null
  } catch { return null }
}

export function isLoggedIn(): boolean {
  const token = getToken()
  if (!token) return false
  return parseJobId(token) !== null
}

/**
 * 轻量会话校验：仅读 auth.json + 比对 expiresAt，跳过 safeStorage 解密与 JWT 解析。
 * 用于高频路径（如观测上报前置拦截）判断「是否存在未过期的有效凭证」。
 */
export function hasValidSession(): boolean {
  const filePath = getAuthFilePath()
  if (!existsSync(filePath)) return false

  try {
    const data: PersistedAuthData = JSON.parse(readFileSync(filePath, 'utf-8'))
    if (!data.expiresAt || Date.now() > data.expiresAt) return false
    return Boolean(data.encryptedToken || data.token)
  } catch { return false }
}

/** 统一对外接口：一次性读取 token + 工号 + 登录时间 + 过期时间 + 是否需要重登 */
export function getAuthInfo(): AuthInfo | null {
  const filePath = getAuthFilePath()
  if (!existsSync(filePath)) return null

  try {
    const data: PersistedAuthData = JSON.parse(readFileSync(filePath, 'utf-8'))

    let token: string | null = null
    if (data.encryptedToken && safeStorage.isEncryptionAvailable()) {
      token = safeStorage.decryptString(Buffer.from(data.encryptedToken!, 'base64'))
    } else if (data.token) {
      token = data.token
    }

    // Token 自身已过期
    if (!token || (data.expiresAt && Date.now() > data.expiresAt)) {
      return null
    }
    // TS 窄化：此时 token 一定非 null
    const safeToken: string = token

    const now = Date.now()
    const createdAt = data.createdAt ?? data.lastLoginAt  // 兼容旧数据（无 createdAt 字段）
    const needsReauth = (now - createdAt) > FORCED_REAUTH_DAYS * 24 * 60 * 60 * 1000

    return {
      token: safeToken,
      jobId: data.jobId,
      displayName: data.displayName,
      lastLoginAt: data.lastLoginAt,
      expiresAt: data.expiresAt,
      createdAt,
      needsReauth,
    }
  } catch { return null }
}

/** 判断是否超过 180 天需要强制重新登录（不读取 Token 解密，轻量检查） */
export function needsReauth(): boolean {
  const filePath = getAuthFilePath()
  if (!existsSync(filePath)) return false

  try {
    const data: PersistedAuthData = JSON.parse(readFileSync(filePath, 'utf-8'))
    const createdAt = data.createdAt ?? data.lastLoginAt
    return (Date.now() - createdAt) > FORCED_REAUTH_DAYS * 24 * 60 * 60 * 1000
  } catch { return false }
}

export function logout(): void {
  writeFileSync(getAuthFilePath(), JSON.stringify({}), 'utf-8')
}

// ===== Cookie 构建（供其他模块如上报/升级检测调用）=====

export function buildAuthHeaders(): Record<string, string> {
  const token = getToken()
  if (token) {
    return { 'Cookie': `EIPGW-TOKEN=${token}` }
  }
  return {}
}

// ===== 工具函数 =====

export function extractToken(header: string): string | null {
  const match = header.match(/EIPGW-TOKEN=([^;]+)/)
  return match ? (match[1] ?? null) : null
}

export function parseJobId(jwt: string): string | null {
  try {
    const parts = jwt.split('.')
    if (parts.length !== 3) return null
    const payload = JSON.parse(Buffer.from(parts[1]!, 'base64').toString('utf-8'))
    return payload.mid ?? null
  } catch { return null }
}
