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
  branch?: string
}

interface MarketManifestPlugin {
  name: string
  source: string
  description?: string
  version?: string
  strict?: boolean
  skills?: string[]
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

function normalizeMarketplaceBranch(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  if (!/^[A-Za-z0-9._/-]+$/.test(trimmed) || trimmed.startsWith('/') || trimmed.endsWith('/') || trimmed.includes('..')) {
    throw new Error('插件市场分支只能包含字母、数字、点、下划线、短横线和斜杠')
  }
  return trimmed
}

function marketplaceBranch(marketplace: AgentPluginMarketplace): string {
  return normalizeMarketplaceBranch(marketplace.branch) ?? 'main'
}

interface MarketplaceRepositorySource {
  root: string
  subPath: string
}

function joinUrlSegments(...segments: string[]): string {
  return segments
    .map((segment) => segment.replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/')
}

function splitUrlPath(pathname: string): string[] {
  return pathname.split('/').filter(Boolean)
}

function removeBranchSegments(segments: string[], branch: string): string[] {
  const branchSegments = branch.split('/').filter(Boolean)
  const matchesConfiguredBranch = branchSegments.length > 0
    && branchSegments.every((segment, index) => segments[index] === segment)
  if (matchesConfiguredBranch) return segments.slice(branchSegments.length)
  return segments.slice(1)
}

function normalizeMarketplaceRepositorySource(marketplace: AgentPluginMarketplace, branch: string): MarketplaceRepositorySource {
  const fallback = { root: marketplace.source.replace(/\/$/, ''), subPath: '' }
  if (!/^https?:\/\//i.test(marketplace.source)) return fallback

  try {
    const url = new URL(marketplace.source)
    const segments = splitUrlPath(url.pathname)

    if ((marketplace.type === 'github' || marketplace.type === 'gitee') && segments.length >= 2) {
      const treeIndex = segments.indexOf('tree')
      if (treeIndex >= 2) {
        const root = `${url.origin}/${segments.slice(0, 2).join('/')}`
        const subPath = joinUrlSegments(...removeBranchSegments(segments.slice(treeIndex + 1), branch))
        return { root, subPath }
      }
    }

    if (marketplace.type === 'gitlab') {
      const treeIndex = segments.findIndex((segment, index) => segment === 'tree' && segments[index - 1] === '-')
      if (treeIndex > 1) {
        const root = `${url.origin}/${segments.slice(0, treeIndex - 1).join('/')}`
        const subPath = joinUrlSegments(...removeBranchSegments(segments.slice(treeIndex + 1), branch))
        return { root, subPath }
      }
    }
  } catch {
    return fallback
  }

  return fallback
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
        ...(typeof item.strict === 'boolean' && { strict: item.strict }),
        ...(Array.isArray(item.skills) && { skills: item.skills.filter((skill): skill is string => typeof skill === 'string' && skill.trim().length > 0) }),
      }))
      .filter((item) => item.name && item.source),
  }
}

function parseMarketplaceType(value: unknown): AgentPluginMarketplaceType {
  return value === 'github' || value === 'gitee' || value === 'gitlab' || value === 'raw' || value === 'local' ? value : 'raw'
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
          ...(normalizeMarketplaceBranch(item.branch) && { branch: normalizeMarketplaceBranch(item.branch) }),
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
  const existedIndex = config.marketplaces.findIndex((item) => item.id === id)
  if (existedIndex !== -1) {
    const current = config.marketplaces[existedIndex]
    if (!current) throw new Error(`插件市场不存在: ${id}`)
    const next: AgentPluginMarketplace = {
      ...current,
      name: marketplace.name.trim() || id,
      source: marketplace.source.trim(),
      type: marketplace.type,
      branch: normalizeMarketplaceBranch(marketplace.branch),
      enabled: true,
      lastError: undefined,
    }
    config.marketplaces[existedIndex] = next
    writeMarketplacesConfig(config, { marketplacesPath: resolved.marketplacesPath })
    return next
  }
  const entry: AgentPluginMarketplace = {
    id,
    name: marketplace.name.trim() || id,
    source: marketplace.source.trim(),
    type: marketplace.type,
    branch: normalizeMarketplaceBranch(marketplace.branch),
    enabled: true,
    addedAt: new Date().toISOString(),
    lastRefreshAt: null,
  }
  config.marketplaces.push(entry)
  writeMarketplacesConfig(config, { marketplacesPath: resolved.marketplacesPath })
  return entry
}

async function readRemoteJson(response: Response, url: string): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? ''
  const text = await response.text()
  const trimmed = text.trimStart()

  if (contentType.includes('text/html') || trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) {
    throw new Error(`插件市场地址返回的是 HTML，不是插件市场 JSON。请确认市场类型和地址是否匹配，或填写可直接返回 marketplace.json 的 Raw URL。地址: ${url}`)
  }

  try {
    return JSON.parse(text) as unknown
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`插件市场 JSON 解析失败: ${message}`)
  }
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

  const url = resolveMarketplaceManifestUrl(marketplace)
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(formatMarketplaceHttpError(marketplace, url, response.status, await response.text()))
  }
  return normalizeManifest(await readRemoteJson(response, url))
}

