/**
 * 使用手册服务
 *
 * Markdown 获取采用"服务端优先 + 三级降级"策略：
 *   1. 请求前自动清理过期/旧格式缓存（24h TTL + 200KB 体积上限）
 *   2. 从服务端拉取最新版本 → GET /workmate/manual?version=N
 *   3. 服务端不可达 → 返回本地缓存（如存在）
 *   4. 无缓存 → 返回内置 fallback（tutorial/tutorial.md）
 *
 * 图文版手册通过 openManualHtml() 获取 HTML 后在浏览器中打开。
 * checkAndGetManual 全程不抛异常，失败时静默降级。
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { app, shell } from 'electron'
import { httpGet } from '../../shared/hteip-client'
import { getConfigDir } from './config-paths'
import type { ManualApiResponse, ManualContent, ManualVersion } from '@proma/shared'

const CACHE_DIR_NAME = 'manual-cache'
const VERSION_FILE = 'version.json'
const CONTENT_FILE = 'content.md'

/** 缓存有效期（24 小时），超期自动清理，确保旧格式缓存（含 base64 大文件）不会持久残留 */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000

/** 缓存内容体积上限（200KB），超过此值视为旧格式（含 base64 图片），自动清理 */
const CACHE_SIZE_LIMIT = 200 * 1024

/** 飞行中请求去重：避免并发调用重复请求 */
let inflightRequest: Promise<ManualContent | null> | null = null

function getCacheDir(): string {
  const dir = join(getConfigDir(), CACHE_DIR_NAME)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

/**
 * 清理过期或旧格式的本地缓存。
 *
 * 触发条件（任一满足即清理）：
 *   - 缓存时间超过 CACHE_TTL_MS（24 小时）
 *   - 缓存内容体积超过 CACHE_SIZE_LIMIT（200KB，视为旧格式含 base64 图片）
 *
 * 清理后下次请求会走服务端 → 内置 fallback 的降级链路，服务端成功后会重建缓存。
 */
function cleanStaleCache(): boolean {
  const cacheDir = join(getConfigDir(), CACHE_DIR_NAME)
  const versionPath = join(cacheDir, VERSION_FILE)
  const contentPath = join(cacheDir, CONTENT_FILE)

  if (!existsSync(versionPath)) return false

  try {
    const version = JSON.parse(readFileSync(versionPath, 'utf-8')) as ManualVersion
    const ageMs = Date.now() - version.cachedAt

    // 检查是否过期
    if (ageMs > CACHE_TTL_MS) {
      const ageHours = (ageMs / 3600000).toFixed(1)
      console.log(`[手册服务] 缓存已过期 (${ageHours}h > 24h)，清理中...`)
      rmSync(cacheDir, { recursive: true, force: true })
      console.log('[手册服务] 过期缓存已删除')
      return true
    }

    // 检查体积是否异常（旧格式含 base64 图片）
    if (existsSync(contentPath)) {
      const stat = readFileSync(contentPath, 'utf-8').length
      if (stat > CACHE_SIZE_LIMIT) {
        console.log(`[手册服务] 缓存体积异常 (${(stat / 1024).toFixed(1)}KB > ${(CACHE_SIZE_LIMIT / 1024).toFixed(0)}KB)，疑似旧格式含 base64 图片，清理中...`)
        rmSync(cacheDir, { recursive: true, force: true })
        console.log('[手册服务] 旧格式缓存已删除')
        return true
      }
    }

    const ageHours = (ageMs / 3600000).toFixed(1)
    console.log(`[手册服务] 缓存正常: v${version.version}, ${ageHours}h 前, 未触发清理`)
    return false
  } catch (err) {
    console.warn('[手册服务] 检查缓存过期失败，跳过清理:', err)
    return false
  }
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
    if (!existsSync(filePath)) {
      console.log('[手册服务] 缓存版本文件不存在:', filePath)
      return null
    }
    const raw = readFileSync(filePath, 'utf-8')
    const data = JSON.parse(raw) as ManualVersion
    console.log(`[手册服务] 读取缓存版本: v${data.version}, 标题: ${data.title}, 缓存时间: ${new Date(data.cachedAt).toLocaleString('zh-CN')}`)
    return data
  } catch (err) {
    console.warn('[手册服务] 读取缓存版本失败:', err)
    return null
  }
}

