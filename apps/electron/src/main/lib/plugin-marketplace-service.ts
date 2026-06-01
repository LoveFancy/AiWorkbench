/**
 * Agent 插件市场服务
 *
 * 负责管理插件市场、刷新索引、搜索插件，并将插件安装到 user-plugins。
 */

import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import type {
  AgentPluginInstallInput,
  AgentPluginInstallResult,
  AgentPluginMarketplace,
  AgentPluginMarketplaceDetail,
  AgentPluginMarketplacePlugin,
  AgentPluginMarketplacesConfig,
  AgentPluginMarketplaceType,
  AgentPluginManifest,
} from '@proma/shared'
import {
  getPluginMarketplaceCacheDir,
  getPluginMarketplacesPath,
  getPluginsConfigPath,
  getUserPluginsDir,
} from './config-paths'
import { readPluginsConfig, writePluginsConfig } from './plugin-registry-service'

interface PluginMarketplacePaths {
  marketplacesPath?: string
  cacheDir?: string
  userPluginsDir?: string
  pluginsConfigPath?: string
  cloneRepo?: (source: string, targetDir: string) => Promise<void>
  /** 测试专用：cloneRepo stub 完成后用该目录内容作为克隆结果 */
  copyClonedFixture?: string
}

interface AddMarketplaceInput {
  id: string
  name: string
  source: string
  type: AgentPluginMarketplaceType
}

interface MarketManifestPlugin {
  name: string
  source: string
  description?: string
  version?: string
}

interface MarketManifest {
  id?: string
  name?: string
  plugins: MarketManifestPlugin[]
}

const DEFAULT_MARKETPLACES_CONFIG: AgentPluginMarketplacesConfig = {
  version: 1,
  marketplaces: [],
}

function paths(input?: PluginMarketplacePaths): Required<PluginMarketplacePaths> {
  return {
    marketplacesPath: input?.marketplacesPath ?? getPluginMarketplacesPath(),
    cacheDir: input?.cacheDir ?? getPluginMarketplaceCacheDir(),
    userPluginsDir: input?.userPluginsDir ?? getUserPluginsDir(),
    pluginsConfigPath: input?.pluginsConfigPath ?? getPluginsConfigPath(),
    cloneRepo: input?.cloneRepo ?? cloneGitRepo,
    copyClonedFixture: input?.copyClonedFixture ?? '',
  }
}

