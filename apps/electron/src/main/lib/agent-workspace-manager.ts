/**
 * Agent 工作区管理器
 *
 * 负责 Agent 工作区的 CRUD 操作。
 * - 工作区索引：~/.proma/agent-workspaces.json（轻量元数据）
 * - 工作区目录：~/.proma/agent-workspaces/{slug}/（Agent 的 cwd）
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, cpSync, copyFileSync, rmSync, mkdirSync, statSync, renameSync, openSync, readSync, closeSync } from 'node:fs'
import { writeJsonFileAtomic, readJsonFileSafe } from './safe-file'
import { randomUUID } from 'node:crypto'
import { join, resolve, relative, isAbsolute, dirname, basename } from 'node:path'
import { tmpdir } from 'node:os'
import AdmZip from 'adm-zip'
import {
  getAgentWorkspacesIndexPath,
  getAgentWorkspacesDir,
  getAgentWorkspacePath,
  getWorkspaceMcpPath,
  getWorkspaceSkillsDir,
  getInactiveSkillsDir,
  getDefaultSkillsDir,
  getConnectorsDir,
  getConnectorsConfigPath,
  getDefaultConnectorsDir,
  seedDefaultConnectors,
  parseSkillVersion,
} from './config-paths'
import { listInstalledPlugins } from './plugin-registry-service'
import type { AgentPluginInfo } from '@proma/shared'
import type { AgentWorkspace, WorkspaceMcpConfig, McpServerEntry, SkillMeta, SkillImportSource, OtherWorkspaceSkillsGroup, WorkspaceCapabilities, SkillFileNode, SkillFileContent, ConnectorsConfig, ConnectorEntry } from '@proma/shared'
import { isGeneralPlugin } from '@proma/shared'

interface AgentWorkspacesIndex {
  version: number
  workspaces: AgentWorkspace[]
}

const INDEX_VERSION = 3

const DEFAULT_SKILLS_TO_ENABLE_ON_MIGRATION = ['huatai-email-setup', 'install-python'] as const
const REMOVED_DEFAULT_SKILL_SLUGS = ['proma-coach'] as const

interface InstallSkillZipOptions {
  activeDir?: string
  inactiveDir?: string
  tempRoot?: string
}

interface WorkspaceSkillDirs {
  activeDir?: string
  inactiveDir?: string
}

export function getDefaultSkillInitialEnabled(_skillSlug: string): boolean {
  return true
}

/** 读取工作区索引文件，自动执行版本迁移 */
function readIndex(): AgentWorkspacesIndex {
  const indexPath = getAgentWorkspacesIndexPath()
  const data = readJsonFileSafe<AgentWorkspacesIndex>(indexPath)

  if (data) {
    // 版本迁移
    if ((data.version ?? 1) < INDEX_VERSION) {
      migrateIndex(data)
    }
    return data
  }

  return { version: INDEX_VERSION, workspaces: [] }
}

function migrateIndex(index: AgentWorkspacesIndex): void {
  const oldVersion = index.version ?? 1

  // v1 → v2: 为所有工作区默认启用 skill-creator
  if (oldVersion < 2) {
    activateSkillCreatorInAllWorkspaces(index)
  }

  // v2 → v3: 华泰邮箱和 Python 安装 Skill 改为默认启用
  if (oldVersion < 3) {
    activateDefaultEnabledSkillsInAllWorkspaces(index)
  }

  index.version = INDEX_VERSION
  writeIndex(index)
  console.log(`[Agent 工作区] 索引已迁移: v${oldVersion} → v${INDEX_VERSION}`)
}

/** v1→v2 迁移：将 skills-inactive/skill-creator 移到 skills/ */
function activateSkillCreatorInAllWorkspaces(index: AgentWorkspacesIndex): void {
  for (const workspace of index.workspaces) {
    const activeDir = getWorkspaceSkillsDir(workspace.slug)
    const inactiveDir = getInactiveSkillsDir(workspace.slug)

    const inactivePath = join(inactiveDir, 'skill-creator')
    const activePath = join(activeDir, 'skill-creator')

    if (existsSync(activePath) || !existsSync(inactivePath)) continue

    try {
      if (!existsSync(activeDir)) {
        mkdirSync(activeDir, { recursive: true })
      }
      renameSync(inactivePath, activePath)
      console.log(`[Agent 工作区] 已为 ${workspace.slug} 启用 skill-creator`)
    } catch (err) {
      console.warn(`[Agent 工作区] 启用 skill-creator 失败 (${workspace.slug}):`, err)
    }
  }
}

/** v2→v3 迁移：将现在默认启用的内置 Skill 从 inactive 移到 active */
function activateDefaultEnabledSkillsInAllWorkspaces(index: AgentWorkspacesIndex): void {
  for (const workspace of index.workspaces) {
    activateDefaultEnabledSkillsForWorkspace(workspace.slug)
  }
}

export function activateDefaultEnabledSkillsForWorkspace(workspaceSlug: string, dirs: WorkspaceSkillDirs = {}): void {
  const activeDir = dirs.activeDir ?? getWorkspaceSkillsDir(workspaceSlug)
  const inactiveDir = dirs.inactiveDir ?? getInactiveSkillsDir(workspaceSlug)

  for (const skillSlug of DEFAULT_SKILLS_TO_ENABLE_ON_MIGRATION) {
    const inactivePath = join(inactiveDir, skillSlug)
    const activePath = join(activeDir, skillSlug)

    if (existsSync(activePath) || !existsSync(inactivePath)) continue

    try {
      if (!existsSync(activeDir)) {
        mkdirSync(activeDir, { recursive: true })
      }
      renameSync(inactivePath, activePath)
      console.log(`[Agent 工作区] 已默认启用 ${skillSlug}: ${workspaceSlug}`)
    } catch (err) {
      console.warn(`[Agent 工作区] 默认启用 ${skillSlug} 失败 (${workspaceSlug}):`, err)
    }
  }
}

function writeIndex(index: AgentWorkspacesIndex): void {
  const indexPath = getAgentWorkspacesIndexPath()

  try {
    writeJsonFileAtomic(indexPath, index)
  } catch (error) {
    console.error('[Agent 工作区] 写入索引文件失败:', error)
    throw new Error('写入 Agent 工作区索引失败')
  }
}

/** 名称转 URL-safe slug，非 ASCII 名称 fallback 为 workspace-{timestamp} */
function slugify(name: string, existingSlugs: Set<string>): string {
  let base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

  if (!base) {
    base = `workspace-${Date.now()}`
  }

  let slug = base
  let counter = 1
  while (existingSlugs.has(slug)) {
    slug = `${base}-${counter}`
    counter++
  }

  return slug
}

/** 返回索引中的存储顺序（与 UI 拖拽顺序一致）；返回副本，避免调用方 sort 等操作误改索引数组 */

export function listAgentWorkspaces(): AgentWorkspace[] {
  const index = readIndex()
  return index.workspaces.slice()
}

/** 按 updatedAt 降序（桥接/飞书列表等与旧版内联 sort 一致；渲染进程仍用 listAgentWorkspaces） */
export function listAgentWorkspacesByUpdatedAt(): AgentWorkspace[] {
  const index = readIndex()
  return index.workspaces.slice().sort((a, b) => b.updatedAt - a.updatedAt)
}

/** 按指定 ID 顺序重排工作区，未列出的追加到末尾 */
export function reorderAgentWorkspaces(orderedIds: string[]): AgentWorkspace[] {
  const index = readIndex()
  const byId = new Map(index.workspaces.map((w) => [w.id, w]))
  const reordered: AgentWorkspace[] = []
  for (const id of orderedIds) {
    const ws = byId.get(id)
    if (ws) {
      reordered.push(ws)
      byId.delete(id)
    }
  }
  for (const ws of byId.values()) reordered.push(ws)
  index.workspaces = reordered
  writeIndex(index)
  return reordered
}

export function getAgentWorkspace(id: string): AgentWorkspace | undefined {
  const index = readIndex()
  return index.workspaces.find((w) => w.id === id)
}

/** 将 ~/.proma/default-skills/ 的内容逐个复制到工作区，默认禁用项进入 skills-inactive/ */
function copyDefaultSkills(workspaceSlug: string): void {
  const defaultDir = getDefaultSkillsDir()
  const activeDir = getWorkspaceSkillsDir(workspaceSlug)
  const inactiveDir = getInactiveSkillsDir(workspaceSlug)

  try {
    const entries = readdirSync(defaultDir, { withFileTypes: true })
    if (entries.length === 0) {
      console.warn(`[Agent 工作区] 默认 Skills 模板为空，工作区 Skills 未初始化: ${workspaceSlug}`)
      return
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const source = join(defaultDir, entry.name)
      const targetDir = getDefaultSkillInitialEnabled(entry.name) ? activeDir : inactiveDir
      const target = join(targetDir, entry.name)
      cpSync(source, target, { recursive: true })
    }
    console.log(`[Agent 工作区] 已复制默认 Skills 到: ${workspaceSlug}`)
  } catch (err) {
    console.error(`[Agent 工作区] 复制默认 Skills 失败 (${workspaceSlug}):`, err)
  }
}

