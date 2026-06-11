/**
 * SkillHub 认证服务
 *
 * 负责：EIPGW-TOKEN → SkillHub accessToken 换票 → 加密存储 → 自动刷新
 *
 * 依赖：fanxuande 分支的 auth/ 模块（EIP 登录），通过 getToken() 复用 EIPGW-TOKEN
 */

import { safeStorage } from 'electron'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { getConfigDir, getSettingsPath } from './config-paths'
import { readJsonFileSafe, writeJsonFileAtomic } from './safe-file'
import { getToken } from '../../auth/auth-service'
import { resolveApiBase } from '../../shared/hteip-client'

// ===== 常量 =====

const DEFAULT_SKILLHUB_API_BASE = 'http://eip.htsc.com.cn'

/** 从 settings.json 读取 skillHubBase（认证域名），未配置时回退到 resolveApiBase() */
export function getSkillHubBase(): string {
  const settingsPath = getSettingsPath()
  try {
    if (existsSync(settingsPath)) {
      const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
      if (typeof settings.skillHubBase === 'string' && settings.skillHubBase.trim()) {
        return settings.skillHubBase.trim()
      }
    }
  } catch { /* settings.json 损坏时走默认 */ }
  return resolveApiBase()
}

/**
 * 从 settings.json 读取 skillHubApiBase，未配置时回退到 skillHubBase（向后兼容），
 * 最终兜底到 DEFAULT_SKILLHUB_API_BASE。
 * 用于市场查询、详情、下载等 API 请求，与认证换票的 domain 不同。
 */
export function getSkillHubApiBase(): string {
  const settingsPath = getSettingsPath()
  try {
    if (existsSync(settingsPath)) {
      const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
      if (typeof settings.skillHubApiBase === 'string' && settings.skillHubApiBase.trim()) {
        return settings.skillHubApiBase.trim()
      }
      if (typeof settings.skillHubBase === 'string' && settings.skillHubBase.trim()) {
        return settings.skillHubBase.trim()
      }
    }
  } catch { /* settings.json 损坏时走默认 */ }
  return DEFAULT_SKILLHUB_API_BASE
}

const DEFAULT_AUTH_URL_PATH = '/ai_skillhub_bff/api/v1/auth/token?clientId=WEBIDE&env=test'

/**
 * 从 settings.json 读取 skillHubAuthPath，未配置时回退到代码默认值。
 * 例如可配置为 /ai_skillhub_bff/api/v1/auth/token?clientId=OTHER&env=prod
 */
export function getSkillHubAuthPath(): string {
  const settingsPath = getSettingsPath()
  try {
    if (existsSync(settingsPath)) {
      const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
      if (typeof settings.skillHubAuthPath === 'string' && settings.skillHubAuthPath.trim()) {
        return settings.skillHubAuthPath.trim()
      }
    }
  } catch { /* settings.json 损坏时走默认 */ }
  return DEFAULT_AUTH_URL_PATH
}

/** 提前刷新阈值：距离过期不足 5 分钟时主动刷新 */
const REFRESH_THRESHOLD_MS = 5 * 60 * 1000

// ===== 内部类型 =====

interface SkillHubAuthFile {
  version: number
  accessToken: string   // safeStorage 加密后的 base64
  expiresAt: number     // Unix 毫秒
  updatedAt: string     // ISO 8601
}

// ===== 内部工具 =====

function authPath(): string {
  return join(getConfigDir(), 'skillhub-auth.json')
}

function readAuthFile(): SkillHubAuthFile | null {
  return readJsonFileSafe<SkillHubAuthFile>(authPath())
}

function writeAuthFile(data: SkillHubAuthFile): void {
  writeJsonFileAtomic(authPath(), data)
}

function encrypt(plain: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    console.warn('[SkillHub 认证] safeStorage 不可用，Token 将明文存储')
    return plain
  }
  return safeStorage.encryptString(plain).toString('base64')
}

function decrypt(base64: string): string {
  if (base64 === '') return ''
  if (!safeStorage.isEncryptionAvailable()) {
    return base64
  }
  return safeStorage.decryptString(Buffer.from(base64, 'base64'))
}