function ensureParent(filePath: string): void {
  mkdirSync(dirname(filePath), { recursive: true })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function slugSafe(value: string, label: string): string {
  const trimmed = value.trim()
  if (!/^[a-zA-Z0-9._-]+$/.test(trimmed) || trimmed.startsWith('.')) {
    throw new Error(`${label} 只能包含字母、数字、点、下划线和短横线`)
  }
  return trimmed
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf-8')) as unknown
}

function normalizeManifest(raw: unknown): MarketManifest {
  if (!isRecord(raw) || !Array.isArray(raw.plugins)) {
    throw new Error('插件市场 manifest 缺少 plugins 数组')
  }
  return {
    ...(typeof raw.id === 'string' && { id: raw.id }),
    ...(typeof raw.name === 'string' && { name: raw.name }),
    plugins: raw.plugins
      .filter(isRecord)
      .map((item) => ({
        name: typeof item.name === 'string' ? item.name : '',
        source: typeof item.source === 'string' ? item.source : '',
        ...(typeof item.description === 'string' && { description: item.description }),
        ...(typeof item.version === 'string' && { version: item.version }),
      }))
      .filter((item) => item.name && item.source),
  }
}

function parseMarketplaceType(value: unknown): AgentPluginMarketplaceType {
  return value === 'github' || value === 'raw' || value === 'local' ? value : 'raw'
}

export function readPluginMarketplacesConfig(input?: Pick<PluginMarketplacePaths, 'marketplacesPath'>): AgentPluginMarketplacesConfig {
  const marketplacesPath = input?.marketplacesPath ?? getPluginMarketplacesPath()
  if (!existsSync(marketplacesPath)) return structuredClone(DEFAULT_MARKETPLACES_CONFIG)
  try {
    const raw = readJson(marketplacesPath)
    const record = isRecord(raw) ? raw : {}
    return {
      version: 1,
      marketplaces: Array.isArray(record.marketplaces)
        ? record.marketplaces.filter(isRecord).map((item): AgentPluginMarketplace => ({
          id: typeof item.id === 'string' ? item.id : '',
          name: typeof item.name === 'string' ? item.name : '',
          source: typeof item.source === 'string' ? item.source : '',
          type: parseMarketplaceType(item.type),
          enabled: typeof item.enabled === 'boolean' ? item.enabled : true,
          addedAt: typeof item.addedAt === 'string' ? item.addedAt : new Date().toISOString(),
          lastRefreshAt: typeof item.lastRefreshAt === 'string' || item.lastRefreshAt === null ? item.lastRefreshAt : null,
          ...(typeof item.lastError === 'string' && { lastError: item.lastError }),
        })).filter((item) => item.id && item.name && item.source)
        : [],
    }
  } catch (error) {
    console.warn('[插件市场] 读取 plugin-marketplaces.json 失败，使用默认配置:', error)
    return structuredClone(DEFAULT_MARKETPLACES_CONFIG)
  }
}

function writeMarketplacesConfig(config: AgentPluginMarketplacesConfig, input?: Pick<PluginMarketplacePaths, 'marketplacesPath'>): void {
  const marketplacesPath = input?.marketplacesPath ?? getPluginMarketplacesPath()
  ensureParent(marketplacesPath)
  writeFileSync(marketplacesPath, JSON.stringify(config, null, 2), 'utf-8')
}

export function listPluginMarketplaces(input?: Pick<PluginMarketplacePaths, 'marketplacesPath'>): AgentPluginMarketplace[] {
  return readPluginMarketplacesConfig(input).marketplaces
}

export function addPluginMarketplace(marketplace: AddMarketplaceInput, input?: PluginMarketplacePaths): AgentPluginMarketplace {
  const resolved = paths(input)
  const config = readPluginMarketplacesConfig({ marketplacesPath: resolved.marketplacesPath })
  const id = slugSafe(marketplace.id, '插件市场 ID')
  if (config.marketplaces.some((item) => item.id === id)) {
    throw new Error(`插件市场已存在: ${id}`)
  }
  const entry: AgentPluginMarketplace = {
    id,
    name: marketplace.name.trim() || id,
    source: marketplace.source.trim(),
    type: marketplace.type,
    enabled: true,
    addedAt: new Date().toISOString(),
    lastRefreshAt: null,
  }
  config.marketplaces.push(entry)
  writeMarketplacesConfig(config, { marketplacesPath: resolved.marketplacesPath })
  return entry
}

export function updatePluginMarketplace(id: string, updates: Partial<Omit<AgentPluginMarketplace, 'id' | 'addedAt'>>, input?: PluginMarketplacePaths): AgentPluginMarketplace {
  const resolved = paths(input)
  const config = readPluginMarketplacesConfig({ marketplacesPath: resolved.marketplacesPath })
  const index = config.marketplaces.findIndex((item) => item.id === id)
  if (index === -1) throw new Error(`插件市场不存在: ${id}`)
  const current = config.marketplaces[index]
  if (!current) throw new Error(`插件市场不存在: ${id}`)
  const next: AgentPluginMarketplace = {
    ...current,
    ...updates,
    id,
  }
  config.marketplaces[index] = next
  writeMarketplacesConfig(config, { marketplacesPath: resolved.marketplacesPath })
  return next
}

export function removePluginMarketplace(id: string, input?: PluginMarketplacePaths): void {
  const resolved = paths(input)
  const config = readPluginMarketplacesConfig({ marketplacesPath: resolved.marketplacesPath })
  config.marketplaces = config.marketplaces.filter((item) => item.id !== id)
  writeMarketplacesConfig(config, { marketplacesPath: resolved.marketplacesPath })
  rmSync(join(resolved.cacheDir, id), { recursive: true, force: true })
}

async function readMarketplaceManifest(marketplace: AgentPluginMarketplace): Promise<MarketManifest> {
  if (marketplace.type === 'local') {
    const sourcePath = resolve(marketplace.source)
    const manifestPath = existsSync(sourcePath) && !sourcePath.endsWith('.json')
      ? join(sourcePath, 'marketplace.json')
      : sourcePath
    return normalizeManifest(readJson(manifestPath))
  }

  const url = marketplace.type === 'github'
    ? marketplace.source.replace('github.com/', 'raw.githubusercontent.com/').replace(/\/?$/, '/main/.claude-plugin/marketplace.json')
    : marketplace.source
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`读取插件市场失败 (${response.status}): ${await response.text()}`)
  }
  return normalizeManifest(await response.json())
}