export function createAgentWorkspace(name: string): AgentWorkspace {
  const index = readIndex()

  const duplicate = index.workspaces.find((w) => w.name === name)
  if (duplicate) {
    throw new Error(`工作区名称「${name}」已存在`)
  }

  const existingSlugs = new Set(index.workspaces.map((w) => w.slug))
  const slug = slugify(name, existingSlugs)
  const now = Date.now()

  const workspace: AgentWorkspace = {
    id: randomUUID(),
    name,
    slug,
    createdAt: now,
    updatedAt: now,
  }

  getAgentWorkspacePath(slug)
  ensurePluginManifest(slug, name)
  copyDefaultSkills(slug)
  syncDefaultConnectorsToWorkspace(slug)

  index.workspaces.unshift(workspace)
  writeIndex(index)

  console.log(`[Agent 工作区] 已创建工作区: ${name} (slug: ${slug})`)
  return workspace
}

/** 更新工作区名称（slug 和目录不变） */
export function updateAgentWorkspace(
  id: string,
  updates: { name: string },
): AgentWorkspace {
  const index = readIndex()
  const idx = index.workspaces.findIndex((w) => w.id === id)

  if (idx === -1) {
    throw new Error(`Agent 工作区不存在: ${id}`)
  }

  const existing = index.workspaces[idx]!

  const duplicate = index.workspaces.find((w) => w.id !== id && w.name === updates.name)
  if (duplicate) {
    throw new Error(`工作区名称「${updates.name}」已存在`)
  }

  const updated: AgentWorkspace = {
    ...existing,
    name: updates.name,
    updatedAt: Date.now(),
  }

  index.workspaces[idx] = updated
  writeIndex(index)

  console.log(`[Agent 工作区] 已更新工作区: ${updated.name} (${updated.id})`)
  return updated
}

/** 删除工作区索引条目及其本地目录 */
export function deleteAgentWorkspace(id: string): void {
  const index = readIndex()
  const idx = index.workspaces.findIndex((w) => w.id === id)

  if (idx === -1) {
    throw new Error(`Agent 工作区不存在: ${id}`)
  }

  const target = index.workspaces[idx]!
  if (target.slug === 'default') {
    throw new Error('默认项目不能删除')
  }
  if (index.workspaces.length <= 1) {
    throw new Error('至少需要保留一个项目')
  }

  const workspacesRoot = resolve(getAgentWorkspacesDir())
  const workspaceDir = resolve(join(workspacesRoot, target.slug))
  const relativePath = relative(workspacesRoot, workspaceDir)
  if (!relativePath || relativePath.startsWith('..') || isAbsolute(relativePath)) {
    throw new Error(`工作区目录路径异常，已跳过删除: ${workspaceDir}`)
  }

  // 先移除索引条目并落盘，再删目录：
  // 即使随后 rmSync 失败，也只会残留一个无引用目录（无害，可被同 slug 重建覆盖），
  // 而不会留下指向已删目录的孤儿索引条目导致 UI 状态不一致
  const removed = index.workspaces.splice(idx, 1)[0]!
  writeIndex(index)

  if (existsSync(workspaceDir)) {
    try {
      rmSync(workspaceDir, { recursive: true, force: true })
      console.log(`[Agent 工作区] 已删除工作区目录: ${workspaceDir}`)
    } catch (error) {
      console.warn(`[Agent 工作区] 删除工作区目录失败，已残留无引用目录 (${target.slug}):`, error)
    }
  }

  console.log(`[Agent 工作区] 已删除工作区: ${removed.name} (slug: ${removed.slug})`)
}

/** 确保默认工作区存在，首次启动时自动创建（slug: default） */
export function ensureDefaultWorkspace(): AgentWorkspace {
  const index = readIndex()
  let defaultWs = index.workspaces.find((w) => w.slug === 'default')

  if (!defaultWs) {
    const now = Date.now()
    defaultWs = {
      id: randomUUID(),
      name: '默认工作区',
      slug: 'default',
      createdAt: now,
      updatedAt: now,
    }

    getAgentWorkspacePath('default')
    ensurePluginManifest('default', '默认工作区')
    copyDefaultSkills('default')

    index.workspaces.push(defaultWs)
    writeIndex(index)

    console.log('[Agent 工作区] 已创建默认工作区')
  } else {
    // 迁移兼容：确保已有默认工作区包含 plugin manifest
    ensurePluginManifest(defaultWs.slug, defaultWs.name)
  }

  return defaultWs
}

// ===== 默认 Skills 自动升级 =====

/**
 * 同步默认 Skills 到所有工作区。规则：
 * - 缺失：按默认启用状态注入到 skills/ 或 skills-inactive/
 * - 已存在（active 或 inactive）：比较 SKILL.md 的 version，bundled 更新时才覆盖
 *   （保留用户停用决定 — 在 inactive 的依然在 inactive；同时避免每次启动
 *    全量 cpSync 4MB+ 文件阻塞主进程）
 */
export function upgradeDefaultSkillsInWorkspaces(): void {
  const defaultDir = getDefaultSkillsDir()

  interface DefaultSkillInfo {
    version: string
    sourcePath: string
  }
  const defaultSkills = new Map<string, DefaultSkillInfo>()

  try {
    const entries = readdirSync(defaultDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const sourcePath = join(defaultDir, entry.name)
      defaultSkills.set(entry.name, {
        version: parseSkillVersion(sourcePath),
        sourcePath,
      })
    }
  } catch {
    return
  }

  if (defaultSkills.size === 0) return

  const index = readIndex()

  for (const workspace of index.workspaces) {
    const activeDir = getWorkspaceSkillsDir(workspace.slug)
    const inactiveDir = getInactiveSkillsDir(workspace.slug)

    removeDeletedDefaultSkillsFromWorkspace(workspace.slug, activeDir, inactiveDir)

    for (const [slug, info] of defaultSkills) {
      const activePath = join(activeDir, slug)
      const inactivePath = join(inactiveDir, slug)

      if (existsSync(activePath)) {
        const currentVer = parseSkillVersion(activePath)
        if (compareSemver(info.version, currentVer) > 0) {
          if (safeReplaceSkillDir(info.sourcePath, activePath)) {
            console.log(
              `[Agent 工作区] 已升级默认 Skill: ${workspace.slug}/${slug} (active, ${currentVer} → ${info.version})`,
            )
          } else {
            console.warn(
              `[Agent 工作区] 升级默认 Skill 失败 (${workspace.slug}/${slug}, active)，跳过`,
            )
          }
        }
        continue
      }

      if (existsSync(inactivePath)) {
        const currentVer = parseSkillVersion(inactivePath)
        if (compareSemver(info.version, currentVer) > 0) {
          if (safeReplaceSkillDir(info.sourcePath, inactivePath)) {
            console.log(
              `[Agent 工作区] 已升级默认 Skill: ${workspace.slug}/${slug} (inactive, ${currentVer} → ${info.version})`,
            )
          } else {
            console.warn(
              `[Agent 工作区] 升级默认 Skill 失败 (${workspace.slug}/${slug}, inactive)，跳过`,
            )
          }
        }
        continue
      }

      try {
        const enabledByDefault = getDefaultSkillInitialEnabled(slug)
        const targetDir = enabledByDefault ? activeDir : inactiveDir
        const targetPath = enabledByDefault ? activePath : inactivePath
        if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true })
        cpSync(info.sourcePath, targetPath, { recursive: true, filter: skillCopyFilter })
        console.log(`[Agent 工作区] 已注入新默认 Skill: ${workspace.slug}/${slug} → ${enabledByDefault ? 'active' : 'inactive'}`)
      } catch (err) {
        console.warn(`[Agent 工作区] 注入默认 Skill 失败 (${workspace.slug}/${slug}):`, err)
      }
    }
  }
}

function removeDeletedDefaultSkillsFromWorkspace(workspaceSlug: string, activeDir: string, inactiveDir: string): void {
  for (const slug of REMOVED_DEFAULT_SKILL_SLUGS) {
    for (const [state, dir] of [['active', activeDir], ['inactive', inactiveDir]] as const) {
      const target = join(dir, slug)
      if (!existsSync(target)) continue

      try {
        rmSync(target, { recursive: true, force: true })
        console.log(`[Agent 工作区] 已移除废弃默认 Skill: ${workspaceSlug}/${slug} (${state})`)
      } catch (err) {
        console.warn(`[Agent 工作区] 移除废弃默认 Skill 失败 (${workspaceSlug}/${slug}, ${state})，跳过:`, err)
      }
    }
  }
}

