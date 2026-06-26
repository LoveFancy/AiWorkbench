/**
 * SkillHub 认证服务
 *
 * 负责：EIPGW-TOKEN → SkillHub accessToken 换票 → 明文写 ~/.htskill/auth.json
 *
 * 依赖：fanxuande 分支的 auth/ 模块（EIP 登录），通过 getToken() 复用 EIPGW-TOKEN
 */

import { app } from 'electron'
import { existsSync, readFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { getSettingsPath } from './config-paths'
import { writeJsonFileAtomic } from './safe-file'
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

export function shouldUseMockSkillHub(): boolean {
  if (process.env.WORKMATE_SKILLHUB_MOCK === '1') return true
  if (process.env.WORKMATE_SKILLHUB_MOCK === '0') return false
  if (app.isPackaged) return false
  return process.env.NODE_ENV !== 'production'
}

// ===== 内部类型 =====

interface SkillHubAuthEntry {
  tokenType: string
  accessToken: string
  expiresAt: string    // ISO 8601
  env: string
  gatewayBaseUrl: string
}

// ===== 内部工具 =====

/** ~/.htskill/auth.json 路径 */
function authPath(): string {
  return join(homedir(), '.htskill', 'auth.json')
}

function readAuthFileRaw(): Record<string, SkillHubAuthEntry> {
  if (!existsSync(authPath())) return {}
  try {
    return JSON.parse(readFileSync(authPath(), 'utf-8'))
  } catch {
    return {}
  }
}

function writeUatEntry(entry: SkillHubAuthEntry): void {
  const dir = join(homedir(), '.htskill')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  const existing = readAuthFileRaw()
  existing['uat'] = entry
  writeJsonFileAtomic(authPath(), existing)
}

function getCachedValidToken(): string | null {
  const auth = readAuthFileRaw()
  const entry = auth['uat']
  if (!entry || typeof entry.accessToken !== 'string') return null

  const now = Date.now()
  const expiry = new Date(entry.expiresAt).getTime()
  if (now < expiry - REFRESH_THRESHOLD_MS) {
    return entry.accessToken
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
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()

  writeUatEntry({
    tokenType: 'Bearer',
    accessToken: token,
    expiresAt,
    env: 'uat',
    gatewayBaseUrl: getSkillHubBase(),
  })

  console.log(`[SkillHub 认证] 换票成功, expiresAt=${expiresAt}`)
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
  if (shouldUseMockSkillHub()) {
    return 'mock-skillhub-token'
  }

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
  if (shouldUseMockSkillHub()) {
    return {
      authenticated: true,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      remainingSeconds: 24 * 60 * 60,
    }
  }

  const auth = readAuthFileRaw()
  const entry = auth['uat']
  if (!entry || typeof entry.accessToken !== 'string') return { authenticated: false }

  const now = Date.now()
  const expiry = new Date(entry.expiresAt).getTime()
  return {
    authenticated: now < expiry,
    expiresAt: expiry,
    remainingSeconds: Math.max(0, Math.floor((expiry - now) / 1000)),
  }
}

/**
 * 清除 SkillHub 认证状态（仅清 uat key，保留其他环境）
 */
export function clearSkillHubAuth(): void {
  const p = authPath()
  if (existsSync(p)) {
    const existing = readAuthFileRaw()
    delete existing['uat']
    writeJsonFileAtomic(p, existing)
    console.log('[SkillHub 认证] 已清除 uat 认证')
  }
}