/** 写入缓存（版本 + 内容） */
function writeCache(version: number, title: string, content: string): void {
  const cacheDir = getCacheDir()
  const versionData: ManualVersion = { version, title, cachedAt: Date.now() }
  const versionPath = join(cacheDir, VERSION_FILE)
  const contentPath = join(cacheDir, CONTENT_FILE)
  writeFileSync(versionPath, JSON.stringify(versionData), 'utf-8')
  writeFileSync(contentPath, content, 'utf-8')
  console.log(`[手册服务] 缓存已写入: ${versionPath} (v${version}), ${contentPath} (${(content.length / 1024).toFixed(1)}KB)`)
}

/** 从服务端拉取最新手册 */
async function fetchFromServer(currentVersion: number): Promise<ManualContent | null> {
  const t0 = performance.now()
  const url = '/workmate/manual'
  const params = { version: currentVersion }
  console.log(`[手册服务] → GET ${url}?version=${currentVersion}`)

  const res = await httpGet<{ code: number; data: ManualApiResponse }>(url, { params })
  const elapsed = (performance.now() - t0).toFixed(0)
  console.log(`[手册服务] ← 响应 ${res.status} | ${elapsed}ms | ok=${res.ok} | code=${res.data?.code}`)

  if (!res.ok || !res.data || res.data.code !== 0) {
    if (res.status === 0) {
      console.warn(`[手册服务] 网络不通 (${res.error || 'ECONNREFUSED'})`)
    } else {
      console.warn(`[手册服务] 服务端返回失败 HTTP ${res.status}, code=${res.data?.code}`)
    }
    return null
  }

  const d = res.data.data
  console.log(`[手册服务] 解析响应: needUpdate=${d.needUpdate}, version=${d.version}, title=${d.title}, content=${d.content ? `${(d.content.length / 1024).toFixed(1)}KB` : '无'}`)

  if (!d.needUpdate) {
    console.log('[手册服务] needUpdate=false，无需更新')
    return null
  }

  if (!d.content || !d.title || d.version == null) {
    console.warn('[手册服务] 服务端返回数据不完整:', { hasContent: !!d.content, hasTitle: !!d.title, version: d.version })
    return null
  }

  console.log(`[手册服务] 收到新版本 v${d.version}, 标题: "${d.title}", 内容: ${(d.content.length / 1024).toFixed(1)}KB, 更新时间: ${d.updatedAt ?? '无'}`)

  const t1 = performance.now()
  writeCache(d.version, d.title, d.content)
  console.log(`[手册服务] 写入缓存耗时: ${(performance.now() - t1).toFixed(0)}ms`)

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
  if (!version) {
    console.log('[手册服务] 读取缓存: 无版本信息')
    return null
  }

  try {
    const filePath = join(getCacheDir(), CONTENT_FILE)
    if (!existsSync(filePath)) {
      console.warn('[手册服务] 读取缓存: 内容文件不存在:', filePath)
      return null
    }
    const t0 = performance.now()
    const content = readFileSync(filePath, 'utf-8')
    console.log(`[手册服务] 读取缓存: v${version.version}, 大小: ${(content.length / 1024).toFixed(1)}KB, 耗时: ${(performance.now() - t0).toFixed(0)}ms`)
    return {
      version: version.version,
      title: version.title,
      content,
      cachedAt: version.cachedAt,
      source: 'cache',
    }
  } catch (err) {
    console.error('[手册服务] 读取缓存失败:', err)
    return null
  }
}