/**
 * 安全替换一个 skill 目录：先 rmSync 再 cpSync，每步独立 try/catch。
 *
 * 直接 cpSync({ force: true }) 在目标存在只读文件（如 .git/objects/ 下的 0444
 * 文件）时会因 EACCES 失败；rmSync({ force: true }) 不依赖目标文件的写权限，
 * 仅需父目录可写即可 unlink。这种"先删后拷"也修正了 cpSync 的合并语义——
 * bundle 已删除的文件能从用户目录中真正消失。
 *
 * @returns 成功返回 true；任何步骤失败返回 false（已记录日志，不抛出）
 */
function safeReplaceSkillDir(sourcePath: string, targetPath: string): boolean {
  try {
    rmSync(targetPath, { recursive: true, force: true })
    cpSync(sourcePath, targetPath, { recursive: true, filter: skillCopyFilter })
    return true
  } catch (err) {
    console.warn(`[Agent 工作区] safeReplaceSkillDir 失败 (${targetPath}):`, err)
    return false
  }
}

/** 防御性目录基名集合：复制 skill 时永远跳过这些目录，避免 .git 0444 文件、
 *  node_modules 文件爆炸等场景把启动期同步链路炸掉。 */
const SKILL_COPY_BLOCKLIST = new Set([
  '.git',
  '.DS_Store',
  'node_modules',
  'dist',
  '.next',
  '.cache',
  '.turbo',
  '__pycache__',
])

export function skillCopyFilter(src: string): boolean {
  return !SKILL_COPY_BLOCKLIST.has(basename(src))
}

/** 比较两个 semver 版本字符串，返回值 >0 表示 a 更新 */
function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

// ===== Plugin Manifest（SDK 插件发现） =====

/** 确保工作区包含 .claude-plugin/plugin.json，SDK 需要此文件发现 skills */
export function ensurePluginManifest(workspaceSlug: string, workspaceName: string): void {
  const wsPath = getAgentWorkspacePath(workspaceSlug)
  const pluginDir = join(wsPath, '.claude-plugin')
  const manifestPath = join(pluginDir, 'plugin.json')

  if (existsSync(manifestPath)) return

  if (!existsSync(pluginDir)) {
    mkdirSync(pluginDir, { recursive: true })
  }

  const manifest = {
    name: `proma-workspace-${workspaceSlug}`,
    version: '1.0.0',
  }

  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8')
  console.log(`[Agent 工作区] 已创建 plugin manifest: ${workspaceSlug}`)
}

// ===== MCP 配置管理 =====

