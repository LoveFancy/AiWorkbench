/**
 * hi-agent / SkillHub 统一认证服务
 *
 * 负责：读写 ~/.htskill/auth.json，提供统一 Token 获取入口。
 * Token 来源唯一：SkillHub 换票（EIPGW-TOKEN → accessToken）。
 * 明文存储，不加密。
 */

import { homedir } from 'node:os'
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { getValidSkillHubToken } from './skillhub-auth-service'

// ===== 常量 =====

const HT_SKILL_DIR = join(homedir(), '.htskill')
const AUTH_FILE = join(HT_SKILL_DIR, 'auth.json')

// ===== 类型 =====

export interface HiAgentAuthEntry {
  tokenType: string
  accessToken: string
  expiresAt: string
  refreshToken?: string
  runtime: string
  env: string
  gatewayBaseUrl: string
}

// ===== 文件读写 =====

function ensureDir(): void {
  if (!existsSync(HT_SKILL_DIR)) {
    mkdirSync(HT_SKILL_DIR, { recursive: true })
  }
}

function readAuthFileRaw(): Record<string, HiAgentAuthEntry> {
  if (!existsSync(AUTH_FILE)) return {}
  try {
    return JSON.parse(readFileSync(AUTH_FILE, 'utf-8'))
  } catch {
    return {}
  }
}

/** 读取 uat key 的 Token */
export function readUatAuth(): HiAgentAuthEntry | null {
  const auth = readAuthFileRaw()
  const entry = auth['uat']
  if (!entry || typeof entry.accessToken !== 'string') return null
  return entry
}

/** 写入 uat key（明文） */
export function writeUatAuth(entry: HiAgentAuthEntry): void {
  ensureDir()
  const existing = readAuthFileRaw()
  existing['uat'] = entry
  writeFileSync(AUTH_FILE, JSON.stringify(existing, null, 2), 'utf-8')
}

/** 检查 Token 是否已过期 */
export function isExpired(entry: HiAgentAuthEntry): boolean {
  if (!entry.expiresAt) return true
  return Date.now() > new Date(entry.expiresAt).getTime()
}

// ===== Token 获取 =====

/** 提前刷新阈值：距离过期不足 5 分钟时主动刷新 */
const REFRESH_THRESHOLD_MS = 5 * 60 * 1000

/**
 * 获取有效的 uat Token
 *
 * 策略：
 *   1. auth.json 存在且未过期 → 直接返回
 *   2. 不存在或即将过期 → 自动 SkillHub 换票 → 写回 auth.json
 *   3. 换票失败 → 返回 null
 */
export async function getValidUatToken(): Promise<HiAgentAuthEntry | null> {
  const cached = readUatAuth()
  if (cached && cached.expiresAt) {
    const expiry = new Date(cached.expiresAt).getTime()
    if (Date.now() < expiry - REFRESH_THRESHOLD_MS) {
      setEnvFromEntry(cached)
      return cached
    }
  }

  try {
    await getValidSkillHubToken()
    const entry = readUatAuth()
    if (entry) {
      console.log('[HiAgent 认证] Token 已就绪, expiresAt=%s', entry.expiresAt)
      setEnvFromEntry(entry)
      return entry
    }
    console.warn('[HiAgent 认证] 换票后未能读取 auth.json')
    return null
  } catch (err) {
    console.warn('[HiAgent 认证] 换票失败:', (err as Error).message)
    return null
  }
}

/** 将认证信息注入 process.env */
function setEnvFromEntry(entry: HiAgentAuthEntry): void {
  process.env.HTSKILL_TOKEN = entry.accessToken
  process.env.AGENTOS_ENV = entry.env || 'uat'
}

/** 返回 auth.json 文件路径 */
export function getHiAgentAuthPath(): string {
  return AUTH_FILE
}