function cacheManifest(marketplace: AgentPluginMarketplace, manifest: MarketManifest, input: Required<PluginMarketplacePaths>): void {
  const marketCacheDir = join(input.cacheDir, marketplace.id)
  mkdirSync(marketCacheDir, { recursive: true })
  writeFileSync(join(marketCacheDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8')
  writeFileSync(join(marketCacheDir, 'fetched-at.txt'), new Date().toISOString(), 'utf-8')
}

function readCachedManifest(marketplaceId: string, input: Required<PluginMarketplacePaths>): MarketManifest | null {
  const manifestPath = join(input.cacheDir, marketplaceId, 'manifest.json')
  if (!existsSync(manifestPath)) return null
  return normalizeManifest(readJson(manifestPath))
}

export async function refreshPluginMarketplace(id: string, input?: PluginMarketplacePaths): Promise<AgentPluginMarketplace> {
  const resolved = paths(input)
  const config = readPluginMarketplacesConfig({ marketplacesPath: resolved.marketplacesPath })
  const marketplace = config.marketplaces.find((item) => item.id === id)
  if (!marketplace) throw new Error(`插件市场不存在: ${id}`)

  try {
    const manifest = await readMarketplaceManifest(marketplace)
    cacheManifest(marketplace, manifest, resolved)
    return updatePluginMarketplace(id, {
      name: manifest.name ?? marketplace.name,
      lastRefreshAt: new Date().toISOString(),
      lastError: undefined,
    }, resolved)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const marketCacheDir = join(resolved.cacheDir, marketplace.id)
    mkdirSync(marketCacheDir, { recursive: true })
    writeFileSync(join(marketCacheDir, 'last-error.json'), JSON.stringify({ message, at: new Date().toISOString() }, null, 2), 'utf-8')
    updatePluginMarketplace(id, { lastError: message }, resolved)
    throw error
  }
}

function installedPluginId(marketplaceId: string, pluginName: string): string {
  return `user:${marketplaceId}/${pluginName}`
}

function pluginInstalled(marketplaceId: string, pluginName: string, input: Required<PluginMarketplacePaths>): boolean {
  return existsSync(join(input.userPluginsDir, marketplaceId, pluginName))
}

export async function searchMarketplacePlugins(query = '', input?: PluginMarketplacePaths): Promise<AgentPluginMarketplacePlugin[]> {
  const resolved = paths(input)
  const config = readPluginMarketplacesConfig({ marketplacesPath: resolved.marketplacesPath })
  const pluginConfig = readPluginsConfig({ configPath: resolved.pluginsConfigPath })
  const normalizedQuery = query.trim().toLowerCase()
  const results: AgentPluginMarketplacePlugin[] = []

  for (const marketplace of config.marketplaces.filter((item) => item.enabled)) {
    const manifest = readCachedManifest(marketplace.id, resolved)
    if (!manifest) continue
    for (const plugin of manifest.plugins) {
      const haystack = `${plugin.name} ${plugin.description ?? ''}`.toLowerCase()
      if (normalizedQuery && !haystack.includes(normalizedQuery)) continue
      const localPluginId = installedPluginId(marketplace.id, plugin.name)
      results.push({
        marketplaceId: marketplace.id,
        marketplaceName: marketplace.name,
        name: plugin.name,
        source: plugin.source,
        ...(plugin.description && { description: plugin.description }),
        ...(plugin.version && { version: plugin.version }),
        installed: pluginInstalled(marketplace.id, plugin.name, resolved),
        enabled: pluginConfig.plugins[localPluginId]?.enabled,
        localPluginId,
      })
    }
  }

  return results.sort((a, b) => a.name.localeCompare(b.name))
}

function resolvePluginSource(marketplace: AgentPluginMarketplace, source: string): string {
  if (/^https?:\/\//.test(source)) return source
  if (marketplace.type === 'github') {
    return `${marketplace.source.replace(/\/$/, '')}/${source.replace(/^\.\//, '')}`
  }
  if (marketplace.type !== 'local') return new URL(source, marketplace.source).toString()
  const base = existsSync(marketplace.source) && marketplace.source.endsWith('.json')
    ? dirname(resolve(marketplace.source))
    : resolve(marketplace.source)
  return resolve(base, source)
}

function copyOrMoveAtomically(sourceDir: string, targetDir: string, overwrite: boolean): 'installed' | 'overwritten' {
  const existed = existsSync(targetDir)
  if (existed && !overwrite) throw new Error(`插件已安装: ${targetDir}`)
  const parent = dirname(targetDir)
  mkdirSync(parent, { recursive: true })
  const tmp = join(parent, `.${basename(targetDir)}.installing-${Date.now()}`)
  rmSync(tmp, { recursive: true, force: true })
  cpSync(sourceDir, tmp, { recursive: true })
  try {
    if (existed) rmSync(targetDir, { recursive: true, force: true })
    try {
      renameSync(tmp, targetDir)
    } catch {
      cpSync(tmp, targetDir, { recursive: true })
      rmSync(tmp, { recursive: true, force: true })
    }
  } catch (error) {
    rmSync(tmp, { recursive: true, force: true })
    if (!existed) rmSync(targetDir, { recursive: true, force: true })
    throw error
  }
  return existed ? 'overwritten' : 'installed'
}

function validatePluginSourceDir(sourceDir: string): void {
  const manifestPath = join(sourceDir, '.claude-plugin', 'plugin.json')
  if (!existsSync(manifestPath)) {
    throw new Error('插件缺少 .claude-plugin/plugin.json')
  }
  try {
    const raw = readJson(manifestPath)
    if (!isRecord(raw)) throw new Error('plugin.json 不是 JSON 对象')
    if (typeof raw.name !== 'string' || raw.name.trim().length === 0) {
      throw new Error('plugin.json 缺少 name 字段')
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`插件 manifest 校验失败: ${message}`)
  }
}

async function cloneGitRepo(source: string, targetDir: string): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn('git', ['clone', '--depth', '1', source, targetDir], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    let stderr = ''
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        resolvePromise()
      } else {
        reject(new Error(`git clone 失败 (${code ?? 'unknown'}): ${stderr.trim()}`))
      }
    })
  })
}