export function getWorkspaceMcpConfig(workspaceSlug: string): WorkspaceMcpConfig {
  const mcpPath = getWorkspaceMcpPath(workspaceSlug)

  if (!existsSync(mcpPath)) {
    return { servers: {} }
  }

  try {
    const raw = readFileSync(mcpPath, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<WorkspaceMcpConfig>
    return { servers: parsed.servers ?? {} }
  } catch (error) {
    console.error('[Agent 工作区] 读取 MCP 配置失败:', error)
    return { servers: {} }
  }
}

export function saveWorkspaceMcpConfig(workspaceSlug: string, config: WorkspaceMcpConfig): void {
  const mcpPath = getWorkspaceMcpPath(workspaceSlug)

  try {
    writeFileSync(mcpPath, JSON.stringify(config, null, 2), 'utf-8')
    console.log(`[Agent 工作区] 已保存 MCP 配置: ${workspaceSlug}`)
  } catch (error) {
    console.error('[Agent 工作区] 保存 MCP 配置失败:', error)
    throw new Error('保存 MCP 配置失败')
  }
}

// ===== 连接器（Connector）管理 =====

/**
 * 读取工作区连接器总配置文件
 */
export function getWorkspaceConnectorsConfig(workspaceSlug: string): ConnectorsConfig {
  const configPath = getConnectorsConfigPath(workspaceSlug)

  if (!existsSync(configPath)) {
    return { version: '1.0', connectors: {} }
  }

  try {
    const raw = readFileSync(configPath, 'utf-8')
    return JSON.parse(raw) as ConnectorsConfig
  } catch (error) {
    console.error('[Agent 工作区] 读取连接器配置失败:', error)
    return { version: '1.0', connectors: {} }
  }
}

/**
 * 保存工作区连接器总配置文件
 */
export function saveWorkspaceConnectorsConfig(workspaceSlug: string, config: ConnectorsConfig): void {
  const configPath = getConnectorsConfigPath(workspaceSlug)

  try {
    if (!existsSync(getConnectorsDir(workspaceSlug))) {
      mkdirSync(getConnectorsDir(workspaceSlug), { recursive: true })
    }
    writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
    console.log(`[Agent 工作区] 已保存连接器配置: ${workspaceSlug}`)
  } catch (error) {
    console.error('[Agent 工作区] 保存连接器配置失败:', error)
    throw new Error('保存连接器配置失败')
  }
}

/**
 * 注册用户创建的连接器
 *
 * 同时完成：
 * 1. 创建 connectors/{name}/ 目录
 * 2. 写入 connector.json 元数据
 * 3. 写入 mcp.json 中的 MCP 配置
 * 4. 注册到 connectors.json
 */
export function registerUserConnector(
  workspaceSlug: string,
  name: string,
  entry: McpServerEntry,
  displayName?: string,
): void {
  const safeName = assertValidSlug(name)
  const connectorsDir = getConnectorsDir(workspaceSlug)
  const connectorDir = join(connectorsDir, safeName)

  // 1. 创建 connectors/{name}/ 目录
  if (!existsSync(connectorDir)) {
    mkdirSync(connectorDir, { recursive: true })
  }

  // 2. 写入 connector.json 元数据（仅新建时，编辑不覆盖已有文件）
  const connectorJsonPath = join(connectorDir, 'connector.json')
  if (!existsSync(connectorJsonPath)) {
    const connectorJson: Record<string, unknown> = {
      type: 'mcp',
      source: 'user',
      displayName: displayName || name,
      category: '用户自定义',
      status: 'available',
      serverName: name,
    }
    writeFileSync(connectorJsonPath, JSON.stringify(connectorJson, null, 2), 'utf-8')
  }

  // 3. 写入 mcp.json
  const mcpConfig = getWorkspaceMcpConfig(workspaceSlug)
  mcpConfig.servers[name] = entry
  saveWorkspaceMcpConfig(workspaceSlug, mcpConfig)

  // 4. 注册到 connectors.json
  const config = getWorkspaceConnectorsConfig(workspaceSlug)
  config.connectors[name] = {
    type: 'mcp',
    enabled: entry.enabled ?? false,
    source: 'user',
    displayName: displayName || name,
    category: '用户自定义',
    status: 'available',
    serverName: name,
  }
  saveWorkspaceConnectorsConfig(workspaceSlug, config)

  console.log(`[Agent 工作区] 已注册用户连接器: ${name} (workspace: ${workspaceSlug})`)
}

/**
 * 一次性迁移：旧 mcp.json → 新 connectors/ 结构
 *
 * 如果 connectors.json 已存在则跳过（已迁移）。
 * 迁移后旧 mcp.json 重命名为 mcp.json.bak。
 */
export function migrateMcpJsonToConnectors(workspaceSlug: string): void {
  const configPath = getConnectorsConfigPath(workspaceSlug)

  // 已迁移则跳过
  if (existsSync(configPath)) return

  const mcpPath = getWorkspaceMcpPath(workspaceSlug)

  // 旧 mcp.json 不存在则跳过
  if (!existsSync(mcpPath)) return

  try {
    const oldConfig = JSON.parse(readFileSync(mcpPath, 'utf-8')) as WorkspaceMcpConfig
    const connectors: Record<string, ConnectorEntry> = {}

    for (const [name, entry] of Object.entries(oldConfig.servers ?? {})) {
      const safeName = assertValidSlug(name)
      if (safeName === 'memos-cloud') continue // 系统保留
      if (!entry.command && !entry.url) continue // 无有效配置跳过

      const mcpDir = join(getConnectorsDir(workspaceSlug), safeName)
      if (!existsSync(mcpDir)) {
        mkdirSync(mcpDir, { recursive: true })
      }

      // 写入子目录 mcp.json（不含 enabled 字段，启用状态统一由 connectors.json 管理）
      const serverConfig: Record<string, unknown> = {
        type: entry.type,
      }
      if (entry.command) serverConfig.command = entry.command
      if (entry.args && entry.args.length > 0) serverConfig.args = entry.args
      if (entry.env && Object.keys(entry.env).length > 0) serverConfig.env = entry.env
      if (entry.url) serverConfig.url = entry.url
      if (entry.headers && Object.keys(entry.headers).length > 0) serverConfig.headers = entry.headers
      if (entry.timeout) serverConfig.timeout = entry.timeout

      writeFileSync(join(mcpDir, 'mcp.json'), JSON.stringify(serverConfig, null, 2), 'utf-8')

      connectors[name] = {
        type: 'mcp',
        enabled: entry.enabled ?? false,
        source: 'user',
        displayName: name,
      }
    }

    saveWorkspaceConnectorsConfig(workspaceSlug, { version: '1.0', connectors })
    renameSync(mcpPath, mcpPath + '.bak')
    console.log(`[Agent 工作区] 已迁移 mcp.json → connectors/ (${workspaceSlug})`)
  } catch (error) {
    console.error('[Agent 工作区] 迁移 MCP 配置失败:', error)
  }
}

/**
 * 同步预置连接器到当前工作区
 *
 * 时机：用户打开/切换工作区时调用。
 * 1. 将 default-connectors/ 复制到工作区 connectors/（缺失的）
 * 2. 更新 connectors.json（添加新预置连接器，默认 disabled）
 */
export function syncDefaultConnectorsToWorkspace(workspaceSlug: string): void {
  const defaultDir = getDefaultConnectorsDir()
  const workspaceConnectorsDir = getConnectorsDir(workspaceSlug)

  // 1. 复制预置连接器文件
  try {
    if (!existsSync(defaultDir)) return

    const entries = readdirSync(defaultDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const source = join(defaultDir, entry.name)
      const target = join(workspaceConnectorsDir, entry.name)

      if (!existsSync(target)) {
        // 防御性复制：跳过 .git / node_modules 等
        const blocklist = new Set(['.git', 'node_modules', '__pycache__', '.DS_Store'])
        cpSync(source, target, {
          recursive: true,
          filter: (src) => !blocklist.has(basename(src)),
        })
        console.log(`[Agent 工作区] 已同步预置连接器: ${entry.name}`)
      } else {
        // 目录已存在，覆盖 connector.json 保持与源一致
        const srcMeta = join(source, 'connector.json')
        const dstMeta = join(target, 'connector.json')
        if (existsSync(srcMeta)) {
          copyFileSync(srcMeta, dstMeta)
        }
      }
    }
  } catch (err) {
    console.warn('[Agent 工作区] 同步预置连接器文件失败:', err)
  }

  // 2. 更新 connectors.json
  const config = getWorkspaceConnectorsConfig(workspaceSlug)
  const presetConnectors = getDefaultConnectorEntries()
  let changed = false
  for (const [name, entry] of Object.entries(presetConnectors)) {
    const existing = config.connectors[name]
    if (existing) {
      // 已存在：补齐元数据字段（保留用户的 enabled 状态）
      const preservedEnabled = existing.enabled
      // 只更新非状态字段，不覆盖 enabled
      existing.type = entry.type
      if (entry.displayName) existing.displayName = entry.displayName
      if (entry.description) existing.description = entry.description
      if (entry.category) existing.category = entry.category
      if (entry.status) existing.status = entry.status
      if (entry.serverName) existing.serverName = entry.serverName
      if (entry.version) existing.version = entry.version
      existing.enabled = preservedEnabled
      changed = true
      continue
    }
    config.connectors[name] = entry
    changed = true
    console.log(`[Agent 工作区] 添加预置连接器: ${name}`)
  }

  if (changed) {
    saveWorkspaceConnectorsConfig(workspaceSlug, config)
  }
}

/**
 * 启动时将预置连接器同步到所有已有工作区。
 *
 * 只同步不存在 connectors/ 目录的工作区（新建工作区已在 createAgentWorkspace 中同步）。
 */
export function syncDefaultConnectorsToAllWorkspaces(): void {
  const index = readIndex()
  for (const workspace of index.workspaces) {
    try {
      const connectorsDir = getConnectorsDir(workspace.slug)
      // 如果 connectors 目录不存在或为空，执行初始同步
      if (!existsSync(connectorsDir)) {
        syncDefaultConnectorsToWorkspace(workspace.slug)
        console.log(`[Agent 工作区] 为已有工作区同步预置连接器: ${workspace.slug}`)
      }
    } catch (err) {
      console.warn(`[Agent 工作区] 同步预置连接器到 ${workspace.slug} 失败:`, err)
    }
  }
}

/**
 * 读取所有预置连接器的默认条目
 *
 * 从 default-connectors/{name}/connector.json 读取元数据，
 * 转换为 connectors.json 的 ConnectorEntry 格式。
 * 新增的预置连接器默认 enabled: false。
 */
function getDefaultConnectorEntries(): Record<string, ConnectorEntry> {
  const defaultDir = getDefaultConnectorsDir()
  const entries: Record<string, ConnectorEntry> = {}

  let dirEntries: { name: string }[] = []
  try {
    dirEntries = readdirSync(defaultDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
  } catch {
    return entries
  }

  for (const dirEnt of dirEntries) {
    const connectorJsonPath = join(defaultDir, dirEnt.name, 'connector.json')
    if (!existsSync(connectorJsonPath)) continue

    try {
      const raw = JSON.parse(readFileSync(connectorJsonPath, 'utf-8'))

      const entry: ConnectorEntry = {
        type: raw.type ?? 'mcp',
        enabled: false,
        source: 'preset',
      }
      if (raw.displayName) entry.displayName = raw.displayName
      if (raw.description) entry.description = raw.description
      if (raw.category) entry.category = raw.category
      if (raw.status) entry.status = raw.status
      if (raw.serverName) entry.serverName = raw.serverName
      if (raw.version) entry.version = raw.version
      // skillDirs / disabledTools 不写入 connectors.json，
      // 由运行时从 connectors/{name}/connector.json 读取

      // 以 connector.json 中的 serverName 为连接器 ID（兜底用目录名）
      const connectorId = (raw.serverName as string | undefined) || dirEnt.name
      entries[connectorId] = entry
    } catch (err) {
      console.warn(`[Agent 工作区] 读取预置连接器元数据失败 (${dirEnt.name}):`, err)
    }
  }

  return entries
}

// ===== Skill 目录扫描 =====

/**
 * 从工作区 connectors/{name}/connector.json 读取 skillDirs
 *
 * 与 connectors.json 职责分离：connectors.json 只管状态（enabled/type/source），
 * skillDirs 属于连接器自身配置，存在子目录 connector.json 中。
 *
 * @returns skillDirs 数组，文件不存在或读取失败返回 null
 */
export function readSkillDirsFromConnectorJson(connectorsDir: string, name: string): string[] | null {
  const safeName = assertValidSlug(name)
  const metaPath = join(connectorsDir, safeName, 'connector.json')
  if (!existsSync(metaPath)) return null

  try {
    const raw = JSON.parse(readFileSync(metaPath, 'utf-8'))
    if (Array.isArray(raw.skillDirs) && raw.skillDirs.length > 0) {
      return raw.skillDirs
    }
    return null
  } catch {
    return null
  }
}

/**
 * 从工作区 connectors/{name}/connector.json 读取 disabledTools
 *
 * 与 connectors.json 职责分离：connectors.json 只管状态（enabled/type/source），
 * disabledTools 属于 MCP 连接器自身配置，存在子目录 connector.json 中。
 *
 * @returns disabledTools 数组，文件不存在或读取失败返回 null
 */
export function readDisabledToolsFromConnectorJson(connectorsDir: string, name: string): string[] | null {
  const safeName = assertValidSlug(name)
  const metaPath = join(connectorsDir, safeName, 'connector.json')
  if (!existsSync(metaPath)) return null

  try {
    const raw = JSON.parse(readFileSync(metaPath, 'utf-8'))
    if (Array.isArray(raw.disabledTools) && raw.disabledTools.length > 0) {
      return raw.disabledTools
    }
    return null
  } catch {
    return null
  }
}

/** 扫描工作区活跃 Skills，仅返回 skills/ 下的 Skill */
export function getWorkspaceSkills(workspaceSlug: string): SkillMeta[] {
  return scanSkillsInDir(getWorkspaceSkillsDir(workspaceSlug), true)
}

/** 解析 SKILL.md 的 YAML frontmatter，支持单行值、block scalar（`|` / `>`）和多行缩进 */
function parseSkillFrontmatter(content: string, slug: string, enabled: boolean): SkillMeta {
  const meta: SkillMeta = { slug, name: slug, enabled, sourceKind: 'workspace' }

  const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/)
  if (!fmMatch) return meta

  const yaml = fmMatch[1]
  if (!yaml) return meta

  const validKeys = new Set(['name', 'description', 'group', 'icon', 'version'])
  const entries: Record<string, string> = {}
  let currentKey = ''
  let isFolded = false

  for (const line of yaml.split('\n')) {
    const indented = /^\s/.test(line)

    if (!indented) {
      const colonIdx = line.indexOf(':')
      if (colonIdx === -1) { currentKey = ''; continue }

      const key = line.slice(0, colonIdx).trim()
      const raw = line.slice(colonIdx + 1).trim()

      if (!validKeys.has(key)) { currentKey = ''; isFolded = false; continue }

      if (raw === '|' || raw === '>') {
        currentKey = key
        isFolded = raw === '>'
        entries[key] = ''
        continue
      }

      currentKey = key
      isFolded = false
      entries[key] = raw.replace(/^["']|["']$/g, '')
    } else if (currentKey) {
      const text = line.trim()
      if (!text) { if (entries[currentKey]) entries[currentKey] += '\n'; continue }
      const sep = isFolded ? ' ' : '\n'
      entries[currentKey] = entries[currentKey] ? entries[currentKey] + sep + text : text
    }
  }

  if (entries.name) meta.name = entries.name.trim()
  if (entries.description) meta.description = entries.description.trim()
  if (entries.group) meta.group = entries.group.trim()
  if (entries.icon) meta.icon = entries.icon.trim()
  if (entries.version) meta.version = entries.version.trim()

  return meta
}

function withSkillInstalledAt(meta: SkillMeta, skillDir: string): SkillMeta {
  try {
    const stats = statSync(skillDir)
    const timestamp = stats.birthtimeMs > 0 ? stats.birthtimeMs : stats.mtimeMs
    return { ...meta, installedAt: new Date(timestamp).toISOString() }
  } catch {
    return meta
  }
}

// ===== 工作区能力摘要 =====

function pluginSkillMeta(capability: AgentPluginInfo['capabilities'][number]): SkillMeta {
  return {
    slug: capability.name,
    name: capability.name,
    ...(capability.description && { description: capability.description }),
    enabled: capability.enabled,
    sourceKind: 'plugin',
    sourcePluginId: capability.sourcePluginId,
    sourcePluginName: capability.sourceLabel,
  }
}

function skillSourcePriority(skill: SkillMeta): number {
  if (skill.sourceKind === 'plugin') return 2
  return 1
}

function shouldReplaceSkill(current: SkillMeta, next: SkillMeta): boolean {
  if (!current.enabled && next.enabled) return true
  if (current.enabled !== next.enabled) return false
  return skillSourcePriority(next) > skillSourcePriority(current)
}

function mergeSkillsBySlug(skills: SkillMeta[]): SkillMeta[] {
  const result = new Map<string, SkillMeta>()
  for (const skill of skills) {
    if (!result.has(skill.slug)) {
      result.set(skill.slug, skill)
      continue
    }
    const current = result.get(skill.slug)
    if (current && shouldReplaceSkill(current, skill)) {
      result.set(skill.slug, skill)
    }
  }
  return Array.from(result.values()).sort((a, b) => a.slug.localeCompare(b.slug))
}

export function getWorkspaceCapabilitiesFromSources(input: {
  workspaceSlug: string
  mcpConfig: WorkspaceMcpConfig
  workspaceSkills: SkillMeta[]
  plugins: AgentPluginInfo[]
}): WorkspaceCapabilities {
  const pluginSkills = input.plugins
    .filter((plugin) => plugin.enabled && isGeneralPlugin(plugin) && plugin.issues.every((issue) => issue.level !== 'error'))
    .flatMap((plugin) => plugin.capabilities.filter((capability) => capability.type === 'skill' && capability.enabled).map(pluginSkillMeta))
  const skills = mergeSkillsBySlug([...input.workspaceSkills, ...pluginSkills])

  const mcpServers = Object.entries(input.mcpConfig.servers ?? {}).map(([name, entry]) => ({
    name,
    enabled: entry.enabled,
    type: entry.type,
  }))

  return { mcpServers, skills }
}

export function getWorkspaceCapabilities(workspaceSlug: string): WorkspaceCapabilities {
  const mcpConfig = getWorkspaceMcpConfig(workspaceSlug)
  return getWorkspaceCapabilitiesFromSources({
    workspaceSlug,
    mcpConfig,
    workspaceSkills: getWorkspaceSkills(workspaceSlug),
    plugins: listInstalledPlugins(),
  })
}

interface DeleteWorkspaceSkillOptions {
  activeDir?: string
  inactiveDir?: string
}

export function deleteWorkspaceSkill(workspaceSlug: string, skillSlug: string, options: DeleteWorkspaceSkillOptions = {}): void {
  const normalizedSkillSlug = assertValidSlug(skillSlug)
  const activeDir = options.activeDir ?? getWorkspaceSkillsDir(workspaceSlug)
  const inactiveDir = options.inactiveDir ?? getInactiveSkillsDir(workspaceSlug)
  const activePath = join(activeDir, normalizedSkillSlug)
  const inactivePath = join(inactiveDir, normalizedSkillSlug)
  const activeExists = existsSync(activePath)
  const inactiveExists = existsSync(inactivePath)

  if (!activeExists && !inactiveExists) {
    throw new Error(`Skill 不存在: ${normalizedSkillSlug}`)
  }

  if (activeExists) {
    rmSync(activePath, { recursive: true, force: true })
  }
  if (inactiveExists) {
    rmSync(inactivePath, { recursive: true, force: true })
  }
  console.log(`[Agent 工作区] 已删除 Skill: ${workspaceSlug}/${normalizedSkillSlug}`)
}

/** 扫描指定目录下的 Skills，供 getWorkspaceSkills 和 getAllWorkspaceSkills 复用 */
function scanSkillsInDir(dir: string, enabled: boolean): SkillMeta[] {
  const skills: SkillMeta[] = []

  try {
    const entries = readdirSync(dir, { withFileTypes: true })

    for (const entry of entries) {
      const isDir = entry.isDirectory() || (entry.isSymbolicLink() && statSync(join(dir, entry.name)).isDirectory())
      if (!isDir) continue

      const skillMdPath = join(dir, entry.name, 'SKILL.md')
      if (!existsSync(skillMdPath)) continue

      try {
        const skillDir = join(dir, entry.name)
        const content = readFileSync(skillMdPath, 'utf-8')
        const meta = withSkillInstalledAt(parseSkillFrontmatter(content, entry.name, enabled), skillDir)

        // 如果是导入的 Skill，读取来源信息并检测更新
        const importSource = readSkillImportSource(skillDir)
        if (importSource) {
          meta.importSource = importSource
          meta.sourceKind = 'import'
          const sourceSkillDir = resolveSkillDir(importSource.sourceWorkspaceSlug, entry.name)
          if (sourceSkillDir) {
            const currentSourceVersion = parseSkillVersion(sourceSkillDir)
            meta.hasUpdate = isNewerVersion(currentSourceVersion, importSource.sourceVersion)
          }
        }

        skills.push(meta)
      } catch {
        console.warn(`[Agent 工作区] 解析 Skill 失败: ${entry.name}`)
      }
    }
  } catch {
    // 目录可能不存在
  }

  return skills
}

/** 获取默认 Skills 的 slug 列表（来自 ~/.proma/default-skills/） */
export function getDefaultSkillSlugs(): string[] {
  const dir = getDefaultSkillsDir()
  if (!existsSync(dir)) return []

  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  } catch {
    return []
  }
}

/** 获取工作区所有 Skills（含活跃和不活跃），用于设置页 UI */
export function getAllWorkspaceSkills(workspaceSlug: string, options: WorkspaceSkillDirs = {}): SkillMeta[] {
  const activeSkills = scanSkillsInDir(options.activeDir ?? getWorkspaceSkillsDir(workspaceSlug), true)
  const inactiveSkills = scanSkillsInDir(options.inactiveDir ?? getInactiveSkillsDir(workspaceSlug), false)
  return [...activeSkills, ...inactiveSkills]
}

export function installSkillZipToWorkspace(
  workspaceSlug: string,
  zipPath: string,
  options: InstallSkillZipOptions = {},
): SkillMeta {
  if (!zipPath.toLowerCase().endsWith('.zip')) {
    throw new Error('请选择 .zip 格式的 Skill 包')
  }
  if (!existsSync(zipPath)) {
    throw new Error(`Skill zip 包不存在: ${zipPath}`)
  }

  const activeDir = options.activeDir ?? getWorkspaceSkillsDir(workspaceSlug)
  const inactiveDir = options.inactiveDir ?? getInactiveSkillsDir(workspaceSlug)
  const tempRoot = options.tempRoot ?? tmpdir()
  mkdirSync(activeDir, { recursive: true })
  mkdirSync(inactiveDir, { recursive: true })
  mkdirSync(tempRoot, { recursive: true })

  const extractDir = join(tempRoot, `proma-skill-${randomUUID()}`)

  try {
    mkdirSync(extractDir, { recursive: true })
    extractSkillZipSafely(zipPath, extractDir)

    const skillRoot = resolveExtractedSkillRoot(extractDir, zipPath)
    const slug = assertValidSlug(skillRoot.slug)
    const targetPath = join(activeDir, slug)
    const inactivePath = join(inactiveDir, slug)

    if (!isPathInside(activeDir, targetPath) || !isPathInside(inactiveDir, inactivePath)) {
      throw new Error('Skill 名称包含不安全路径')
    }
    if (existsSync(targetPath) || existsSync(inactivePath)) {
      throw new Error(`当前工作区已存在同名 Skill: ${slug}`)
    }

    cpSync(skillRoot.path, targetPath, { recursive: true })
    const content = readFileSync(join(targetPath, 'SKILL.md'), 'utf-8')
    console.log(`[Agent 工作区] 已安装上传 Skill: ${workspaceSlug}/${slug}`)
    return withSkillInstalledAt(parseSkillFrontmatter(content, slug, true), targetPath)
  } finally {
    rmSync(extractDir, { recursive: true, force: true })
  }
}

function extractSkillZipSafely(zipPath: string, extractDir: string): void {
  const zip = new AdmZip(zipPath)

  for (const entry of zip.getEntries()) {
    const entryName = entry.entryName
    const targetPath = resolve(extractDir, entryName)

    if (!entryName || entryName.startsWith('/') || !isPathInside(extractDir, targetPath)) {
      throw new Error('Skill zip 包包含不安全路径')
    }

    if (entry.isDirectory) {
      mkdirSync(targetPath, { recursive: true })
      continue
    }

    mkdirSync(dirname(targetPath), { recursive: true })
    writeFileSync(targetPath, entry.getData())
  }
}

function resolveExtractedSkillRoot(extractDir: string, zipPath: string): { path: string; slug: string } {
  const rootSkillMdPath = join(extractDir, 'SKILL.md')
  if (existsSync(rootSkillMdPath)) {
    return { path: extractDir, slug: basename(zipPath).replace(/\.zip$/i, '') }
  }

  const skillDirs = readdirSync(extractDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => existsSync(join(extractDir, entry.name, 'SKILL.md')))

  if (skillDirs.length === 1) {
    const skillDir = skillDirs[0]!
    return { path: join(extractDir, skillDir.name), slug: skillDir.name }
  }

  throw new Error('Skill zip 包必须在根目录或唯一顶层目录中包含 SKILL.md')
}

function assertValidSlug(slug: string): string {
  const trimmed = slug.trim()
  if (!trimmed || trimmed === '.' || trimmed === '..' || trimmed.includes('/') || trimmed.includes('\\')) {
    throw new Error(`非法名称: ${slug}`)
  }
  return trimmed
}

function isPathInside(parentDir: string, targetPath: string): boolean {
  const rel = relative(resolve(parentDir), resolve(targetPath))
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

/** 在 skills/ 和 skills-inactive/ 之间移动来切换启用/禁用 */
export function toggleWorkspaceSkill(workspaceSlug: string, skillSlug: string, enabled: boolean): void {
  const activeDir = getWorkspaceSkillsDir(workspaceSlug)
  const inactiveDir = getInactiveSkillsDir(workspaceSlug)

  const srcDir = enabled ? inactiveDir : activeDir
  const destDir = enabled ? activeDir : inactiveDir

  const srcPath = join(srcDir, skillSlug)
  const destPath = join(destDir, skillSlug)

  if (!existsSync(srcPath)) {
    throw new Error(`Skill 不存在: ${skillSlug}`)
  }

  if (existsSync(destPath)) {
    throw new Error(`目标目录已存在同名 Skill: ${skillSlug}`)
  }

  renameSync(srcPath, destPath)
  console.log(`[Agent 工作区] Skill ${enabled ? '启用' : '禁用'}: ${workspaceSlug}/${skillSlug}`)
}

/**
 * 获取其他工作区的 Skill 列表，按工作区分组返回。
 */
export function getOtherWorkspaceSkills(currentSlug: string): OtherWorkspaceSkillsGroup[] {
  const workspaces = listAgentWorkspaces()
  const result: OtherWorkspaceSkillsGroup[] = []

  for (const workspace of workspaces) {
    if (workspace.slug === currentSlug) continue

    const skills = getAllWorkspaceSkills(workspace.slug)
    if (skills.length === 0) continue

    result.push({
      workspaceName: workspace.name,
      workspaceSlug: workspace.slug,
      skills,
    })
  }

  return result
}

/**
 * 从其他工作区导入 Skill 到当前工作区。
 *
 * 复制目录并记录来源元数据（.source.json），支持后续版本检测和同步更新。
 */
export function importSkillFromWorkspace(
  targetSlug: string,
  sourceSlug: string,
  skillSlug: string,
): SkillMeta {
  const sourcePath = resolveSkillDir(sourceSlug, skillSlug)

  if (!sourcePath) {
    throw new Error(`源工作区中不存在 Skill: ${skillSlug}`)
  }

  // P0 修复：复制前校验源 SKILL.md 存在，避免产生孤立目录
  const sourceSkillMdPath = join(sourcePath, 'SKILL.md')
  if (!existsSync(sourceSkillMdPath)) {
    throw new Error(`源 Skill 缺少 SKILL.md: ${skillSlug}`)
  }

  const targetPath = join(getWorkspaceSkillsDir(targetSlug), skillSlug)
  const targetInactivePath = join(getInactiveSkillsDir(targetSlug), skillSlug)

  if (existsSync(targetPath) || existsSync(targetInactivePath)) {
    throw new Error(`当前工作区已存在同名 Skill: ${skillSlug}`)
  }

  cpSync(sourcePath, targetPath, { recursive: true })

  // 写入来源元数据
  const sourceWorkspace = listAgentWorkspaces().find((w) => w.slug === sourceSlug)
  const importSource: SkillImportSource = {
    sourceWorkspaceSlug: sourceSlug,
    sourceWorkspaceName: sourceWorkspace?.name ?? sourceSlug,
    importedAt: new Date().toISOString(),
    sourceVersion: parseSkillVersion(sourcePath),
  }
  writeSkillImportSource(targetPath, importSource)

  console.log(`[Agent 工作区] 已从 ${sourceSlug} 导入 Skill: ${targetSlug}/${skillSlug}`)

  const content = readFileSync(join(targetPath, 'SKILL.md'), 'utf-8')
  const meta = withSkillInstalledAt(parseSkillFrontmatter(content, skillSlug, true), targetPath)
  meta.importSource = importSource
  meta.sourceKind = 'import'
  return meta
}

/**
 * 从源工作区同步更新已导入的 Skill（覆盖更新）。
 *
 * - 源不存在：抛出错误，不修改目标
 * - 本地已禁用（skills-inactive）：在 inactive 目录中原地更新，保留 enabled 状态
 */
export function updateSkillFromSource(
  targetSlug: string,
  skillSlug: string,
): SkillMeta {
  const activeDir = getWorkspaceSkillsDir(targetSlug)
  const inactiveDir = getInactiveSkillsDir(targetSlug)

  const targetPath = existsSync(join(activeDir, skillSlug))
    ? join(activeDir, skillSlug)
    : existsSync(join(inactiveDir, skillSlug))
      ? join(inactiveDir, skillSlug)
      : null

  if (!targetPath) {
    throw new Error(`当前工作区中不存在 Skill: ${skillSlug}`)
  }

  const existingSource = readSkillImportSource(targetPath)
  if (!existingSource) {
    throw new Error(`Skill ${skillSlug} 不是从其他工作区导入的，无法从源更新`)
  }

  const sourcePath = resolveSkillDir(existingSource.sourceWorkspaceSlug, skillSlug)
  if (!sourcePath) {
    throw new Error(`源工作区中不再存在 Skill: ${skillSlug}（来源: ${existingSource.sourceWorkspaceName}）`)
  }

  if (!existsSync(join(sourcePath, 'SKILL.md'))) {
    throw new Error(`源 Skill 缺少 SKILL.md: ${skillSlug}`)
  }

  // 先复制到临时目录，成功后再替换旧目录，确保原子性
  const parentDir = join(targetPath, '..')
  const tmpPath = join(parentDir, `.${skillSlug}.updating`)
  try {
    cpSync(sourcePath, tmpPath, { recursive: true })
  } catch (err) {
    // 复制失败时清理临时目录，保留原目录不变
    if (existsSync(tmpPath)) rmSync(tmpPath, { recursive: true, force: true })
    throw err
  }
  rmSync(targetPath, { recursive: true, force: true })
  renameSync(tmpPath, targetPath)

  // 更新来源元数据（保留原始 importedAt）
  const sourceWorkspace = listAgentWorkspaces().find((w) => w.slug === existingSource.sourceWorkspaceSlug)
  const updatedSource: SkillImportSource = {
    sourceWorkspaceSlug: existingSource.sourceWorkspaceSlug,
    sourceWorkspaceName: sourceWorkspace?.name ?? existingSource.sourceWorkspaceName,
    importedAt: existingSource.importedAt,
    sourceVersion: parseSkillVersion(sourcePath),
  }
  writeSkillImportSource(targetPath, updatedSource)

  const enabled = targetPath === join(activeDir, skillSlug)
  const content = readFileSync(join(targetPath, 'SKILL.md'), 'utf-8')
  const meta = withSkillInstalledAt(parseSkillFrontmatter(content, skillSlug, enabled), targetPath)
  meta.importSource = updatedSource
  meta.sourceKind = 'import'
  meta.hasUpdate = false

  console.log(`[Agent 工作区] 已从源更新 Skill: ${targetSlug}/${skillSlug}`)
  return meta
}

// ===== Skill 来源追踪 helpers =====

const SOURCE_META_FILE = '.source.json'

function readSkillImportSource(skillDir: string): SkillImportSource | undefined {
  const p = join(skillDir, SOURCE_META_FILE)
  if (!existsSync(p)) return undefined
  try {
    return JSON.parse(readFileSync(p, 'utf-8')) as SkillImportSource
  } catch {
    return undefined
  }
}

function writeSkillImportSource(skillDir: string, source: SkillImportSource): void {
  writeFileSync(join(skillDir, SOURCE_META_FILE), JSON.stringify(source, null, 2), 'utf-8')
}

/** 解析 Skill 所在目录（active 或 inactive），不存在则返回 null */
function resolveSkillDir(workspaceSlug: string, skillSlug: string): string | null {
  const active = join(getWorkspaceSkillsDir(workspaceSlug), skillSlug)
  if (existsSync(active)) return active
  const inactive = join(getInactiveSkillsDir(workspaceSlug), skillSlug)
  if (existsSync(inactive)) return inactive
  return null
}

export function readWorkspaceSkillContent(workspaceSlug: string, skillSlug: string): string {
  const dir = resolveSkillDir(workspaceSlug, skillSlug)
  if (!dir) throw new Error(`Skill 不存在: ${workspaceSlug}/${skillSlug}`)
  const mdPath = join(dir, 'SKILL.md')
  if (!existsSync(mdPath)) throw new Error(`SKILL.md 不存在: ${mdPath}`)
  return readFileSync(mdPath, 'utf-8')
}

export function writeWorkspaceSkillContent(workspaceSlug: string, skillSlug: string, content: string): void {
  const dir = resolveSkillDir(workspaceSlug, skillSlug)
  if (!dir) throw new Error(`Skill 不存在: ${workspaceSlug}/${skillSlug}`)
  writeFileSync(join(dir, 'SKILL.md'), content, 'utf-8')
  console.log(`[Agent 工作区] 已更新 SKILL.md: ${workspaceSlug}/${skillSlug}`)
}

// ===== Skill 子文件管理 =====

/** 单个子文件大小上限（10 MB），超过则拒绝读入到编辑器 */
const SKILL_FILE_SIZE_LIMIT = 10 * 1024 * 1024
/** 文件树递归深度上限，防止异常深嵌套 */
const SKILL_TREE_MAX_DEPTH = 8

/** 把相对路径限制在 Skill 根目录内，并拒绝直接覆盖 SKILL.md */
function resolveSkillChildPath(skillDir: string, relativePath: string, opts: { allowSkillMd?: boolean } = {}): string {
  if (typeof relativePath !== 'string' || relativePath.length === 0) {
    throw new Error('相对路径不能为空')
  }
  if (isAbsolute(relativePath)) {
    throw new Error('禁止传入绝对路径')
  }
  const normalized = relativePath.replace(/\\/g, '/')
  const resolved = resolve(skillDir, normalized)
  const rel = relative(skillDir, resolved)
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error('非法路径：禁止访问 Skill 目录外')
  }
  // 用 lowercase 比较，避免 macOS/Windows 的大小写不敏感文件系统上 skill.md/Skill.MD 绕过保护
  if (!opts.allowSkillMd && rel.split(/[\\/]/).join('/').toLowerCase() === 'skill.md') {
    throw new Error('SKILL.md 由专用接口管理，请通过 readWorkspaceSkillContent / writeWorkspaceSkillContent')
  }
  return resolved
}

/** 用文件头判断是否为二进制文件（粗略：含 NUL 字节即视为二进制）。只读前 8KB，避免把大文件全量读入内存 */
function isLikelyBinaryFile(absPath: string, size: number): boolean {
  if (size === 0) return false
  let fd: number | undefined
  try {
    fd = openSync(absPath, 'r')
    const buf = Buffer.alloc(Math.min(size, 8192))
    const n = readSync(fd, buf, 0, buf.length, 0)
    return buf.subarray(0, n).includes(0)
  } catch {
    return true
  } finally {
    if (fd !== undefined) closeSync(fd)
  }
}

function buildSkillFileTree(rootDir: string, currentDir: string, depth: number): SkillFileNode[] {
  if (depth > SKILL_TREE_MAX_DEPTH) return []
  let entries: import('node:fs').Dirent[]
  try {
    entries = readdirSync(currentDir, { withFileTypes: true })
  } catch {
    return []
  }

  const nodes: SkillFileNode[] = []
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue // 跳过隐藏文件，如 .source.json
    const absPath = join(currentDir, entry.name)
    const rel = relative(rootDir, absPath).split(/[\\/]/).join('/')

    if (rel === 'SKILL.md') continue // SKILL.md 由主编辑器管理

    const isDir = entry.isDirectory()
    if (isDir) {
      nodes.push({
        relativePath: rel,
        name: entry.name,
        type: 'directory',
        children: buildSkillFileTree(rootDir, absPath, depth + 1),
      })
    } else if (entry.isFile()) {
      let size = 0
      try {
        size = statSync(absPath).size
      } catch {
        // ignore
      }
      nodes.push({
        relativePath: rel,
        name: entry.name,
        type: 'file',
        size,
        isText: !isLikelyBinaryFile(absPath, size),
      })
    }
  }

  // 目录优先 + 名称升序
  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  return nodes
}

export function listSkillFiles(workspaceSlug: string, skillSlug: string): SkillFileNode[] {
  const dir = resolveSkillDir(workspaceSlug, skillSlug)
  if (!dir) throw new Error(`Skill 不存在: ${workspaceSlug}/${skillSlug}`)
  return buildSkillFileTree(dir, dir, 0)
}

export function readSkillFile(workspaceSlug: string, skillSlug: string, relativePath: string): SkillFileContent {
  const dir = resolveSkillDir(workspaceSlug, skillSlug)
  if (!dir) throw new Error(`Skill 不存在: ${workspaceSlug}/${skillSlug}`)
  const abs = resolveSkillChildPath(dir, relativePath)
  if (!existsSync(abs)) throw new Error(`文件不存在: ${relativePath}`)

  const st = statSync(abs)
  if (!st.isFile()) throw new Error(`目标不是文件: ${relativePath}`)
  if (st.size > SKILL_FILE_SIZE_LIMIT) {
    throw new Error(`文件过大（${(st.size / 1024 / 1024).toFixed(2)} MB），超过 10 MB 限制`)
  }

  const binary = isLikelyBinaryFile(abs, st.size)
  return {
    relativePath: relative(dir, abs).split(/[\\/]/).join('/'),
    isText: !binary,
    size: st.size,
    content: binary ? undefined : readFileSync(abs, 'utf-8'),
  }
}

export function writeSkillFile(workspaceSlug: string, skillSlug: string, relativePath: string, content: string): void {
  const dir = resolveSkillDir(workspaceSlug, skillSlug)
  if (!dir) throw new Error(`Skill 不存在: ${workspaceSlug}/${skillSlug}`)
  const abs = resolveSkillChildPath(dir, relativePath)

  const byteLen = Buffer.byteLength(content, 'utf-8')
  if (byteLen > SKILL_FILE_SIZE_LIMIT) {
    throw new Error(`内容过大（${(byteLen / 1024 / 1024).toFixed(2)} MB），超过 10 MB 限制`)
  }

  if (existsSync(abs) && statSync(abs).isDirectory()) {
    throw new Error(`目标是目录，无法写入文件内容: ${relativePath}`)
  }

  // 自动创建父目录
  const parent = dirname(abs)
  if (!existsSync(parent)) {
    mkdirSync(parent, { recursive: true })
  }

  writeFileSync(abs, content, 'utf-8')
  console.log(`[Agent 工作区] 已更新 Skill 子文件: ${workspaceSlug}/${skillSlug}/${relativePath}`)
}

export function createSkillEntry(
  workspaceSlug: string,
  skillSlug: string,
  relativePath: string,
  type: 'file' | 'directory',
): void {
  const dir = resolveSkillDir(workspaceSlug, skillSlug)
  if (!dir) throw new Error(`Skill 不存在: ${workspaceSlug}/${skillSlug}`)
  const abs = resolveSkillChildPath(dir, relativePath)

  if (existsSync(abs)) {
    throw new Error(`目标已存在: ${relativePath}`)
  }

  if (type === 'directory') {
    mkdirSync(abs, { recursive: true })
  } else {
    const parent = dirname(abs)
    if (!existsSync(parent)) {
      mkdirSync(parent, { recursive: true })
    }
    writeFileSync(abs, '', 'utf-8')
  }
  console.log(`[Agent 工作区] 已创建 Skill 子${type === 'directory' ? '目录' : '文件'}: ${workspaceSlug}/${skillSlug}/${relativePath}`)
}

export function deleteSkillEntry(workspaceSlug: string, skillSlug: string, relativePath: string): void {
  const dir = resolveSkillDir(workspaceSlug, skillSlug)
  if (!dir) throw new Error(`Skill 不存在: ${workspaceSlug}/${skillSlug}`)
  const abs = resolveSkillChildPath(dir, relativePath)
  if (!existsSync(abs)) {
    throw new Error(`目标不存在: ${relativePath}`)
  }
  rmSync(abs, { recursive: true, force: true })
  console.log(`[Agent 工作区] 已删除 Skill 子项: ${workspaceSlug}/${skillSlug}/${relativePath}`)
}

export function renameSkillEntry(
  workspaceSlug: string,
  skillSlug: string,
  fromRelative: string,
  toRelative: string,
): void {
  const dir = resolveSkillDir(workspaceSlug, skillSlug)
  if (!dir) throw new Error(`Skill 不存在: ${workspaceSlug}/${skillSlug}`)
  const fromAbs = resolveSkillChildPath(dir, fromRelative)
  const toAbs = resolveSkillChildPath(dir, toRelative)
  if (!existsSync(fromAbs)) {
    throw new Error(`源不存在: ${fromRelative}`)
  }
  if (existsSync(toAbs)) {
    throw new Error(`目标已存在: ${toRelative}`)
  }
  const parent = dirname(toAbs)
  if (!existsSync(parent)) {
    mkdirSync(parent, { recursive: true })
  }
  renameSync(fromAbs, toAbs)
  console.log(`[Agent 工作区] Skill 子项重命名: ${workspaceSlug}/${skillSlug}: ${fromRelative} → ${toRelative}`)
}

/** 简单 semver 比较：a 是否比 b 更新 */
function isNewerVersion(a: string, b: string): boolean {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff > 0
  }
  return false
}