/** 读取内置 fallback（tutorial/tutorial.md） */
export function getBuiltInManual(): ManualContent | null {
  const filePath = getTutorialFilePath()
  console.log(`[手册服务] 查找内置 fallback: ${filePath} (packaged=${app.isPackaged})`)
  if (!existsSync(filePath)) {
    console.warn('[手册服务] 内置 fallback 不存在:', filePath)
    return null
  }

  try {
    const t0 = performance.now()
    const content = readFileSync(filePath, 'utf-8')
    console.log(`[手册服务] 读取内置 fallback: 大小: ${(content.length / 1024).toFixed(1)}KB, 耗时: ${(performance.now() - t0).toFixed(0)}ms`)
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
  // 飞行中请求去重：如果已有请求在进行中，直接复用
  if (inflightRequest) {
    console.log('[手册服务] ===== 复用飞行中请求 =====')
    return inflightRequest
  }

  const t0 = performance.now()
  console.log('[手册服务] ===== checkAndGetManual 开始 =====')

  inflightRequest = (async () => {
    // 每次请求前清理过期/旧格式缓存
    cleanStaleCache()

    const cachedVersion = readCachedVersion()
    const cv = cachedVersion?.version ?? 0
    console.log(`[手册服务] 本地缓存版本: ${cachedVersion ? `v${cv}` : '无'}`)

    // 1. 尝试服务端
    try {
      console.log('[手册服务] → 步骤1: 尝试服务端')
      const serverResult = await fetchFromServer(cv)
      if (serverResult) {
        console.log(`[手册服务] ✅ 服务端命中 | 总耗时: ${(performance.now() - t0).toFixed(0)}ms`)
        return serverResult
      }

      // needUpdate=false 或服务端无数据：返回缓存或内置 fallback
      console.log('[手册服务] → 步骤2: needUpdate=false，尝试本地')
      if (cachedVersion) {
        const cached = getCachedManual()
        if (cached) {
          console.log(`[手册服务] ✅ 使用缓存 | 总耗时: ${(performance.now() - t0).toFixed(0)}ms`)
          return { ...cached, source: 'cache' }
        }
        console.log('[手册服务] 缓存不可用，尝试内置 fallback')
      }
      const builtin = getBuiltInManual()
      console.log(`[手册服务] ${builtin ? '✅ 使用内置 fallback' : '❌ 无可用内容'} | 总耗时: ${(performance.now() - t0).toFixed(0)}ms`)
      return builtin ? { ...builtin, source: 'builtin' as const } : null
    } catch (err) {
      console.warn(`[手册服务] 服务端不可达 (${err instanceof Error ? err.message : err})，降级到本地`)
    }

    // 2. 尝试缓存
    console.log('[手册服务] → 步骤3: 降级到缓存')
    const cached = getCachedManual()
    if (cached) {
      console.log(`[手册服务] ✅ 降级命中缓存 | 总耗时: ${(performance.now() - t0).toFixed(0)}ms`)
      return { ...cached, source: 'cache' }
    }

    // 3. 兜底：内置 fallback
    console.log('[手册服务] → 步骤4: 降级到内置 fallback')
    const builtin = getBuiltInManual()
    console.log(`[手册服务] ${builtin ? '✅ 降级命中内置 fallback' : '❌ 所有来源均无可用内容'} | 总耗时: ${(performance.now() - t0).toFixed(0)}ms`)
    return builtin ? { ...builtin, source: 'builtin' as const } : null
  })()

  try {
    return await inflightRequest
  } finally {
    inflightRequest = null
  }
}

/**
 * 获取图文版手册 HTML 并在浏览器中打开。
 *
 * 调用 GET /workmate/manual/html 获取含 base64 图片的完整 HTML，
 * 写入临时文件后用系统默认浏览器打开。
 */
export async function openManualHtml(): Promise<void> {
  const t0 = performance.now()
  const url = '/workmate/manual/html'
  console.log(`[手册服务] → GET ${url} (图文版)`)

  const res = await httpGet<{ code: number; data: ManualApiResponse }>(url)
  const elapsed = (performance.now() - t0).toFixed(0)
  console.log(`[手册服务] ← 响应 ${res.status} | ${elapsed}ms | ok=${res.ok} | code=${res.data?.code}`)

  if (!res.ok || !res.data || res.data.code !== 0) {
    if (res.status === 0) {
      console.warn(`[手册服务] 图文版网络不通 (${res.error || 'ECONNREFUSED'})`)
      throw new Error(`服务不可达，请确认后端已启动${res.error ? ` (${res.error})` : ''}`)
    }
    console.warn(`[手册服务] 图文版服务端返回失败 HTTP ${res.status}, code=${res.data?.code}`)
    throw new Error(`获取图文版手册失败 (HTTP ${res.status})`)
  }

  const d = res.data.data
  console.log(`[手册服务] 图文版解析: needUpdate=${d.needUpdate}, version=${d.version}, title=${d.title}, content=${d.content ? `${(d.content.length / 1024).toFixed(1)}KB` : '无'}`)

  if (!d.content) {
    console.warn('[手册服务] 图文版内容为空')
    throw new Error('图文版手册内容为空')
  }

  console.log(`[手册服务] 图文版内容: ${(d.content.length / 1024).toFixed(1)}KB, 标题: "${d.title ?? '使用手册'}"`)

  const html = wrapManualHtml(d.title ?? '使用手册', d.content)
  const filePath = join(tmpdir(), `workmate-manual-${d.version ?? 'latest'}.html`)
  console.log(`[手册服务] 包裹后 HTML 大小: ${(html.length / 1024).toFixed(1)}KB`)

  const t1 = performance.now()
  await writeFile(filePath, html, 'utf-8')
  console.log(`[手册服务] 写入临时文件: ${filePath} | 耗时: ${(performance.now() - t1).toFixed(0)}ms`)

  await shell.openPath(filePath)
  console.log(`[手册服务] ✅ 图文版已打开 | 总耗时: ${(performance.now() - t0).toFixed(0)}ms`)
}

/** 将 HTML 内容包裹为完整页面 */
function wrapManualHtml(title: string, content: string): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    body {
      max-width: 860px; margin: 0 auto; padding: 32px 24px 64px;
      font-size: 16px; line-height: 1.8; color: #1a1a1a;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
    }
    h1 { font-size: 28px; font-weight: 700; margin: 28px 0 16px; }
    h2 { font-size: 22px; font-weight: 600; margin: 24px 0 12px; }
    h3 { font-size: 18px; font-weight: 600; margin: 20px 0 8px; }
    h4 { font-size: 16px; font-weight: 600; margin: 16px 0 6px; }
    img { max-width: 100%; height: auto; border-radius: 8px; margin: 8px 0; box-shadow: 0 2px 8px rgba(0,0,0,.08); }
    table { border-collapse: collapse; width: 100%; margin: 12px 0; }
    th, td { border: 1px solid #d9d9d9; padding: 8px 12px; text-align: left; }
    th { background: #f5f5f5; font-weight: 600; }
    pre { background: #1e1e1e; color: #d4d4d4; padding: 16px; border-radius: 8px; overflow-x: auto; font-size: 14px; }
    code { background: #f0f0f0; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; color: #d4380d; }
    pre code { background: none; padding: 0; color: inherit; }
    blockquote { border-left: 4px solid #1677ff; padding: 8px 16px; margin: 12px 0; background: #f0f5ff; color: #1e304a; }
    a { color: #1677ff; text-decoration: none; }
    a:hover { text-decoration: underline; }
    hr { border: none; border-top: 1px solid #e8e8e8; margin: 24px 0; }
  </style>
</head>
<body>
${content}
</body>
</html>`
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
