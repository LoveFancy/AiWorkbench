/**
 * Agent 插件注册表服务
 *
 * 负责扫描内置插件和用户插件、维护全局启用状态，并为 Agent runtime
 * 生成 SDK local plugin path 列表。
 */

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import type {
  AgentPluginCapability,
  AgentPluginCapabilitySummary,
  AgentPluginInfo,
  AgentPluginManifest,
  AgentPluginsConfig,
  McpServerEntry,
} from '@proma/shared'
import {
  getDefaultPluginsDir,
  getPluginsConfigPath,
  getPluginRuntimeCacheDir,
  getUserPluginsDir,
} from './config-paths'
import { validateMcpServer } from './mcp-validator'

interface PluginRegistryPaths {
  builtinDir?: string
  userDir?: string
  configPath?: string
  runtimeDir?: string
}

interface PluginRuntimePath {
  type: 'local'
  path: string
}

interface PluginMcpServerDefinition {
  serverId: string
  runtimeName: string
  originalName: string
  pluginId: string
  pluginName: string
  entry: McpServerEntry
}

const DEFAULT_PLUGINS_CONFIG: AgentPluginsConfig = {
  version: 1,
  plugins: {},
  mcpServers: {},
}

function registryPaths(paths?: PluginRegistryPaths): Required<PluginRegistryPaths> {
  return {
    builtinDir: paths?.builtinDir ?? getDefaultPluginsDir(),
    userDir: paths?.userDir ?? getUserPluginsDir(),
    configPath: paths?.configPath ?? getPluginsConfigPath(),
    runtimeDir: paths?.runtimeDir ?? '',
  }
}

function resolveRuntimeDir(input: Required<PluginRegistryPaths>): string {
  return input.runtimeDir || getPluginRuntimeCacheDir()
}

function ensureParent(filePath: string): void {
  mkdirSync(dirname(filePath), { recursive: true })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readJsonFile(filePath: string): unknown {
  return JSON.parse(readFileSync(filePath, 'utf-8')) as unknown
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function stringRecord(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined
  const result: Record<string, string> = {}
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === 'string') result[key] = item
  }
  return Object.keys(result).length > 0 ? result : undefined
}

function normalizeManifest(raw: unknown, fallbackName: string): AgentPluginManifest {
  const record = isRecord(raw) ? raw : {}
  const author = isRecord(record.author) ? record.author : {}
  return {
    name: typeof record.name === 'string' && record.name.trim() ? record.name.trim() : fallbackName,
    version: typeof record.version === 'string' && record.version.trim() ? record.version.trim() : '0.0.0',
    ...(typeof record.description === 'string' && { description: record.description }),
    ...(isRecord(record.author) && {
      author: {
        ...(typeof author.name === 'string' && { name: author.name }),
        ...(typeof author.email === 'string' && { email: author.email }),
      },
    }),
    ...(typeof record.homepage === 'string' && { homepage: record.homepage }),
    ...(typeof record.repository === 'string' && { repository: record.repository }),
    ...(typeof record.license === 'string' && { license: record.license }),
    keywords: stringArray(record.keywords),
    expertGroups: stringArray(record.expertGroups),
  }
}

function readManifest(pluginPath: string): { manifest: AgentPluginManifest; issues: AgentPluginInfo['issues'] } {
  const manifestPath = join(pluginPath, '.claude-plugin', 'plugin.json')
  if (!existsSync(manifestPath)) {
    return {
      manifest: { name: basename(pluginPath), version: '0.0.0', keywords: [] },
      issues: [{ level: 'error', message: '缺少 .claude-plugin/plugin.json' }],
    }
  }

  try {
    return {
      manifest: normalizeManifest(readJsonFile(manifestPath), basename(pluginPath)),
      issues: [],
    }
  } catch (error) {
    return {
      manifest: { name: basename(pluginPath), version: '0.0.0', keywords: [] },
      issues: [{ level: 'error', message: `解析 plugin.json 失败: ${error instanceof Error ? error.message : String(error)}` }],
    }
  }
}

