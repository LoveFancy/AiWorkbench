import { safeStorage } from 'electron'
import { writeFileSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getConfigDir } from '../main/lib/config-paths'
import { getJobId } from '../auth'
import { httpGet } from '../shared/hteip-client'
import type { ModelInfo, ModelListResponse, ModelsCache } from './types'

const CACHE_FILE = 'models-cache.json'
const DEFAULT_TTL_MS = 3_600_000  // 1 小时

/** 模型列表接口路径（域名由 hteip-client 内部 resolveApiBase() 拼接） */
const MODELS_PATH = '/workmate/models'

function cachePath(): string {
  return join(getConfigDir(), CACHE_FILE)
}

// ===== L1 内存缓存 =====

let l1ApiKey: string | null = null
let l1Models: ModelInfo[] = []
let l1Total: number = 0
let l1CachedAt: number = 0
let l1JobId: string | null = null
let _refreshTimer: ReturnType<typeof setInterval> | null = null

// ===== 总入口：获取 API Key + 模型列表 =====

export async function fetchUserModels(
  forceRefresh = false,
): Promise<ModelListResponse> {
  const currentJobId = getJobId()

  if (!currentJobId) {
    return { apiKey: '', models: [], total: 0 }
  }

  if (!forceRefresh && isCacheValid(currentJobId)) {
    return { apiKey: l1ApiKey ?? '', models: l1Models, total: l1Total }
  }

  const { ok, data } = await httpGet<{ code: number; data: ModelListResponse }>(MODELS_PATH)

  if (!ok || !data || data.code !== 0) {
    return fallbackToOldCache(currentJobId)
  }

  const { apiKey, models, total } = data.data

  l1ApiKey = apiKey
  l1Models = models
  l1Total = total
  l1CachedAt = Date.now()
  l1JobId = currentJobId

  saveCacheToDisk(apiKey, models, total, Date.now(), currentJobId)

  return { apiKey, models, total }
}

// ===== L1 读取 =====

export function getApiKey(): string | null {
  return l1ApiKey
}

export function getModels(): ModelInfo[] {
  return l1Models
}

/**
 * 构建 __platform__ 虚拟渠道，供 channel-manager 的 getChannelById/listChannels 注入。
 * 返回 null 表示无平台模型数据或数据已清除。
 *
 * baseUrl 取第一个有 baseUrl 的模型的地址；若均无则回退到空字符串。
 */
export function getPlatformChannel(): import('@proma/shared').Channel | null {
  if (!l1ApiKey || l1Models.length === 0) return null
  const allEnabled = l1Models.filter((m) => m.enabled)
  if (allEnabled.length === 0) return null
  const firstBaseUrl = allEnabled.find((m) => m.baseUrl)?.baseUrl ?? ''
  return {
    id: '__platform__',
    name: '泰为平台模型',
    provider: 'anthropic',
    baseUrl: firstBaseUrl,
    apiKey: l1ApiKey,
    apiKeyConfigured: true,
    models: allEnabled.map((m) => ({
      id: m.id,
      name: m.name,
      enabled: true,
      supportsMultimodal: m.supportsMultimodal,
    })),
    enabled: true,
    createdAt: 0,
    updatedAt: 0,
  }
}

// ===== 缓存清除 =====

export function clearCache(): void {
  l1ApiKey = null
  l1Models = []
  l1Total = 0
  l1CachedAt = 0
  l1JobId = null
  writeFileSync(cachePath(), JSON.stringify({}), 'utf-8')
}

// ===== 定期刷新 =====

export function initModelRefresh(intervalMs?: number): void {
  const ttl = intervalMs ?? DEFAULT_TTL_MS
  _refreshTimer = setInterval(() => {
    fetchUserModels(true).catch(() => {})
  }, ttl)
}

export function shutdownModelRefresh(): void {
  if (_refreshTimer) {
    clearInterval(_refreshTimer)
    _refreshTimer = null
  }
}

// ===== 启动时从磁盘加载 =====

export function loadCacheFromDisk(jobId?: string): ModelListResponse | null {
  const filePath = cachePath()
  if (!existsSync(filePath)) return null

  try {
    const cache: ModelsCache = JSON.parse(readFileSync(filePath, 'utf-8'))
    if (!cache.models?.length) return null
    if (jobId && cache.jobId && cache.jobId !== jobId) return null

    let apiKey = ''
    if (cache.encryptedApiKey && safeStorage.isEncryptionAvailable()) {
      apiKey = safeStorage.decryptString(Buffer.from(cache.encryptedApiKey, 'base64'))
    } else if (cache.apiKey) {
      apiKey = cache.apiKey
    }

    l1ApiKey = apiKey
    l1Models = cache.models
    l1Total = cache.total
    l1CachedAt = cache.cachedAt
    l1JobId = cache.jobId ?? null

    return { apiKey, models: cache.models, total: cache.total }
  } catch {
    return null
  }
}

// ===== 内部工具 =====

function isCacheValid(jobId: string): boolean {
  if (!l1Models.length) return false
  if (Date.now() - l1CachedAt > DEFAULT_TTL_MS) return false
  if (l1JobId && l1JobId !== jobId) return false
  return true
}

function fallbackToOldCache(jobId: string): ModelListResponse {
  if (l1JobId === jobId && l1Models.length) {
    return { apiKey: l1ApiKey ?? '', models: l1Models, total: l1Total }
  }
  return { apiKey: '', models: [], total: 0 }
}

function saveCacheToDisk(
  apiKey: string, models: ModelInfo[], total: number,
  cachedAt: number, jobId: string,
): void {
  const cache: ModelsCache = { models, total, cachedAt, jobId }
  if (safeStorage.isEncryptionAvailable()) {
    cache.encryptedApiKey = safeStorage.encryptString(apiKey).toString('base64')
  } else {
    cache.apiKey = apiKey
  }
  writeFileSync(cachePath(), JSON.stringify(cache, null, 2), 'utf-8')
}