// ===== 工作区配置管理 =====

interface WorkspaceConfig {
  attachedDirectories?: string[]
  attachedFiles?: string[]
  worktreeRepos?: import('@proma/shared').WorkspaceWorktreeRepo[]
}

function getWorkspaceConfigPath(workspaceSlug: string): string {
  return join(getAgentWorkspacePath(workspaceSlug), 'config.json')
}

function readWorkspaceConfig(workspaceSlug: string): WorkspaceConfig {
  const configPath = getWorkspaceConfigPath(workspaceSlug)

  if (!existsSync(configPath)) {
    return {}
  }

  try {
    const raw = readFileSync(configPath, 'utf-8')
    const data = JSON.parse(raw) as Partial<WorkspaceConfig>
    return {
      attachedDirectories: Array.isArray(data.attachedDirectories)
        ? data.attachedDirectories.filter((dir): dir is string => typeof dir === 'string')
        : undefined,
      attachedFiles: Array.isArray(data.attachedFiles)
        ? data.attachedFiles.filter((file): file is string => typeof file === 'string')
        : undefined,
      worktreeRepos: Array.isArray(data.worktreeRepos)
        ? data.worktreeRepos.filter((r) => r && typeof r.name === 'string' && typeof r.repoPath === 'string' && typeof r.worktreesPath === 'string')
        : undefined,
    }
  } catch {
    return {}
  }
}