function readDescriptionFromMarkdown(filePath: string): string | undefined {
  try {
    const content = readFileSync(filePath, 'utf-8')
    const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/)
    if (fmMatch?.[1]) {
      for (const line of fmMatch[1].split('\n')) {
        const index = line.indexOf(':')
        if (index <= 0) continue
        const key = line.slice(0, index).trim()
        const value = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, '')
        if (key === 'description' && value) return value
      }
    }
    return content
      .replace(/^---\s*\n[\s\S]*?\n---\s*/, '')
      .split('\n')
      .map((line) => line.trim())
      .find(Boolean)
  } catch {
    return undefined
  }
}

function collectMarkdownFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  const files: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...collectMarkdownFiles(fullPath))
    } else if (entry.isFile() && ['.md', '.markdown'].includes(extname(entry.name).toLowerCase())) {
      files.push(fullPath)
    }
  }
  return files
}

function discoverSkills(pluginPath: string, pluginId: string, sourceLabel: string, enabled: boolean): AgentPluginCapability[] {
  const skillsDir = join(pluginPath, 'skills')
  if (!existsSync(skillsDir)) return []
  return readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(skillsDir, entry.name, 'SKILL.md')))
    .map((entry) => ({
      type: 'skill' as const,
      name: entry.name,
      sourcePluginId: pluginId,
      sourceLabel,
      relativePath: `skills/${entry.name}`,
      description: readDescriptionFromMarkdown(join(skillsDir, entry.name, 'SKILL.md')),
      enabled,
    }))
}

function commandName(commandsDir: string, filePath: string): string {
  return basename(filePath).replace(/\.(md|markdown)$/i, '')
}

function discoverMarkdownCapabilities(
  pluginPath: string,
  dirName: 'commands' | 'agents',
  type: 'command' | 'agent',
  pluginId: string,
  sourceLabel: string,
  enabled: boolean,
): AgentPluginCapability[] {
  const root = join(pluginPath, dirName)
  return collectMarkdownFiles(root).map((filePath) => ({
    type,
    name: commandName(root, filePath),
    sourcePluginId: pluginId,
    sourceLabel,
    relativePath: relative(pluginPath, filePath).split(sep).join('/'),
    description: readDescriptionFromMarkdown(filePath),
    enabled,
  }))
}

function discoverMcp(pluginPath: string, pluginId: string, sourceLabel: string, enabled: boolean, config: AgentPluginsConfig): AgentPluginCapability[] {
  const mcpPath = join(pluginPath, '.mcp.json')
  if (!existsSync(mcpPath)) return []
  try {
    const raw = readJsonFile(mcpPath)
    const record = isRecord(raw) ? raw : {}
    const servers = isRecord(record.mcpServers) ? record.mcpServers : record
    return Object.keys(servers)
      .filter((name) => isRecord(servers[name]))
      .map((name) => ({
        type: 'mcp' as const,
        name,
        sourcePluginId: pluginId,
        sourceLabel,
        relativePath: '.mcp.json',
        enabled,
        mcpServerId: `${pluginId}/${name}`,
        ...(config.mcpServers[`${pluginId}/${name}`]?.env && { configuredEnv: config.mcpServers[`${pluginId}/${name}`]?.env }),
        ...(config.mcpServers[`${pluginId}/${name}`]?.lastTestAt && { lastTestAt: config.mcpServers[`${pluginId}/${name}`]?.lastTestAt }),
        ...(typeof config.mcpServers[`${pluginId}/${name}`]?.lastTestSuccess === 'boolean' && { lastTestSuccess: config.mcpServers[`${pluginId}/${name}`]?.lastTestSuccess }),
        ...(config.mcpServers[`${pluginId}/${name}`]?.lastTestMessage && { lastTestMessage: config.mcpServers[`${pluginId}/${name}`]?.lastTestMessage }),
      }))
  } catch (error) {
    return [{
      type: 'mcp',
      name: '.mcp.json',
      sourcePluginId: pluginId,
      sourceLabel,
      relativePath: '.mcp.json',
      enabled,
      mcpServerId: `${pluginId}/.mcp.json`,
      issue: { level: 'error', message: `解析 .mcp.json 失败: ${error instanceof Error ? error.message : String(error)}` },
    }]
  }
}

