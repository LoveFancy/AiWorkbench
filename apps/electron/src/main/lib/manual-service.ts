/**
 * 使用手册服务
 *
 * 三级降级获取手册内容：
 *   1. 从服务端拉取最新版本
 *   2. 服务端失败 → 返回本地缓存
 *   3. 无缓存 → 返回内置 fallback（tutorial/tutorial.md）
 *
 * 全程不抛异常，失败时静默降级。
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { httpGet } from '../../shared/hteip-client'
import { getConfigDir } from './config-paths'
import type { ManualApiResponse, ManualContent, ManualVersion } from '@proma/shared'

const CACHE_DIR_NAME = 'manual-cache'
const VERSION_FILE = 'version.json'
const CONTENT_FILE = 'content.md'

function getCacheDir(): string {
  const dir = join(getConfigDir(), CACHE_DIR_NAME)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

function getTutorialFilePath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'tutorial.md')
  }
  return join(app.getAppPath(), '../../tutorial/tutorial.md')
}

/** 读取缓存的版本信息 */
function readCachedVersion(): ManualVersion | null {
  try {
    const filePath = join(getCacheDir(), VERSION_FILE)
    if (!existsSync(filePath)) return null
    const raw = readFileSync(filePath, 'utf-8')
    return JSON.parse(raw) as ManualVersion
  } catch {
    return null
  }
}

/** 写入缓存（版本 + 内容） */
function writeCache(version: number, title: string, content: string): void {
  const cacheDir = getCacheDir()
  const versionData: ManualVersion = { version, title, cachedAt: Date.now() }
  writeFileSync(join(cacheDir, VERSION_FILE), JSON.stringify(versionData), 'utf-8')
  writeFileSync(join(cacheDir, CONTENT_FILE), content, 'utf-8')
}

/** 从服务端拉取最新手册 */
async function fetchFromServer(currentVersion: number): Promise<ManualContent | null> {
  const res = await httpGet<{ code: number; data: ManualApiResponse }>(
    '/workmate/manual',
    { params: { version: currentVersion } },
  )

  if (!res.ok || !res.data || res.data.code !== 0) {
    return null
  }

  const d = res.data.data
  if (!d.needUpdate) {
    return null
  }

  if (!d.content || !d.title || d.version == null) {
    return null
  }

  writeCache(d.version, d.title, d.content)
  return {
    version: d.version,
    title: d.title,
    content: d.content,
    cachedAt: Date.now(),
    source: 'server',
  }
}

/** 读取本地缓存的手册内容 */
function getCachedManual(): ManualContent | null {
  const version = readCachedVersion()
  if (!version) return null

  try {
    const filePath = join(getCacheDir(), CONTENT_FILE)
    if (!existsSync(filePath)) return null
    const content = readFileSync(filePath, 'utf-8')
    return {
      version: version.version,
      title: version.title,
      content,
      cachedAt: version.cachedAt,
      source: 'cache',
    }
  } catch {
    return null
  }
}

/** 读取内置 fallback（tutorial/tutorial.md） */
export function getBuiltInManual(): ManualContent | null {
  const filePath = getTutorialFilePath()
  if (!existsSync(filePath)) {
    console.warn('[手册服务] 内置 fallback 不存在:', filePath)
    return null
  }

  try {
    const content = readFileSync(filePath, 'utf-8')
    return {
      version: 0,
      title: 'WorkMate 使用手册',
      content,
      cachedAt: 0,
      source: 'builtin',
    }
  } catch (error) {
    console.error('[手册服务] 读取内置 fallback 失败:', error)
    return null
  }
}

/**
 * 三级降级获取手册内容。
 * 全程不抛异常，失败时静默降级。
 */
export async function checkAndGetManual(): Promise<ManualContent | null> {
  const cachedVersion = readCachedVersion()

  // 1. 尝试服务端
  try {
    const serverResult = await fetchFromServer(cachedVersion?.version ?? 0)
    if (serverResult) return serverResult

    // needUpdate=false：返回缓存或内置 fallback
    if (cachedVersion) {
      const cached = getCachedManual()
      if (cached) return { ...cached, source: 'cache' }
    }
    const builtin = getBuiltInManual()
    return builtin ? { ...builtin, source: 'builtin' } : null
  } catch {
    console.warn('[手册服务] 服务端不可达，降级到本地')
  }

  // 2. 尝试缓存
  const cached = getCachedManual()
  if (cached) return { ...cached, source: 'cache' }

  // 3. 兜底：内置 fallback
  const builtin = getBuiltInManual()
  return builtin ? { ...builtin, source: 'builtin' } : null
}
