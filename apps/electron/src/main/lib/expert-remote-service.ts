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