function writeWorkspaceConfig(workspaceSlug: string, config: WorkspaceConfig): void {
  const configPath = getWorkspaceConfigPath(workspaceSlug)
  writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
}

// ===== 工作区级附加目录管理 =====

export function getWorkspaceAttachedDirectories(workspaceSlug: string): string[] {
  const config = readWorkspaceConfig(workspaceSlug)
  return config.attachedDirectories ?? []
}

export function attachWorkspaceDirectory(workspaceSlug: string, directoryPath: string): string[] {
  const config = readWorkspaceConfig(workspaceSlug)
  const existing = config.attachedDirectories ?? []

  if (existing.includes(directoryPath)) {
    return existing
  }

  const updated = [...existing, directoryPath]
  writeWorkspaceConfig(workspaceSlug, { ...config, attachedDirectories: updated })
  console.log(`[Agent 工作区] 已附加工作区目录: ${directoryPath} → ${workspaceSlug}`)
  return updated
}

export function detachWorkspaceDirectory(workspaceSlug: string, directoryPath: string): string[] {
  const config = readWorkspaceConfig(workspaceSlug)
  const existing = config.attachedDirectories ?? []
  const updated = existing.filter((d) => d !== directoryPath)
  writeWorkspaceConfig(workspaceSlug, { ...config, attachedDirectories: updated })
  console.log(`[Agent 工作区] 已移除工作区目录: ${directoryPath} ← ${workspaceSlug}`)
  return updated
}