function readExpertGroupTitle(filePath: string): { title?: string; issue?: AgentPluginCapability['issue'] } {
  try {
    const raw = readJsonFile(filePath)
    if (!isRecord(raw)) {
      return { issue: { level: 'error', message: `专家团配置不是 JSON 对象: ${filePath}` } }
    }
    const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : undefined
    return { ...(name && { title: name }) }
  } catch (error) {
    return {
      issue: {
        level: 'error',
        message: `解析专家团配置失败: ${error instanceof Error ? error.message : String(error)}`,
      },
    }
  }
}

function discoverExpertGroups(
  pluginPath: string,
  pluginId: string,
  sourceLabel: string,
  enabled: boolean,
  manifest: AgentPluginManifest,
): AgentPluginCapability[] {
  const groupsDir = join(pluginPath, 'expert-groups')
  const indexed = new Set(manifest.expertGroups ?? [])
  const discovered = new Set<string>()
  const capabilities: AgentPluginCapability[] = []

  for (const id of indexed) {
    const relativePath = `expert-groups/${id}.json`
    const filePath = join(pluginPath, relativePath)
    discovered.add(id)
    if (!existsSync(filePath)) {
      capabilities.push({
        type: 'expert-group',
        name: id,
        sourcePluginId: pluginId,
        sourceLabel,
        relativePath,
        enabled,
        issue: { level: 'error', message: `插件声明的专家团不存在: ${relativePath}` },
      })
      continue
    }
    const { title, issue } = readExpertGroupTitle(filePath)
    capabilities.push({
      type: 'expert-group',
      name: id,
      sourcePluginId: pluginId,
      sourceLabel,
      relativePath,
      ...(title && { description: title }),
      enabled,
      ...(issue && { issue }),
    })
  }

  if (!existsSync(groupsDir)) return capabilities

  for (const entry of readdirSync(groupsDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue
    const id = entry.name.replace(/\.json$/i, '')
    if (discovered.has(id)) continue
    const relativePath = `expert-groups/${entry.name}`
    const { title, issue } = readExpertGroupTitle(join(groupsDir, entry.name))
    capabilities.push({
      type: 'expert-group',
      name: id,
      sourcePluginId: pluginId,
      sourceLabel,
      relativePath,
      ...(title && { description: title }),
      enabled,
      issue: issue ?? { level: 'warning', message: `专家团未在 plugin.json 的 expertGroups 中声明: ${id}` },
    })
  }

  return capabilities
}

function normalizeMcpEntry(raw: unknown): McpServerEntry | null {
  if (!isRecord(raw)) return null
  const type = raw.type === 'stdio' || raw.type === 'http' || raw.type === 'sse' ? raw.type : undefined
  if (!type) return null

  return {
    type,
    ...(typeof raw.command === 'string' && { command: raw.command }),
    ...(Array.isArray(raw.args) && { args: raw.args.filter((item): item is string => typeof item === 'string') }),
    ...(stringRecord(raw.env) && { env: stringRecord(raw.env) }),
    ...(typeof raw.url === 'string' && { url: raw.url }),
    ...(stringRecord(raw.headers) && { headers: stringRecord(raw.headers) }),
    ...(typeof raw.timeout === 'number' && { timeout: raw.timeout }),
    ...(typeof raw.startup_timeout_sec === 'number' && { timeout: raw.startup_timeout_sec }),
    enabled: true,
  }
}

function readPluginMcpEntries(pluginPath: string): Record<string, McpServerEntry> {
  const mcpPath = join(pluginPath, '.mcp.json')
  if (!existsSync(mcpPath)) return {}
  const raw = readJsonFile(mcpPath)
  const record = isRecord(raw) ? raw : {}
  const servers = isRecord(record.mcpServers) ? record.mcpServers : record
  const entries: Record<string, McpServerEntry> = {}
  for (const [name, value] of Object.entries(servers)) {
    const entry = normalizeMcpEntry(value)
    if (entry) entries[name] = entry
  }
  return entries
}

function hasConfiguredMcpEnv(plugin: AgentPluginInfo, config: AgentPluginsConfig): boolean {
  return plugin.capabilities
    .filter((capability) => capability.type === 'mcp' && capability.mcpServerId)
    .some((capability) => Object.keys(config.mcpServers[capability.mcpServerId ?? '']?.env ?? {}).length > 0)
}

function writeRuntimeMcpOverlay(plugin: AgentPluginInfo, targetDir: string, config: AgentPluginsConfig): void {
  const entries = readPluginMcpEntries(plugin.path)
  const mcpServers: Record<string, Record<string, unknown>> = {}
  for (const [serverName, entry] of Object.entries(entries)) {
    const env = config.mcpServers[`${plugin.id}/${serverName}`]?.env ?? {}
    mcpServers[serverName] = {
      ...entry,
      ...(entry.env || Object.keys(env).length > 0
        ? { env: { ...(entry.env ?? {}), ...env } }
        : {}),
    }
  }
  writeFileSync(join(targetDir, '.mcp.json'), JSON.stringify({ mcpServers }, null, 2), 'utf-8')
}

function runtimePluginPath(plugin: AgentPluginInfo, config: AgentPluginsConfig, runtimeDir: string): string {
  if (!hasConfiguredMcpEnv(plugin, config)) return plugin.path
  if (!runtimeDir) return plugin.path

  const safeId = plugin.id.replace(/[^a-zA-Z0-9._-]/g, '_')
  const targetDir = join(runtimeDir, safeId)
  rmSync(targetDir, { recursive: true, force: true })
  mkdirSync(dirname(targetDir), { recursive: true })
  cpSync(plugin.path, targetDir, { recursive: true })
  writeRuntimeMcpOverlay(plugin, targetDir, config)
  return targetDir
}

function runtimeMcpName(pluginId: string, serverName: string): string {
  const pluginPart = pluginId
    .replace(/^builtin:/, 'builtin_')
    .replace(/^user:/, 'user_')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
  const serverPart = serverName.replace(/[^a-zA-Z0-9._-]/g, '_')
  return `${pluginPart}__${serverPart}`
}

function listPluginMcpDefinitions(paths?: PluginRegistryPaths): PluginMcpServerDefinition[] {
  return listInstalledPlugins(paths)
    .filter((plugin) => plugin.enabled && plugin.issues.every((issue) => issue.level !== 'error'))
    .flatMap((plugin) => Object.entries(readPluginMcpEntries(plugin.path)).map(([serverName, entry]) => ({
      serverId: `${plugin.id}/${serverName}`,
      runtimeName: runtimeMcpName(plugin.id, serverName),
      originalName: serverName,
      pluginId: plugin.id,
      pluginName: plugin.name,
      entry,
    })))
}

function defaultEnabledFor(pluginId: string, config: AgentPluginsConfig): boolean {
  const state = config.plugins[pluginId]
  return state?.enabled ?? true
}

function pluginInfoFromPath(kind: 'builtin' | 'user', pluginPath: string, pluginId: string, config: AgentPluginsConfig): AgentPluginInfo {
  const { manifest, issues } = readManifest(pluginPath)
  const enabled = defaultEnabledFor(pluginId, config)
  const state = config.plugins[pluginId]
  const sourceLabel = manifest.name || basename(pluginPath)
  const capabilities = [
    ...discoverSkills(pluginPath, pluginId, sourceLabel, enabled),
    ...discoverMarkdownCapabilities(pluginPath, 'commands', 'command', pluginId, sourceLabel, enabled),
    ...discoverMarkdownCapabilities(pluginPath, 'agents', 'agent', pluginId, sourceLabel, enabled),
    ...discoverMcp(pluginPath, pluginId, sourceLabel, enabled, config),
    ...discoverExpertGroups(pluginPath, pluginId, sourceLabel, enabled, manifest),
  ]
  const capabilityIssues = capabilities.flatMap((capability) => capability.issue ? [capability.issue] : [])

  return {
    id: pluginId,
    kind,
    name: manifest.name,
    version: manifest.version,
    ...(manifest.description && { description: manifest.description }),
    ...(manifest.author?.name && { author: manifest.author.name }),
    ...(manifest.homepage && { homepage: manifest.homepage }),
    ...(manifest.repository && { repository: manifest.repository }),
    ...(manifest.license && { license: manifest.license }),
    keywords: manifest.keywords ?? [],
    path: pluginPath,
    enabled,
    ...(state?.installedAt && { installedAt: state.installedAt }),
    ...(state?.updatedAt && { updatedAt: state.updatedAt }),
    ...(state?.sourceMarketplaceId && { sourceMarketplaceId: state.sourceMarketplaceId }),
    capabilities,
    issues: [...issues, ...capabilityIssues],
  }
}

export function readPluginsConfig(paths?: Pick<PluginRegistryPaths, 'configPath'>): AgentPluginsConfig {
  const configPath = paths?.configPath ?? getPluginsConfigPath()
  if (!existsSync(configPath)) return structuredClone(DEFAULT_PLUGINS_CONFIG)

  try {
    const raw = readJsonFile(configPath)
    const record = isRecord(raw) ? raw : {}
    return {
      version: 1,
      plugins: isRecord(record.plugins) ? record.plugins as AgentPluginsConfig['plugins'] : {},
      mcpServers: isRecord(record.mcpServers) ? record.mcpServers as AgentPluginsConfig['mcpServers'] : {},
    }
  } catch (error) {
    console.warn('[插件] 读取 plugins.json 失败，使用默认配置:', error)
    return structuredClone(DEFAULT_PLUGINS_CONFIG)
  }
}

export function writePluginsConfig(config: AgentPluginsConfig, paths?: Pick<PluginRegistryPaths, 'configPath'>): void {
  const configPath = paths?.configPath ?? getPluginsConfigPath()
  ensureParent(configPath)
  writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
}

export function listInstalledPlugins(paths?: PluginRegistryPaths): AgentPluginInfo[] {
  const resolved = registryPaths(paths)
  const config = readPluginsConfig({ configPath: resolved.configPath })
  const plugins: AgentPluginInfo[] = []

  if (existsSync(resolved.builtinDir)) {
    for (const entry of readdirSync(resolved.builtinDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      plugins.push(pluginInfoFromPath('builtin', join(resolved.builtinDir, entry.name), `builtin:${entry.name}`, config))
    }
  }

  if (existsSync(resolved.userDir)) {
    for (const market of readdirSync(resolved.userDir, { withFileTypes: true })) {
      if (!market.isDirectory()) continue
      const marketDir = join(resolved.userDir, market.name)
      for (const entry of readdirSync(marketDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue
        const pluginId = `user:${market.name}/${entry.name}`
        const plugin = pluginInfoFromPath('user', join(marketDir, entry.name), pluginId, config)
        plugins.push({
          ...plugin,
          sourceMarketplaceId: plugin.sourceMarketplaceId ?? market.name,
        })
      }
    }
  }

  return plugins.sort((a, b) => a.id.localeCompare(b.id))
}

export function getPluginCapabilitySummary(paths?: PluginRegistryPaths): AgentPluginCapabilitySummary {
  const plugins = listInstalledPlugins(paths)
  const conflictKeys = new Map<string, string[]>()
  for (const capability of plugins.flatMap((plugin) => plugin.capabilities).filter((item) => item.enabled)) {
    if (!['command', 'agent', 'mcp'].includes(capability.type)) continue
    const key = `${capability.type}:${capability.name}`
    conflictKeys.set(key, [...(conflictKeys.get(key) ?? []), capability.sourcePluginId])
  }
  const capabilities = plugins.flatMap((plugin) => plugin.capabilities.map((capability) => {
    const key = `${capability.type}:${capability.name}`
    const conflicts = (conflictKeys.get(key) ?? []).filter((pluginId) => pluginId !== capability.sourcePluginId)
    return conflicts.length > 0
      ? { ...capability, conflict: true, conflictWith: conflicts }
      : capability
  }))
  return {
    plugins,
    capabilities,
  }
}

export function setPluginEnabled(pluginId: string, enabled: boolean, paths?: PluginRegistryPaths): void {
  const resolved = registryPaths(paths)
  const config = readPluginsConfig({ configPath: resolved.configPath })
  config.plugins[pluginId] = {
    ...config.plugins[pluginId],
    enabled,
  }
  writePluginsConfig(config, { configPath: resolved.configPath })
}

export function updatePluginMcpEnv(serverId: string, env: Record<string, string>, paths?: Pick<PluginRegistryPaths, 'configPath'>): void {
  const configPath = paths?.configPath ?? getPluginsConfigPath()
  const config = readPluginsConfig({ configPath })
  config.mcpServers[serverId] = {
    ...config.mcpServers[serverId],
    env,
  }
  writePluginsConfig(config, { configPath })
}

export function buildPluginMcpServers(paths?: PluginRegistryPaths): Record<string, Record<string, unknown>> {
  const resolved = registryPaths(paths)
  const config = readPluginsConfig({ configPath: resolved.configPath })
  const mcpServers: Record<string, Record<string, unknown>> = {}

  for (const definition of listPluginMcpDefinitions(resolved)) {
    const configuredEnv = config.mcpServers[definition.serverId]?.env ?? {}
    const entry = definition.entry

    if (entry.type === 'stdio' && entry.command) {
      const mergedEnv: Record<string, string> = {
        ...(process.env.PATH && { PATH: process.env.PATH }),
        ...(entry.env ?? {}),
        ...configuredEnv,
      }
      mcpServers[definition.runtimeName] = {
        type: 'stdio',
        command: entry.command,
        ...(entry.args && entry.args.length > 0 && { args: entry.args }),
        ...(Object.keys(mergedEnv).length > 0 && { env: mergedEnv }),
        required: false,
        startup_timeout_sec: entry.timeout ?? 30,
      }
    } else if ((entry.type === 'http' || entry.type === 'sse') && entry.url) {
      mcpServers[definition.runtimeName] = {
        type: entry.type,
        url: entry.url,
        ...(entry.headers && Object.keys(entry.headers).length > 0 && { headers: entry.headers }),
        required: false,
      }
    }
  }

  return mcpServers
}

export async function testPluginMcpServer(serverId: string, paths?: PluginRegistryPaths): Promise<{ success: boolean; message: string }> {
  const resolved = registryPaths(paths)
  const definition = listPluginMcpDefinitions(resolved).find((item) => item.serverId === serverId)
  if (!definition) {
    return { success: false, message: `插件 MCP 不存在或所属插件未启用: ${serverId}` }
  }

  const config = readPluginsConfig({ configPath: resolved.configPath })
  const entry: McpServerEntry = {
    ...definition.entry,
    env: {
      ...(definition.entry.env ?? {}),
      ...(config.mcpServers[serverId]?.env ?? {}),
    },
    enabled: true,
  }
  const result = await validateMcpServer(definition.runtimeName, entry)
  const success = result.valid
  const message = success ? '连接配置检查通过' : (result.reason || '连接配置检查失败')
  config.mcpServers[serverId] = {
    ...config.mcpServers[serverId],
    lastTestAt: new Date().toISOString(),
    lastTestSuccess: success,
    lastTestMessage: message,
  }
  writePluginsConfig(config, { configPath: resolved.configPath })
  return { success, message }
}

export function buildPluginRuntimePaths(paths?: PluginRegistryPaths): PluginRuntimePath[] {
  const resolved = registryPaths(paths)
  const config = readPluginsConfig({ configPath: resolved.configPath })
  return listInstalledPlugins(resolved)
    .filter((plugin) => plugin.enabled && plugin.issues.every((issue) => issue.level !== 'error'))
    .map((plugin) => {
      const runtimeDir = hasConfiguredMcpEnv(plugin, config) ? resolveRuntimeDir(resolved) : ''
      return { type: 'local' as const, path: runtimePluginPath(plugin, config, runtimeDir) }
    })
}

export function uninstallUserPlugin(pluginId: string, paths?: PluginRegistryPaths): void {
  if (!pluginId.startsWith('user:')) {
    throw new Error('内置插件不能卸载，只能禁用')
  }
  const resolved = registryPaths(paths)
  const relativeId = pluginId.slice('user:'.length)
  if (relativeId.split('/').some((part) => part === '..' || part === '' || part.startsWith('.'))) {
    throw new Error(`非法插件 ID: ${pluginId}`)
  }
  const pluginPath = resolve(resolved.userDir, relativeId)
  const rel = relative(resolved.userDir, pluginPath)
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`非法插件 ID: ${pluginId}`)
  }
  rmSync(pluginPath, { recursive: true, force: true })

  const config = readPluginsConfig({ configPath: resolved.configPath })
  delete config.plugins[pluginId]
  for (const key of Object.keys(config.mcpServers)) {
    if (key.startsWith(`${pluginId}/`)) delete config.mcpServers[key]
  }
  writePluginsConfig(config, { configPath: resolved.configPath })
}