function formatMarketplaceHttpError(marketplace: AgentPluginMarketplace, url: string, status: number, body: string): string {
  const hints: string[] = []
  if (marketplace.type === 'github' && /gitee\.com/i.test(marketplace.source)) {
    hints.push('当前地址是 Gitee 仓库，请将市场类型改为 Gitee。')
  }
  if (marketplace.type === 'gitee' && /github\.com/i.test(marketplace.source)) {
    hints.push('当前地址是 GitHub 仓库，请将市场类型改为 GitHub。')
  }
  if (marketplace.type !== 'gitlab' && /gitlab/i.test(marketplace.source)) {
    hints.push('当前地址是 GitLab 仓库，请将市场类型改为 GitLab。')
  }
  if (status === 404) {
    hints.push('未找到 .claude-plugin/marketplace.json，请确认仓库默认分支和文件路径。')
  }

  const text = body.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  const excerpt = text ? `返回摘要: ${text.slice(0, 120)}` : ''
  return [
    `读取插件市场失败 (${status})。`,
    ...hints,
    `请求地址: ${url}`,
    excerpt,
  ].filter(Boolean).join(' ')
}

function resolveMarketplaceManifestUrl(marketplace: AgentPluginMarketplace): string {
  const branch = marketplaceBranch(marketplace)
  const repository = normalizeMarketplaceRepositorySource(marketplace, branch)
  const manifestPath = joinUrlSegments(repository.subPath, '.claude-plugin/marketplace.json')
  if (marketplace.type === 'github') {
    return repository.root
      .replace('github.com/', 'raw.githubusercontent.com/')
      .replace(/\/?$/, `/${branch}/${manifestPath}`)
  }
  if (marketplace.type === 'gitee') {
    return repository.root
      .replace(/\/?$/, `/raw/${branch}/${manifestPath}`)
  }
  if (marketplace.type === 'gitlab') {
    return repository.root
      .replace(/\/?$/, `/-/raw/${branch}/${manifestPath}`)
  }
  return marketplace.source
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
  if (marketplace.type === 'github' || marketplace.type === 'gitee' || marketplace.type === 'gitlab') {
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

function validatePluginSourceDir(sourceDir: string, pluginName: string, marketplaceSource: string): void {
  const manifestPath = join(sourceDir, '.claude-plugin', 'plugin.json')
  if (!existsSync(manifestPath)) {
    throw new Error(`插件 ${pluginName} 的来源目录不是有效的 Proma 插件根目录，缺少 .claude-plugin/plugin.json。请检查插件市场 marketplace.json 中该插件的 source 字段是否指向完整插件目录。当前 source: ${marketplaceSource}`)
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

function copySelectedSkillsToPlugin(sourceDir: string, targetDir: string, skills: string[]): void {
  const skillsDir = join(targetDir, 'skills')
  mkdirSync(skillsDir, { recursive: true })
  for (const skill of skills) {
    const sourceSkillDir = resolve(sourceDir, skill)
    if (!existsSync(sourceSkillDir)) {
      throw new Error(`插件声明的 Skill 不存在: ${skill}`)
    }
    cpSync(sourceSkillDir, join(skillsDir, basename(sourceSkillDir)), { recursive: true })
  }
}

function createLoosePluginFromMarketplaceEntry(sourceDir: string, targetDir: string, plugin: MarketManifestPlugin): void {
  rmSync(targetDir, { recursive: true, force: true })
  mkdirSync(join(targetDir, '.claude-plugin'), { recursive: true })
  writeFileSync(join(targetDir, '.claude-plugin', 'plugin.json'), JSON.stringify({
    name: plugin.name,
    version: plugin.version ?? '0.0.0',
    ...(plugin.description && { description: plugin.description }),
  }, null, 2), 'utf-8')
  copySelectedSkillsToPlugin(sourceDir, targetDir, plugin.skills ?? [])
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
    if (plugin.strict === false && (plugin.skills?.length ?? 0) > 0) {
      const existed = existsSync(targetDir)
      if (existed && !(input.overwrite ?? false)) throw new Error(`插件已安装: ${targetDir}`)
      createLoosePluginFromMarketplaceEntry(prepared.sourceDir, targetDir, plugin)
      status = existed ? 'overwritten' : 'installed'
    } else {
      validatePluginSourceDir(prepared.sourceDir, pluginName, plugin.source)
      status = copyOrMoveAtomically(prepared.sourceDir, targetDir, input.overwrite ?? false)
    }
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