// ===== 工作区级附加文件管理 =====

export function getWorkspaceAttachedFiles(workspaceSlug: string): string[] {
  const config = readWorkspaceConfig(workspaceSlug)
  return config.attachedFiles ?? []
}

export function attachWorkspaceFile(workspaceSlug: string, filePath: string): string[] {
  const config = readWorkspaceConfig(workspaceSlug)
  const existing = config.attachedFiles ?? []

  if (existing.includes(filePath)) {
    return existing
  }

  const updated = [...existing, filePath]
  writeWorkspaceConfig(workspaceSlug, { ...config, attachedFiles: updated })
  console.log(`[Agent 工作区] 已附加工作区文件: ${filePath} → ${workspaceSlug}`)
  return updated
}

export function detachWorkspaceFile(workspaceSlug: string, filePath: string): string[] {
  const config = readWorkspaceConfig(workspaceSlug)
  const existing = config.attachedFiles ?? []
  const updated = existing.filter((f) => f !== filePath)
  writeWorkspaceConfig(workspaceSlug, { ...config, attachedFiles: updated })
  console.log(`[Agent 工作区] 已移除工作区文件: ${filePath} ← ${workspaceSlug}`)
  return updated
}

// ===== 工作区级 Worktree 仓库管理 =====

export function getWorktreeRepos(workspaceSlug: string): import('@proma/shared').WorkspaceWorktreeRepo[] {
  const config = readWorkspaceConfig(workspaceSlug)
  const repos = config.worktreeRepos ?? []
  return repos.sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99))
}

