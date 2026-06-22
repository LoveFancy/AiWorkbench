/**
 * 专家团远程服务
 *
 * 封装对服务端 /workmate/expert-groups 的 HTTP 请求，包括：
 * - 拉取专家团列表
 * - 拉取精选场景
 * - 磁盘缓存（读写 ~/.workmate/expert-groups-cache.json / featured-scenes-cache.json）
 * - 缓存过期判定
 *
 * HTTP 请求统一走 hteip-client，自动注入 Cookie、超时控制、错误归一化。
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { httpGet } from '../../shared/hteip-client'
import { getConfigDir, getExpertGroupsCachePath, getFeaturedScenesCachePath, getExpertGroupCategoriesCachePath } from './config-paths'

interface CacheEntry<T> {
  data: T
  cachedAt: number
}

function readCache<T>(cachePath: string): CacheEntry<T> | null {
  try {
    if (!existsSync(cachePath)) return null
    const raw = readFileSync(cachePath, 'utf-8')
    return JSON.parse(raw) as CacheEntry<T>
  } catch {
    return null
  }
}

function writeCache<T>(cachePath: string, data: T): void {
  try {
    const configDir = getConfigDir()
    if (!existsSync(configDir)) mkdirSync(configDir, { recursive: true })
    writeFileSync(cachePath, JSON.stringify({ data, cachedAt: Date.now() }), 'utf-8')
  } catch (err) {
    console.warn('[expert-remote] 写入缓存失败:', err)
  }
}

export async function fetchServerExpertGroups(): Promise<import('@proma/shared').ServerExpertGroupSummary[]> {
  const cachePath = getExpertGroupsCachePath()
  const cache = readCache<import('@proma/shared').ServerExpertGroupSummary[]>(cachePath)

  const path = '/workmate/expert-groups'
  const res = await httpGet<{ code: number; data: { items: import('@proma/shared').ServerExpertGroupSummary[]; total: number } }>(path)

  if (!res.ok || !res.data || res.data.code !== 0) {
    console.warn('[expert-remote] 获取专家团列表失败: status=%d err=%s', res.status, res.error ?? res.data)
    if (cache) return cache.data
    throw new Error(res.error || '获取专家团列表失败')
  }

  const items = res.data.data.items
  writeCache(cachePath, items)
  return items
}

export async function fetchFeaturedScenes(): Promise<import('@proma/shared').FeaturedScene[]> {
  const cachePath = getFeaturedScenesCachePath()
  const cache = readCache<import('@proma/shared').FeaturedScene[]>(cachePath)

  const path = '/workmate/expert-groups/featured-scenes'
  const res = await httpGet<{ code: number; data: { scenes: import('@proma/shared').FeaturedScene[] } }>(path)

  if (!res.ok || !res.data || res.data.code !== 0) {
    console.warn('[expert-remote] 获取精选场景失败: status=%d err=%s', res.status, res.error ?? res.data)
    if (cache) return cache.data
    throw new Error(res.error || '获取精选场景失败')
  }

  const scenes = res.data.data.scenes
  writeCache(cachePath, scenes)
  return scenes
}

export async function fetchServerExpertGroupCategories(): Promise<string[]> {
  const cachePath = getExpertGroupCategoriesCachePath()
  const cache = readCache<string[]>(cachePath)

  const path = '/workmate/expert-groups/categories'
  const res = await httpGet<{ code: number; data: { categories: string[] } }>(path)

  if (!res.ok || !res.data || res.data.code !== 0) {
    console.warn('[expert-remote] 获取分类列表失败: status=%d err=%s', res.status, res.error ?? res.data)
    if (cache) return cache.data
    throw new Error(res.error || '获取分类列表失败')
  }

  const categories = res.data.data.categories
  writeCache(cachePath, categories)
  return categories
}

/**
 * 拉取单个专家团详情（用于召唤时的实时版本检查）。
 *
 * - 1s 超时，避免阻塞召唤；超时由 httpGet 归一化为 { ok:false }，不抛异常。
 * - 不读写磁盘缓存——版本检查必须命中服务端最新值。
 * - 失败（网络异常/超时/业务错误码）一律返回 null，交由上层降级为本地版本。
 *
 * @param get 注入点，默认走 hteip-client 的 httpGet（便于测试）。
 */
export async function fetchServerExpertGroupDetail(
  id: string,
  get: typeof httpGet = httpGet,
): Promise<import('@proma/shared').ServerExpertGroupSummary | null> {
  const path = `/workmate/expert-groups/group-detail/${encodeURIComponent(id)}`
  const res = await get<{ code: number; data: import('@proma/shared').ServerExpertGroupSummary }>(
    path,
    { timeoutMs: 1000 },
  )

  if (!res.ok || !res.data || res.data.code !== 0) {
    console.warn('[expert-remote] 获取专家团详情失败: id=%s status=%d err=%s', id, res.status, res.error ?? res.data)
    return null
  }

  return res.data.data
}