async function preparePluginSource(source: string, pluginName: string, input: Required<PluginMarketplacePaths>): Promise<{ sourceDir: string; cleanup: () => void }> {
  if (isAbsolute(source) && existsSync(source)) {
    return { sourceDir: source, cleanup: () => undefined }
  }

  if (!/^https?:\/\//.test(source) && !/^git@/.test(source)) {
    throw new Error(`不支持的插件来源: ${source}`)
  }

  const tmpRoot = join(input.cacheDir, '.installing', `${pluginName}-${Date.now()}`)
  rmSync(tmpRoot, { recursive: true, force: true })
  mkdirSync(dirname(tmpRoot), { recursive: true })
  await input.cloneRepo(source, tmpRoot)
  if (input.copyClonedFixture) {
    rmSync(tmpRoot, { recursive: true, force: true })
    cpSync(input.copyClonedFixture, tmpRoot, { recursive: true })
  }
  return {
    sourceDir: tmpRoot,
    cleanup: () => rmSync(tmpRoot, { recursive: true, force: true }),
  }
}

function findMarketplacePlugin(marketplaceId: string, pluginName: string, input: Required<PluginMarketplacePaths>): { marketplace: AgentPluginMarketplace; plugin: MarketManifestPlugin } {
  const config = readPluginMarketplacesConfig({ marketplacesPath: input.marketplacesPath })
  const marketplace = config.marketplaces.find((item) => item.id === marketplaceId)
  if (!marketplace) throw new Error(`插件市场不存在: ${marketplaceId}`)
  const manifest = readCachedManifest(marketplaceId, input)
  if (!manifest) throw new Error(`插件市场未刷新: ${marketplaceId}`)
  const plugin = manifest.plugins.find((item) => item.name === pluginName)
  if (!plugin) throw new Error(`插件不存在: ${pluginName}`)
  return { marketplace, plugin }
}