function getCachedValidToken(): string | null {
  const file = readAuthFile()
  if (!file) return null

  const now = Date.now()
  if (now < file.expiresAt - REFRESH_THRESHOLD_MS) {
    try {
      return decrypt(file.accessToken)
    } catch (err) {
      console.warn('[SkillHub 认证] 缓存的 Token 解密失败:', err)
    }
  }
  return null
}

// ===== Token 刷新锁 =====

let refreshPromise: Promise<string> | null = null

// ===== 公开 API =====

/**
 * 用 EIPGW-TOKEN 换取 SkillHub accessToken
 *
 * 直接复用 fanxuande 分支的 getToken() 获取长期 EIPGW-TOKEN（365d），
 * 不再需要短期 JWT / 双 Token 管理。
 */
export async function exchangeToken(): Promise<string> {
  const eipgwToken = getToken()
  if (!eipgwToken) {
    throw new Error('EIP 未登录，请先登录 EIP 网关')
  }

  const authUrl = `${getSkillHubBase()}${getSkillHubAuthPath()}`
  console.log('[SkillHub 认证] 换票 POST %s', authUrl)

  let response: Response
  try {
    response = await fetch(authUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `EIPGW-TOKEN=${eipgwToken}`,
      },
    })
  } catch (err) {
    throw new Error(`无法连接 SkillHub 认证服务: ${(err as Error).message}`)
  }

  console.log('[SkillHub 认证] 换票响应 HTTP %d', response.status)
  if (!response.ok) {
    const text = await response.text().catch(() => '(响应读取失败)')
    if (response.status === 401) {
      throw new Error('EIP 凭证无效，请重新登录 EIP 网关')
    }
    throw new Error(`SkillHub 认证失败 (${response.status}): ${text}`)
  }

  // 兼容两种响应格式：
  // 1. 扁平：{ accessToken, expiresIn }（文档约定）
  // 2. 信封：{ code, data: { accessToken, expiresIn } }
  const body = (await response.json()) as Record<string, unknown>
  const flatAccessToken = typeof body.accessToken === 'string' ? body.accessToken : null
  const tokenData = flatAccessToken ? body : (body.data as Record<string, unknown> | undefined)

  if (!tokenData || typeof tokenData.accessToken !== 'string') {
    throw new Error(`SkillHub 认证响应缺少 accessToken: ${JSON.stringify(body).substring(0, 200)}`)
  }

  const token = tokenData.accessToken
  const expiresIn = typeof tokenData.expiresIn === 'number' ? tokenData.expiresIn : 7200
  const expiresAt = Date.now() + expiresIn * 1000

  writeAuthFile({
    version: 1,
    accessToken: encrypt(token),
    expiresAt,
    updatedAt: new Date().toISOString(),
  })

  console.log(`[SkillHub 认证] 换票成功, expiresAt=${new Date(expiresAt).toISOString()}`)
  return token
}

/**
 * 获取有效的 SkillHub Token
 *
 * 策略：
 *   1. 缓存未过期 → 直接返回
 *   2. 需要刷新 → 加锁避免并发重复请求，用 EIPGW-TOKEN 重新换票
 *   3. EIPGW-TOKEN 也过期 → 抛异常
 */
export async function getValidSkillHubToken(): Promise<string> {
  // 已有有效 token 直接返回（不走锁）
  const cached = getCachedValidToken()
  if (cached) {
    console.log('[SkillHub 认证] 使用缓存 Token')
    return cached
  }

  // 需要刷新时加锁，避免并发重复请求
  if (!refreshPromise) {
    refreshPromise = exchangeToken().finally(() => {
      refreshPromise = null
    })
  }
  return refreshPromise
}

/**
 * 获取 SkillHub 认证状态
 */
export function getSkillHubAuthStatus(): {
  authenticated: boolean
  expiresAt?: number
  remainingSeconds?: number
} {
  const file = readAuthFile()
  if (!file) return { authenticated: false }

  const now = Date.now()
  const remainingMs = file.expiresAt - now
  return {
    authenticated: remainingMs > 0,
    expiresAt: file.expiresAt,
    remainingSeconds: Math.max(0, Math.floor(remainingMs / 1000)),
  }
}

/**
 * 清除 SkillHub 认证状态
 */
export function clearSkillHubAuth(): void {
  const p = authPath()
  if (existsSync(p)) {
    rmSync(p)
    console.log('[SkillHub 认证] 已清除')
  }
}