export function addWorktreeRepo(workspaceSlug: string, repo: import('@proma/shared').WorkspaceWorktreeRepo): import('@proma/shared').WorkspaceWorktreeRepo[] {
  const config = readWorkspaceConfig(workspaceSlug)
  const existing = config.worktreeRepos ?? []

  if (existing.some((r) => r.repoPath === repo.repoPath)) {
    return existing
  }

  const updated = [...existing, repo]
  writeWorkspaceConfig(workspaceSlug, { ...config, worktreeRepos: updated })
  console.log(`[Agent 工作区] 已添加 worktree 仓库: ${repo.name} (${repo.repoPath}) → ${workspaceSlug}`)
  return updated
}

export function removeWorktreeRepo(workspaceSlug: string, repoPath: string): import('@proma/shared').WorkspaceWorktreeRepo[] {
  const config = readWorkspaceConfig(workspaceSlug)
  const existing = config.worktreeRepos ?? []
  const updated = existing.filter((r) => r.repoPath !== repoPath)
  writeWorkspaceConfig(workspaceSlug, { ...config, worktreeRepos: updated })
  console.log(`[Agent 工作区] 已移除 worktree 仓库: ${repoPath} ← ${workspaceSlug}`)
  return updated
}

/**
 * 清理所有工作区中不存在的附加目录和附加文件
 * @returns 清理的条目总数
 */
export function cleanupStaleWorkspaceAttachedPaths(): number {
  const workspaces = listAgentWorkspaces()
  let count = 0

  for (const ws of workspaces) {
    const config = readWorkspaceConfig(ws.slug)
    let changed = false

    if (config.attachedDirectories?.length) {
      const valid = config.attachedDirectories.filter((d) => existsSync(d))
      if (valid.length < config.attachedDirectories.length) {
        count += config.attachedDirectories.length - valid.length
        config.attachedDirectories = valid.length > 0 ? valid : undefined
        changed = true
      }
    }

    if (config.attachedFiles?.length) {
      const valid = config.attachedFiles.filter((f) => existsSync(f))
      if (valid.length < config.attachedFiles.length) {
        count += config.attachedFiles.length - valid.length
        config.attachedFiles = valid.length > 0 ? valid : undefined
        changed = true
      }
    }

    if (changed) {
      writeWorkspaceConfig(ws.slug, config)
    }
  }

  if (count > 0) {
    console.log(`[Agent 工作区] 清理了 ${count} 个不存在的附加路径`)
  }

  return count
}