export async function getMarketplacePluginDetail(marketplaceId: string, pluginName: string, input?: PluginMarketplacePaths): Promise<AgentPluginMarketplaceDetail> {
  const resolved = paths(input)
  const { marketplace, plugin } = findMarketplacePlugin(marketplaceId, pluginName, resolved)
  const source = resolvePluginSource(marketplace, plugin.source)
  let manifest: AgentPluginManifest | undefined
  let readme: string | undefined
  if (isAbsolute(source) && existsSync(source)) {
    const manifestPath = join(source, '.claude-plugin', 'plugin.json')
    if (existsSync(manifestPath)) manifest = readJson(manifestPath) as AgentPluginManifest
    const readmePath = join(source, 'README.md')
    if (existsSync(readmePath)) readme = readFileSync(readmePath, 'utf-8')
  }
  const localPluginId = installedPluginId(marketplace.id, plugin.name)
  const pluginConfig = readPluginsConfig({ configPath: resolved.pluginsConfigPath })
  return {
    marketplaceId: marketplace.id,
    marketplaceName: marketplace.name,
    name: plugin.name,
    source: plugin.source,
    ...(plugin.description && { description: plugin.description }),
    ...(plugin.version && { version: plugin.version }),
    installed: pluginInstalled(marketplace.id, plugin.name, resolved),
    enabled: pluginConfig.plugins[localPluginId]?.enabled,
    localPluginId,
    ...(manifest && { manifest }),
    ...(readme && { readme }),
  }
}

export async function installMarketplacePlugin(input: AgentPluginInstallInput, pathInput?: PluginMarketplacePaths): Promise<AgentPluginInstallResult> {
  const resolved = paths(pathInput)
  const marketplaceId = slugSafe(input.marketplaceId, '插件市场 ID')
  const pluginName = slugSafe(input.pluginName, '插件名称')
  const { marketplace, plugin } = findMarketplacePlugin(marketplaceId, pluginName, resolved)
  const source = resolvePluginSource(marketplace, plugin.source)
  const prepared = await preparePluginSource(source, pluginName, resolved)

  const targetDir = join(resolved.userPluginsDir, marketplaceId, pluginName)
  let status: 'installed' | 'overwritten'
  try {
    validatePluginSourceDir(prepared.sourceDir)
    status = copyOrMoveAtomically(prepared.sourceDir, targetDir, input.overwrite ?? false)
  } finally {
    prepared.cleanup()
  }
  const pluginId = installedPluginId(marketplaceId, pluginName)
  const config = readPluginsConfig({ configPath: resolved.pluginsConfigPath })
  const now = new Date().toISOString()
  config.plugins[pluginId] = {
    ...config.plugins[pluginId],
    enabled: input.enable,
    installedAt: config.plugins[pluginId]?.installedAt ?? now,
    updatedAt: now,
    sourceMarketplaceId: marketplaceId,
    ...(plugin.version && { version: plugin.version }),
  }
  writePluginsConfig(config, { configPath: resolved.pluginsConfigPath })

  return {
    pluginId,
    status,
    enabled: input.enable,
  }
}

function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? 'plugin'
}
