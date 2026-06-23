/**
 * 本地 API 设置服务
 *
 * Token 只保存 SHA-256 哈希，明文只在重置时返回一次。
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto'
import { getLocalApiSettingsPath } from './config-paths'
import {
  LOCAL_API_DEFAULT_HOST,
  LOCAL_API_DEFAULT_PORT,
  LOCAL_API_REMOTE_HOST,
} from './local-api-types'
import type { LocalApiPublicSettings, LocalApiSettings, LocalApiTokenResetResult } from './local-api-types'

export const DEFAULT_LOCAL_API_SETTINGS: LocalApiSettings = {
  enabled: false,
  host: LOCAL_API_DEFAULT_HOST,
  port: LOCAL_API_DEFAULT_PORT,
  apiTokenHash: null,
  corsOrigins: [],
  allowRemoteAccess: false,
  defaultPermissionMode: 'auto',
  allowBypassPermissions: false,
  maxConcurrentRuns: null,
  requestLoggingEnabled: true,
}

export function hashLocalApiToken(token: string): string {
  return createHash('sha256').update(token, 'utf-8').digest('hex')
}

export function verifyLocalApiToken(token: string, hash: string | null): boolean {
  if (!hash) return false
  const actual = Buffer.from(hashLocalApiToken(token), 'hex')
  const expected = Buffer.from(hash, 'hex')
  if (actual.length !== expected.length) return false
  return timingSafeEqual(actual, expected)
}

export function toPublicLocalApiSettings(settings: LocalApiSettings): LocalApiPublicSettings {
  return {
    enabled: settings.enabled,
    host: settings.host,
    port: settings.port,
    hasApiToken: Boolean(settings.apiTokenHash),
    corsOrigins: settings.corsOrigins,
    allowRemoteAccess: settings.allowRemoteAccess,
    defaultPermissionMode: settings.defaultPermissionMode,
    allowBypassPermissions: settings.allowBypassPermissions,
    maxConcurrentRuns: settings.maxConcurrentRuns,
    requestLoggingEnabled: settings.requestLoggingEnabled,
  }
}

function normalizePort(port: unknown): number {
  if (typeof port !== 'number' || !Number.isInteger(port)) return LOCAL_API_DEFAULT_PORT
  if (port < 1 || port > 65535) return LOCAL_API_DEFAULT_PORT
  return port
}

function normalizeSettings(input: Partial<LocalApiSettings>): LocalApiSettings {
  const allowRemoteAccess = input.allowRemoteAccess ?? DEFAULT_LOCAL_API_SETTINGS.allowRemoteAccess
  const host = allowRemoteAccess && input.host === LOCAL_API_REMOTE_HOST
    ? LOCAL_API_REMOTE_HOST
    : LOCAL_API_DEFAULT_HOST
  const maxConcurrentRuns = typeof input.maxConcurrentRuns === 'number' && input.maxConcurrentRuns > 0
    ? Math.floor(input.maxConcurrentRuns)
    : null
  const allowBypassPermissions = input.allowBypassPermissions ?? false
  const defaultPermissionMode = input.defaultPermissionMode === 'plan'
    ? 'plan'
    : input.defaultPermissionMode === 'bypassPermissions' && allowBypassPermissions
      ? 'bypassPermissions'
      : 'auto'

  return {
    ...DEFAULT_LOCAL_API_SETTINGS,
    ...input,
    host,
    port: normalizePort(input.port),
    corsOrigins: Array.isArray(input.corsOrigins)
      ? input.corsOrigins.filter((origin) => typeof origin === 'string' && origin.trim()).map((origin) => origin.trim())
      : [],
    allowRemoteAccess,
    defaultPermissionMode,
    allowBypassPermissions,
    maxConcurrentRuns,
    requestLoggingEnabled: input.requestLoggingEnabled ?? true,
    apiTokenHash: typeof input.apiTokenHash === 'string' ? input.apiTokenHash : null,
  }
}

export function readLocalApiSettings(filePath = getLocalApiSettingsPath()): LocalApiSettings {
  if (!existsSync(filePath)) return DEFAULT_LOCAL_API_SETTINGS

  try {
    const raw = readFileSync(filePath, 'utf-8')
    return normalizeSettings(JSON.parse(raw) as Partial<LocalApiSettings>)
  } catch (error) {
    console.error('[本地 API] 读取设置失败:', error)
    return DEFAULT_LOCAL_API_SETTINGS
  }
}

export function saveLocalApiSettings(
  updates: Partial<LocalApiSettings>,
  filePath = getLocalApiSettingsPath(),
): LocalApiSettings {
  const current = readLocalApiSettings(filePath)
  const settings = normalizeSettings({ ...current, ...updates })
  writeFileSync(filePath, JSON.stringify(settings, null, 2), 'utf-8')
  return settings
}

export function generateLocalApiToken(filePath = getLocalApiSettingsPath()): { token: string; settings: LocalApiSettings } {
  const token = `wma_${randomBytes(24).toString('base64url')}`
  const settings = saveLocalApiSettings({ apiTokenHash: hashLocalApiToken(token) }, filePath)
  return { token, settings }
}

export function resetLocalApiToken(filePath = getLocalApiSettingsPath()): LocalApiTokenResetResult {
  const result = generateLocalApiToken(filePath)
  return {
    token: result.token,
    settings: result.settings,
    publicSettings: toPublicLocalApiSettings(result.settings),
  }
}
