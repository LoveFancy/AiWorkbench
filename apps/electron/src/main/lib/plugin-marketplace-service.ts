/**
 * Agent 插件市场服务
 *
 * 负责管理插件市场、刷新索引、搜索插件，并将插件安装到 user-plugins。
 */

import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { dirname, isAbsolute, join, resolve, sep } from 'node:path'
import type {
  AgentPluginInstallInput,
  AgentPluginInstallProgress,
  AgentPluginInstallResult,
  AgentPluginMarketplace,
  AgentPluginMarketplaceAuth,
  AgentPluginMarketplaceAuthType,
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
import { listInstalledPlugins, readPluginsConfig, writePluginsConfig } from './plugin-registry-service'

interface PluginMarketplacePaths {
  marketplacesPath?: string
  cacheDir?: string
  userPluginsDir?: string
  pluginsConfigPath?: string
  cloneRepo?: (source: string, targetDir: string, branch?: string, authHeader?: string) => Promise<void>
  encryptToken?: (token: string) => string
  decryptToken?: (token: string) => string
  /** 测试专用：cloneRepo stub 完成后用该目录内容作为克隆结果 */
  copyClonedFixture?: string
  onProgress?: (event: { stage: AgentPluginInstallProgress['stage']; message: string; progress: number }) => void
}

interface AddMarketplaceInput {
  id: string
  name: string
  source: string
  type: AgentPluginMarketplaceType
  branch?: string
  auth?: AgentPluginMarketplaceAuth & { token?: string }
}

interface MarketManifestPlugin {
  name: string
  source: string
  sourceKind?: 'git-subdir'
  sourceUrl?: string
  sourcePath?: string
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
    encryptToken: input?.encryptToken ?? encryptMarketplaceToken,
    decryptToken: input?.decryptToken ?? decryptMarketplaceToken,
    copyClonedFixture: input?.copyClonedFixture ?? '',
    onProgress: input?.onProgress ?? (() => undefined),
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

interface PluginInstallSource {
  cloneSource?: string
  localSource?: string
  subPath: string
  branch?: string
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

function normalizeRelativePluginPath(source: string): string {
  const trimmed = source.trim()
  if (trimmed === '.' || trimmed === './') return ''
  const normalized = trimmed.replace(/^\.?\//, '').replace(/^\/+/, '')
  const segments = normalized.split('/').filter(Boolean)
  if (segments.some((segment) => segment === '.' || segment === '..')) {
    throw new Error(`不支持的插件相对路径: ${source}`)
  }
  return joinUrlSegments(...segments)
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

function normalizeManifestPluginSource(value: unknown): Pick<MarketManifestPlugin, 'source' | 'sourceKind' | 'sourceUrl' | 'sourcePath'> | null {
  if (typeof value === 'string' && value.trim()) {
    return { source: value }
  }
  if (!isRecord(value)) return null
  if (value.source !== 'git-subdir') return null
  if (typeof value.url !== 'string' || !value.url.trim()) return null
  if (typeof value.path !== 'string' || !value.path.trim()) return null
  return {
    source: `${value.url}#${value.path}`,
    sourceKind: 'git-subdir',
    sourceUrl: value.url,
    sourcePath: value.path,
  }
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
      .map((item) => {
        const source = normalizeManifestPluginSource(item.source)
        const cachedGitSubdirSource = item.sourceKind === 'git-subdir'
          && typeof item.sourceUrl === 'string'
          && typeof item.sourcePath === 'string'
          ? { sourceKind: 'git-subdir' as const, sourceUrl: item.sourceUrl, sourcePath: item.sourcePath }
          : {}
        return {
          name: typeof item.name === 'string' ? item.name : '',
          ...(source ?? { source: '' }),
          ...cachedGitSubdirSource,
          ...(typeof item.description === 'string' && { description: item.description }),
          ...(typeof item.version === 'string' && { version: item.version }),
          ...(typeof item.strict === 'boolean' && { strict: item.strict }),
          ...(Array.isArray(item.skills) && { skills: item.skills.filter((skill): skill is string => typeof skill === 'string' && skill.trim().length > 0) }),
        }
      })
      .filter((item) => item.name && item.source),
  }
}

function resolveLocalMarketplaceManifestPath(sourcePath: string): string {
  if (!existsSync(sourcePath) || sourcePath.endsWith('.json')) return sourcePath
  const claudeMarketplacePath = join(sourcePath, '.claude-plugin', 'marketplace.json')
  if (existsSync(claudeMarketplacePath)) return claudeMarketplacePath
  return join(sourcePath, 'marketplace.json')
}

function parseMarketplaceType(value: unknown): AgentPluginMarketplaceType {
  return value === 'github' || value === 'gitee' || value === 'gitlab' || value === 'raw' || value === 'local' ? value : 'raw'
}

function parseMarketplaceAuthType(value: unknown): AgentPluginMarketplaceAuthType {
  return value === 'token' ? 'token' : 'none'
}

interface ElectronSafeStorage {
  isEncryptionAvailable: () => boolean
  encryptString: (plainText: string) => Buffer
  decryptString: (encrypted: Buffer) => string
}

function getSafeStorage(): ElectronSafeStorage | null {
  try {
    const electron = require('electron') as { safeStorage?: ElectronSafeStorage }
    return electron.safeStorage ?? null
  } catch {
    return null
  }
}

function encryptMarketplaceToken(token: string): string {
  const safeStorage = getSafeStorage()
  if (!safeStorage?.isEncryptionAvailable()) {
    console.warn('[插件市场] safeStorage 加密不可用，Token 将以明文存储')
    return token
  }
  return safeStorage.encryptString(token).toString('base64')
}

function decryptMarketplaceToken(token: string): string {
  const safeStorage = getSafeStorage()
  if (!safeStorage?.isEncryptionAvailable()) return token
  return safeStorage.decryptString(Buffer.from(token, 'base64'))
}

function marketplaceAuthState(authType: AgentPluginMarketplaceAuthType, authToken?: string): AgentPluginMarketplaceAuth | undefined {
  if (authType === 'none') return undefined
  return {
    type: 'token',
    tokenConfigured: Boolean(authToken?.trim()),
  }
}

function publicMarketplace(marketplace: AgentPluginMarketplace): AgentPluginMarketplace {
  const { authToken: _authToken, ...rest } = marketplace
  return rest
}

function normalizeMarketplaceAuth(
  auth: AddMarketplaceInput['auth'] | undefined,
  current: AgentPluginMarketplace | undefined,
  input: Required<PluginMarketplacePaths>,
): Pick<AgentPluginMarketplace, 'auth' | 'authToken'> {
  if (!auth && current) {
    return {
      auth: current.auth,
      authToken: current.authToken,
    }
  }

  const authType = parseMarketplaceAuthType(auth?.type)
  if (authType === 'none') {
    return { auth: undefined, authToken: undefined }
  }

  const token = typeof auth?.token === 'string' ? auth.token.trim() : ''
  const authToken = token ? input.encryptToken(token) : current?.authToken
  if (!authToken) throw new Error('Token 认证的插件市场需要填写 Token')
  return {
    auth: marketplaceAuthState('token', authToken),
    authToken,
  }
}

function marketplaceAuthHeader(marketplace: AgentPluginMarketplace, input: Required<PluginMarketplacePaths>): string | undefined {
  if (marketplace.auth?.type !== 'token' || !marketplace.authToken) return undefined
  const token = input.decryptToken(marketplace.authToken).trim()
  return token ? `Authorization: Bearer ${token}` : undefined
}

function marketplaceGitAuthHeader(marketplace: AgentPluginMarketplace, input: Required<PluginMarketplacePaths>): string | undefined {
  if (marketplace.auth?.type !== 'token' || !marketplace.authToken) return undefined
  const token = input.decryptToken(marketplace.authToken).trim()
  if (!token) return undefined
  if (marketplace.type === 'gitee') {
    return `Authorization: Basic ${Buffer.from(`oauth2:${token}`).toString('base64')}`
  }
  return `Authorization: Bearer ${token}`
}

export function getMarketplaceInstallToken(marketplaceId: string, input?: PluginMarketplacePaths): { encryptedToken: string; token: string } | null {
  const resolved = paths(input)
  const config = readPluginMarketplacesConfig({ marketplacesPath: resolved.marketplacesPath })
  const marketplace = config.marketplaces.find((item) => item.id === marketplaceId)
  if (!marketplace?.authToken) return null
  return {
    encryptedToken: marketplace.authToken,
    token: resolved.decryptToken(marketplace.authToken),
  }
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
        ? record.marketplaces.filter(isRecord).map((item): AgentPluginMarketplace => {
          const authToken = typeof item.authToken === 'string' ? item.authToken : undefined
          const authRecord = isRecord(item.auth) ? item.auth : {}
          const authType = authToken ? 'token' : parseMarketplaceAuthType(authRecord.type)
          const auth = marketplaceAuthState(authType, authToken)
          return {
            id: typeof item.id === 'string' ? item.id : '',
            name: typeof item.name === 'string' ? item.name : '',
            source: typeof item.source === 'string' ? item.source : '',
            type: parseMarketplaceType(item.type),
            ...(normalizeMarketplaceBranch(item.branch) && { branch: normalizeMarketplaceBranch(item.branch) }),
            ...(auth && { auth }),
            ...(authToken && { authToken }),
            enabled: typeof item.enabled === 'boolean' ? item.enabled : true,
            addedAt: typeof item.addedAt === 'string' ? item.addedAt : new Date().toISOString(),
            lastRefreshAt: typeof item.lastRefreshAt === 'string' || item.lastRefreshAt === null ? item.lastRefreshAt : null,
            ...(typeof item.lastError === 'string' && { lastError: item.lastError }),
          }
        }).filter((item) => item.id && item.name && item.source)
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
  return readPluginMarketplacesConfig(input).marketplaces.map(publicMarketplace)
}

export function addPluginMarketplace(marketplace: AddMarketplaceInput, input?: PluginMarketplacePaths): AgentPluginMarketplace {
  const resolved = paths(input)
  const config = readPluginMarketplacesConfig({ marketplacesPath: resolved.marketplacesPath })
  const id = slugSafe(marketplace.id, '插件市场 ID')
  const existedIndex = config.marketplaces.findIndex((item) => item.id === id)
  if (existedIndex !== -1) {
    const current = config.marketplaces[existedIndex]
    if (!current) throw new Error(`插件市场不存在: ${id}`)
    const auth = normalizeMarketplaceAuth(marketplace.auth, current, resolved)
    const next: AgentPluginMarketplace = {
      ...current,
      name: marketplace.name.trim() || id,
      source: marketplace.source.trim(),
      type: marketplace.type,
      branch: normalizeMarketplaceBranch(marketplace.branch),
      auth: auth.auth,
      authToken: auth.authToken,
      enabled: true,
      lastError: undefined,
    }
    config.marketplaces[existedIndex] = next
    writeMarketplacesConfig(config, { marketplacesPath: resolved.marketplacesPath })
    return publicMarketplace(next)
  }
  const auth = normalizeMarketplaceAuth(marketplace.auth, undefined, resolved)
  const entry: AgentPluginMarketplace = {
    id,
    name: marketplace.name.trim() || id,
    source: marketplace.source.trim(),
    type: marketplace.type,
    branch: normalizeMarketplaceBranch(marketplace.branch),
    auth: auth.auth,
    authToken: auth.authToken,
    enabled: true,
    addedAt: new Date().toISOString(),
    lastRefreshAt: null,
  }
  config.marketplaces.push(entry)
  writeMarketplacesConfig(config, { marketplacesPath: resolved.marketplacesPath })
  return publicMarketplace(entry)
}

export async function addAndRefreshPluginMarketplace(marketplace: AddMarketplaceInput, input?: PluginMarketplacePaths): Promise<AgentPluginMarketplace> {
  const resolved = paths(input)
  const previousConfig = readPluginMarketplacesConfig({ marketplacesPath: resolved.marketplacesPath })
  const id = slugSafe(marketplace.id, '插件市场 ID')
  const existed = previousConfig.marketplaces.some((item) => item.id === id)

  addPluginMarketplace(marketplace, resolved)
  try {
    return await refreshPluginMarketplace(id, resolved)
  } catch (error) {
    writeMarketplacesConfig(previousConfig, { marketplacesPath: resolved.marketplacesPath })
    if (!existed) {
      rmSync(join(resolved.cacheDir, id), { recursive: true, force: true })
    }
    throw error
  }
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
  return publicMarketplace(next)
}

export function removePluginMarketplace(id: string, input?: PluginMarketplacePaths): void {
  const resolved = paths(input)
  const config = readPluginMarketplacesConfig({ marketplacesPath: resolved.marketplacesPath })
  config.marketplaces = config.marketplaces.filter((item) => item.id !== id)
  writeMarketplacesConfig(config, { marketplacesPath: resolved.marketplacesPath })
  rmSync(join(resolved.cacheDir, id), { recursive: true, force: true })
}

async function readMarketplaceManifest(marketplace: AgentPluginMarketplace, input: Required<PluginMarketplacePaths>): Promise<MarketManifest> {
  if (marketplace.type === 'local') {
    const sourcePath = resolve(marketplace.source)
    return normalizeManifest(readJson(resolveLocalMarketplaceManifestPath(sourcePath)))
  }

  const url = resolveMarketplaceManifestUrl(marketplace)
  const authHeader = marketplaceAuthHeader(marketplace, input)
  const response = await fetch(url, {
    ...(authHeader && { headers: { Authorization: authHeader.replace(/^Authorization:\s*/i, '') } }),
  })
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
    const manifest = await readMarketplaceManifest(marketplace, resolved)
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

function resolveLocalPluginBase(marketplaceSource: string): string {
  const sourcePath = resolve(marketplaceSource)
  if (existsSync(sourcePath) && !sourcePath.endsWith('.json')) return sourcePath
  const manifestDir = dirname(sourcePath)
  return manifestDir.endsWith(`${sep}.claude-plugin`) ? dirname(manifestDir) : manifestDir
}

function resolvePluginInstallSource(marketplace: AgentPluginMarketplace, plugin: MarketManifestPlugin): PluginInstallSource {
  if (plugin.sourceKind === 'git-subdir') {
    if (marketplace.type === 'local') {
      return {
        localSource: resolve(resolveLocalPluginBase(marketplace.source), plugin.sourcePath ?? ''),
        subPath: '',
      }
    }
    return {
      cloneSource: plugin.sourceUrl,
      subPath: plugin.sourcePath ?? '',
    }
  }

  const source = plugin.source
  if (isAbsolute(source) && existsSync(source)) {
    return { localSource: source, subPath: '' }
  }

  if (/^https?:\/\//.test(source) || /^git@/.test(source)) {
    return { cloneSource: source, subPath: '' }
  }

  if (marketplace.type === 'github' || marketplace.type === 'gitee' || marketplace.type === 'gitlab') {
    const branch = normalizeMarketplaceBranch(marketplace.branch)
    const repository = normalizeMarketplaceRepositorySource(marketplace, branch ?? marketplaceBranch(marketplace))
    const subPath = joinUrlSegments(repository.subPath, normalizeRelativePluginPath(source))
    return {
      cloneSource: repository.root,
      subPath,
      ...(branch && { branch }),
    }
  }

  if (marketplace.type !== 'local') {
    return { cloneSource: new URL(source, marketplace.source).toString(), subPath: '' }
  }

  return { localSource: resolve(resolveLocalPluginBase(marketplace.source), source), subPath: '' }
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

async function cloneGitRepo(source: string, targetDir: string, branch?: string, authHeader?: string): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    const args = [
      'clone',
      '--depth',
      '1',
      ...(branch ? ['--branch', branch] : []),
      source,
      targetDir,
    ]
    const child = spawn('git', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      env: authHeader
        ? {
            ...process.env,
            GIT_CONFIG_COUNT: '1',
            GIT_CONFIG_KEY_0: 'http.extraHeader',
            GIT_CONFIG_VALUE_0: authHeader,
          }
        : process.env,
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

async function preparePluginSource(source: PluginInstallSource, pluginName: string, input: Required<PluginMarketplacePaths>, authHeader?: string): Promise<{ sourceDir: string; cleanup: () => void }> {
  if (source.localSource) {
    input.onProgress({ stage: 'preparing', message: '正在读取本地插件目录', progress: 20 })
    return { sourceDir: source.localSource, cleanup: () => undefined }
  }

  if (!source.cloneSource || (!/^https?:\/\//.test(source.cloneSource) && !/^git@/.test(source.cloneSource))) {
    throw new Error(`不支持的插件来源: ${source.cloneSource ?? ''}`)
  }

  const tmpRoot = join(input.cacheDir, '.installing', `${pluginName}-${Date.now()}`)
  rmSync(tmpRoot, { recursive: true, force: true })
  mkdirSync(dirname(tmpRoot), { recursive: true })
  input.onProgress({ stage: 'cloning', message: '正在下载插件仓库', progress: 20 })
  await input.cloneRepo(source.cloneSource, tmpRoot, source.branch, authHeader)
  input.onProgress({ stage: 'installing', message: '正在准备插件文件', progress: 55 })
  if (input.copyClonedFixture) {
    rmSync(tmpRoot, { recursive: true, force: true })
    cpSync(input.copyClonedFixture, tmpRoot, { recursive: true })
  }
  const sourceDir = source.subPath
    ? join(tmpRoot, ...source.subPath.split('/').filter(Boolean))
    : tmpRoot
  return {
    sourceDir,
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
  let capabilities = undefined as AgentPluginMarketplaceDetail['capabilities']
  const localPluginId = installedPluginId(marketplace.id, plugin.name)
  const installedPlugin = listInstalledPlugins({
    builtinDir: join(resolved.cacheDir, '.builtin-empty'),
    userDir: resolved.userPluginsDir,
    configPath: resolved.pluginsConfigPath,
  }).find((item) => item.id === localPluginId)
  if (isAbsolute(source) && existsSync(source)) {
    const manifestPath = join(source, '.claude-plugin', 'plugin.json')
    if (existsSync(manifestPath)) manifest = readJson(manifestPath) as AgentPluginManifest
    const readmePath = join(source, 'README.md')
    if (existsSync(readmePath)) readme = readFileSync(readmePath, 'utf-8')
  }
  if (installedPlugin) {
    manifest = {
      name: installedPlugin.name,
      version: installedPlugin.version,
      ...(installedPlugin.description && { description: installedPlugin.description }),
      ...(installedPlugin.author && { author: { name: installedPlugin.author } }),
      ...(installedPlugin.homepage && { homepage: installedPlugin.homepage }),
      ...(installedPlugin.repository && { repository: installedPlugin.repository }),
      ...(installedPlugin.license && { license: installedPlugin.license }),
      ...(installedPlugin.keywords.length > 0 && { keywords: installedPlugin.keywords }),
    }
    capabilities = installedPlugin.capabilities
    const installedReadmePath = join(installedPlugin.path, 'README.md')
    if (!readme && existsSync(installedReadmePath)) readme = readFileSync(installedReadmePath, 'utf-8')
  }
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
    ...(capabilities && { capabilities }),
    ...(readme && { readme }),
  }
}

export async function installMarketplacePlugin(input: AgentPluginInstallInput, pathInput?: PluginMarketplacePaths): Promise<AgentPluginInstallResult> {
  const resolved = paths(pathInput)
  const marketplaceId = slugSafe(input.marketplaceId, '插件市场 ID')
  const pluginName = slugSafe(input.pluginName, '插件名称')
  const { marketplace, plugin } = findMarketplacePlugin(marketplaceId, pluginName, resolved)
  const source = resolvePluginInstallSource(marketplace, plugin)
  const prepared = await preparePluginSource(source, pluginName, resolved, marketplaceGitAuthHeader(marketplace, resolved))

  const targetDir = join(resolved.userPluginsDir, marketplaceId, pluginName)
  let status: 'installed' | 'overwritten'
  try {
    resolved.onProgress({ stage: 'installing', message: '正在安装插件文件', progress: 65 })
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
    resolved.onProgress({ stage: 'installing', message: '正在清理临时文件', progress: 85 })
    prepared.cleanup()
  }
  resolved.onProgress({ stage: 'scanning', message: '正在写入插件配置', progress: 92 })
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
