/**
 * 配置路径工具
 *
 * 管理 WorkMate 应用的本地配置文件路径。
 * 新用户配置默认存储在本地数据目录：
 * - Windows 正式版：D:\.workmate\（减少 C 盘占用）
 * - 其他系统/开发模式：~/.workmate/ 或 ~/.workmate-dev/
 * 已存在 ~/.proma/ 的老用户继续使用原目录，不自动迁移或重命名。
 */

import { join, basename } from 'node:path'
import { mkdirSync, existsSync, cpSync, rmSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolveConfigDir } from './config-root-service'
import type { ConfigRootServiceOptions } from './config-root-service'

/**
 * 获取配置目录名称
 *
 * 开发模式下优先返回 '.workmate-dev'，正式版本优先返回 '.workmate'。
 * 如果 WorkMate 新目录不存在但 Proma 旧目录存在，则继续返回旧目录。
 *
 * 检测优先级：
 * 1. PROMA_DEV=1 环境变量（显式覆盖）
 * 2. Electron app.isPackaged（未打包 = 开发模式）
 * 3. 兜底 '.workmate'
 */
let _configDirName: string | undefined

const REMOVED_DEFAULT_SKILL_SLUGS = ['proma-coach'] as const

export function resolveDefaultConfigDirName(homeDir: string, preferredName: string, legacyName: string): string {
  const preferredDir = join(homeDir, preferredName)
  const legacyDir = join(homeDir, legacyName)
  if (existsSync(preferredDir)) return preferredName
  if (existsSync(legacyDir)) return legacyName
  return preferredName
}

export function resolveDefaultConfigBaseDir(
  homeDir: string,
  configDirName: string,
  platform: NodeJS.Platform = process.platform,
  windowsDefaultBaseDir = 'D:\\',
  windowsDefaultBaseExists = existsSync(windowsDefaultBaseDir),
): string {
  if (platform !== 'win32') return homeDir
  if (configDirName !== '.workmate') return homeDir
  if (existsSync(join(homeDir, '.workmate'))) return homeDir
  if (existsSync(join(homeDir, '.proma'))) return homeDir
  return windowsDefaultBaseExists ? windowsDefaultBaseDir : homeDir
}

export function getConfigDirName(): string {
  if (_configDirName === undefined) {
    const homeDir = homedir()
    if (process.env.PROMA_DEV === '1') {
      _configDirName = resolveDefaultConfigDirName(homeDir, '.workmate-dev', '.proma-dev')
    } else {
      try {
        const { app } = require('electron')
        _configDirName = app.isPackaged
          ? resolveDefaultConfigDirName(homeDir, '.workmate', '.proma')
          : resolveDefaultConfigDirName(homeDir, '.workmate-dev', '.proma-dev')
      } catch {
        _configDirName = resolveDefaultConfigDirName(homeDir, '.workmate', '.proma')
      }
    }
    const mode = _configDirName.endsWith('-dev') ? '开发模式' : '正式版本'
    console.log(`[配置] 配置目录: ~/${_configDirName}/（${mode}）`)
  }
  return _configDirName
}

export function clearConfigDirNameForTest(): void {
  _configDirName = undefined
}

export function getConfigRootOptions(): ConfigRootServiceOptions {
  const homeDir = homedir()
  const configDirName = getConfigDirName()
  return {
    homeDir,
    configDirName,
    defaultBaseDir: resolveDefaultConfigBaseDir(homeDir, configDirName),
    platform: process.platform,
  }
}

/**
 * 获取配置目录路径
 *
 * 新用户开发模式返回 ~/.workmate-dev/，正式版本在 Windows 返回 D:\.workmate/，
 * 其他系统返回 ~/.workmate/。
 * 老用户已有 ~/.proma-dev/ 或 ~/.proma/ 时继续返回旧目录。
 * 如果目录不存在则自动创建。
 */
export function getConfigDir(): string {
  const configDir = resolveConfigDir(getConfigRootOptions())

  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true })
    console.log(`[配置] 已创建配置目录: ${configDir}`)
  }

  return configDir
}

/**
 * 获取当前应用数据目录路径，但不创建目录。
 */
export function getConfigDirPath(): string {
  return resolveConfigDir(getConfigRootOptions())
}

/**
 * 获取渠道配置文件路径
 *
 * @returns ~/.workmate/channels.json
 */
export function getChannelsPath(): string {
  return join(getConfigDir(), 'channels.json')
}

/**
 * 获取对话索引文件路径
 *
 * @returns ~/.workmate/conversations.json
 */
export function getConversationsIndexPath(): string {
  return join(getConfigDir(), 'conversations.json')
}

/**
 * 获取对话消息目录路径
 *
 * 如果目录不存在则自动创建。
 *
 * @returns ~/.workmate/conversations/
 */
export function getConversationsDir(): string {
  const dir = join(getConfigDir(), 'conversations')

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
    console.log(`[配置] 已创建对话目录: ${dir}`)
  }

  return dir
}

/**
 * 获取指定对话的消息文件路径
 *
 * @param id 对话 ID
 * @returns ~/.workmate/conversations/{id}.jsonl
 */
export function getConversationMessagesPath(id: string): string {
  return join(getConversationsDir(), `${id}.jsonl`)
}

/**
 * 获取附件存储根目录
 *
 * 如果目录不存在则自动创建。
 *
 * @returns ~/.workmate/attachments/
 */
export function getAttachmentsDir(): string {
  const dir = join(getConfigDir(), 'attachments')

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
    console.log(`[配置] 已创建附件目录: ${dir}`)
  }

  return dir
}

/**
 * 获取指定对话的附件目录
 *
 * 如果目录不存在则自动创建。
 *
 * @param conversationId 对话 ID
 * @returns ~/.workmate/attachments/{conversationId}/
 */
export function getConversationAttachmentsDir(conversationId: string): string {
  const dir = join(getAttachmentsDir(), conversationId)

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  return dir
}

/**
 * 解析附件相对路径为完整路径
 *
 * @param localPath 相对路径 {conversationId}/{uuid}.ext
 * @returns 完整路径 ~/.workmate/attachments/{conversationId}/{uuid}.ext
 */
export function resolveAttachmentPath(localPath: string): string {
  return join(getAttachmentsDir(), localPath)
}

/**
 * 获取应用设置文件路径
 *
 * @returns ~/.workmate/settings.json
 */
export function getSettingsPath(): string {
  return join(getConfigDir(), 'settings.json')
}

/**
 * 获取用户档案文件路径
 *
 * @returns ~/.workmate/user-profile.json
 */
export function getUserProfilePath(): string {
  return join(getConfigDir(), 'user-profile.json')
}

/**
 * 获取代理配置文件路径
 *
 * @returns ~/.workmate/proxy-settings.json
 */
export function getProxySettingsPath(): string {
  return join(getConfigDir(), 'proxy-settings.json')
}

/**
 * 获取本地 API 服务配置文件路径
 *
 * @returns ~/.workmate/local-api-settings.json
 */
export function getLocalApiSettingsPath(): string {
  return join(getConfigDir(), 'local-api-settings.json')
}

/**
 * 获取系统提示词配置文件路径
 *
 * @returns ~/.workmate/system-prompts.json
 */
export function getSystemPromptsPath(): string {
  return join(getConfigDir(), 'system-prompts.json')
}

/**
 * 获取记忆配置文件路径
 *
 * @returns ~/.workmate/memory.json
 */
export function getMemoryConfigPath(): string {
  return join(getConfigDir(), 'memory.json')
}

/**
 * 获取 Chat 工具配置文件路径
 *
 * @returns ~/.workmate/chat-tools.json
 */
export function getChatToolsConfigPath(): string {
  return join(getConfigDir(), 'chat-tools.json')
}

/**
 * 获取 Agent 会话索引文件路径
 *
 * @returns ~/.workmate/agent-sessions.json
 */
export function getAgentSessionsIndexPath(): string {
  return join(getConfigDir(), 'agent-sessions.json')
}

/**
 * 获取 Agent 会话消息目录路径
 *
 * 如果目录不存在则自动创建。
 *
 * @returns ~/.workmate/agent-sessions/
 */
export function getAgentSessionsDir(): string {
  const dir = join(getConfigDir(), 'agent-sessions')

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
    console.log(`[配置] 已创建 Agent 会话目录: ${dir}`)
  }

  return dir
}

/**
 * 获取指定 Agent 会话的消息文件路径
 *
 * @param id 会话 ID
 * @returns ~/.workmate/agent-sessions/{id}.jsonl
 */
export function getAgentSessionMessagesPath(id: string): string {
  return join(getAgentSessionsDir(), `${id}.jsonl`)
}

/**
 * 获取 Agent 工作区索引文件路径
 *
 * @returns ~/.workmate/agent-workspaces.json
 */
export function getAgentWorkspacesIndexPath(): string {
  return join(getConfigDir(), 'agent-workspaces.json')
}

/**
 * 获取 Agent 工作区根目录路径
 *
 * 如果目录不存在则自动创建。
 *
 * @returns ~/.workmate/agent-workspaces/
 */
export function getAgentWorkspacesDir(): string {
  const dir = join(getConfigDir(), 'agent-workspaces')

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
    console.log(`[配置] 已创建 Agent 工作区目录: ${dir}`)
  }

  return dir
}

/**
 * 获取指定 Agent 工作区的目录路径
 *
 * 如果目录不存在则自动创建。
 *
 * @param slug 工作区 slug
 * @returns ~/.workmate/agent-workspaces/{slug}/
 */
export function getAgentWorkspacePath(slug: string): string {
  const dir = join(getAgentWorkspacesDir(), slug)

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
    console.log(`[配置] 已创建 Agent 工作区: ${dir}`)
  }

  return dir
}

/**
 * 获取指定工作区的 MCP 配置文件路径
 *
 * @param slug 工作区 slug
 * @returns ~/.workmate/agent-workspaces/{slug}/mcp.json
 */
export function getWorkspaceMcpPath(slug: string): string {
  return join(getAgentWorkspacePath(slug), 'mcp.json')
}

/**
 * 获取指定工作区的 Skills 目录路径
 *
 * 如果目录不存在则自动创建。
 *
 * @param slug 工作区 slug
 * @returns ~/.workmate/agent-workspaces/{slug}/skills/
 */
export function getWorkspaceSkillsDir(slug: string): string {
  const dir = join(getAgentWorkspacePath(slug), 'skills')

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  return dir
}

/**
 * 获取工作区文件目录路径
 *
 * 工作区内所有会话可访问的文件存放于此。
 * 如果目录不存在则自动创建。
 *
 * @param slug 工作区 slug
 * @returns ~/.workmate/agent-workspaces/{slug}/workspace-files/
 */
export function getWorkspaceFilesDir(slug: string): string {
  const dir = join(getAgentWorkspacePath(slug), 'workspace-files')

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  return dir
}

/**
 * 解析工作区文件目录路径（只读，不创建目录）
 *
 * 与 getWorkspaceFilesDir 的区别：不会触发 mkdir 副作用，
 * 适用于 /now 等只读查询场景。
 *
 * @param slug 工作区 slug
 * @returns ~/.workmate/agent-workspaces/{slug}/workspace-files/
 */
export function resolveWorkspaceFilesDir(slug: string): string {
  return join(getConfigDir(), 'agent-workspaces', slug, 'workspace-files')
}

/**
 * 解析 Agent 会话工作目录路径（只读，不创建目录）
 *
 * 与 getAgentSessionWorkspacePath 的区别：不会触发 mkdir 副作用，
 * 适用于 /now 等只读查询场景。
 *
 * @param slug 工作区 slug
 * @param sessionId 会话 ID
 * @returns ~/.workmate/agent-workspaces/{slug}/{sessionId}/
 */
export function resolveAgentSessionWorkspacePath(slug: string, sessionId: string): string {
  return join(getConfigDir(), 'agent-workspaces', slug, sessionId)
}

/**
 * 获取工作区不活跃 Skills 目录路径
 *
 * 禁用的 Skill 会被移动到此目录，Agent SDK 不会扫描该目录。
 * 如果目录不存在则自动创建。
 *
 * @param slug 工作区 slug
 * @returns ~/.workmate/agent-workspaces/{slug}/skills-inactive/
 */
export function getInactiveSkillsDir(slug: string): string {
  const dir = join(getAgentWorkspacePath(slug), 'skills-inactive')

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  return dir
}

/**
 * 获取默认 Skills 模板目录路径
 *
 * 新建工作区时自动复制此目录的内容到工作区 skills/ 下。
 *
 * @returns ~/.workmate/default-skills/
 */
export function getDefaultSkillsDir(): string {
  const dir = join(getConfigDir(), 'default-skills')

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  return dir
}

/**
 * 获取默认插件模板目录路径
 *
 * 新建环境时自动复制此目录的内容到本地插件目录下。
 *
 * @returns ~/.workmate/default-plugins/
 */
export function getDefaultPluginsDir(): string {
  const dir = join(getConfigDir(), 'default-plugins')

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  return dir
}

/**
 * 获取用户插件目录路径
 *
 * 用户从插件市场安装的完整 Plugin 存放在此目录。
 *
 * @returns ~/.workmate/user-plugins/
 */
export function getUserPluginsDir(): string {
  const dir = join(getConfigDir(), 'user-plugins')

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  return dir
}

/**
 * 获取插件市场缓存目录路径
 *
 * @returns ~/.workmate/plugin-marketplace-cache/
 */
export function getPluginMarketplaceCacheDir(): string {
  const dir = join(getConfigDir(), 'plugin-marketplace-cache')

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  return dir
}

/**
 * 获取插件运行时缓存目录路径
 *
 * 用于生成带用户 MCP env overlay 的 local plugin 副本，避免修改原插件目录。
 *
 * @returns ~/.workmate/plugin-runtime-cache/
 */
export function getPluginRuntimeCacheDir(): string {
  const dir = join(getConfigDir(), 'plugin-runtime-cache')

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  return dir
}

/**
 * 获取插件启用状态配置文件路径
 *
 * @returns ~/.workmate/plugins.json
 */
export function getPluginsConfigPath(): string {
  return join(getConfigDir(), 'plugins.json')
}

/**
 * 获取插件市场配置文件路径
 *
 * @returns ~/.workmate/plugin-marketplaces.json
 */
export function getPluginMarketplacesPath(): string {
  return join(getConfigDir(), 'plugin-marketplaces.json')
}

/**
 * 获取专家团服务端列表缓存路径
 *
 * @returns ~/.workmate/expert-groups-cache.json
 */
export function getExpertGroupsCachePath(): string {
  return join(getConfigDir(), 'expert-groups-cache.json')
}

/**
 * 获取精选场景缓存路径
 *
 * @returns ~/.workmate/featured-scenes-cache.json
 */
export function getFeaturedScenesCachePath(): string {
  return join(getConfigDir(), 'featured-scenes-cache.json')
}

/**
 * 获取专家团分类列表缓存路径
 *
 * @returns ~/.workmate/expert-group-categories-cache.json
 */
export function getExpertGroupCategoriesCachePath(): string {
  return join(getConfigDir(), 'expert-group-categories-cache.json')
}

/**
 * 从 SKILL.md 的 YAML frontmatter 中解析 version 字段
 *
 * 无 version 字段时返回 '0.0.0'（确保旧 Skill 会被更新）。
 */
export function parseSkillVersion(skillDir: string): string {
  const skillMdPath = join(skillDir, 'SKILL.md')
  if (!existsSync(skillMdPath)) return '0.0.0'

  try {
    const content = readFileSync(skillMdPath, 'utf-8')
    const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/)
    if (!fmMatch?.[1]) return '0.0.0'

    for (const line of fmMatch[1].split('\n')) {
      const colonIdx = line.indexOf(':')
      if (colonIdx === -1) continue
      const key = line.slice(0, colonIdx).trim()
      const value = line.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, '')
      if (key === 'version' && value) return value
    }
  } catch {
    // 解析失败视为最低版本
  }

  return '0.0.0'
}

/**
 * 从插件 .claude-plugin/plugin.json 中解析 version 字段。
 *
 * 无 version 字段时返回 '0.0.0'。
 */
export function parsePluginVersion(pluginDir: string): string {
  const manifestPath = join(pluginDir, '.claude-plugin', 'plugin.json')
  if (!existsSync(manifestPath)) return '0.0.0'

  try {
    const raw = JSON.parse(readFileSync(manifestPath, 'utf-8')) as { version?: unknown }
    return typeof raw.version === 'string' && raw.version.trim() ? raw.version.trim() : '0.0.0'
  } catch {
    return '0.0.0'
  }
}

/** 比较两个 semver 版本字符串
 *
 * @returns 正数表示 a > b，0 表示相等，负数表示 a < b
 */
function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

/** 防御性目录基名集合：复制 default skills 时永远跳过这些目录，避免
 *  .git 0444 文件、node_modules 文件爆炸等场景把启动期同步链路炸掉。 */
const DEFAULT_SKILL_COPY_BLOCKLIST = new Set([
  '.git',
  '.DS_Store',
  'node_modules',
  'dist',
  '.next',
  '.cache',
  '.turbo',
  '__pycache__',
])

function defaultSkillCopyFilter(src: string): boolean {
  return !DEFAULT_SKILL_COPY_BLOCKLIST.has(basename(src))
}

/**
 * 从 app bundle 同步默认 Skills 到 ~/.workmate/default-skills/
 *
 * 打包模式下从 process.resourcesPath/default-skills 复制。
 * 开发模式下从源码 default-skills/ 目录复制。
 *
 * - 缺失的 Skill：直接复制
 * - 已存在的 Skill：比较 SKILL.md 中的 version，bundled 更新时才覆盖
 *   （避免每次启动同步 4MB+ 文件阻塞主进程）
 */
export function seedDefaultSkills(): void {
  const { app } = require('electron')
  const bundledDir = app.isPackaged
    ? join(process.resourcesPath, 'default-skills')
    : join(__dirname, '../default-skills')

  if (!existsSync(bundledDir)) {
    console.log('[配置] 未找到内置 default-skills 目录，跳过')
    return
  }

  const userDir = getDefaultSkillsDir()

  try {
    removeDeletedDefaultSkills(userDir)

    const entries = readdirSync(bundledDir, { withFileTypes: true })

    for (const entry of entries) {
      if (!entry.isDirectory()) continue

      const source = join(bundledDir, entry.name)
      const target = join(userDir, entry.name)

      try {
        if (!existsSync(target)) {
          cpSync(source, target, { recursive: true, filter: defaultSkillCopyFilter })
          console.log(`[配置] 已同步默认 Skill: ${entry.name}`)
          continue
        }

        const bundledVer = parseSkillVersion(source)
        const existingVer = parseSkillVersion(target)

        if (compareSemver(bundledVer, existingVer) > 0) {
          // rm-then-cp：rmSync 不依赖目标文件写权限（只读 .git/objects/ 等
          // 0444 文件用 cpSync({ force: true }) 无法覆盖会 EACCES，但
          // rmSync({ force: true }) 只需父目录可写就能 unlink）。
          rmSync(target, { recursive: true, force: true })
          cpSync(source, target, { recursive: true, filter: defaultSkillCopyFilter })
          console.log(`[配置] 已升级默认 Skill: ${entry.name} (${existingVer} → ${bundledVer})`)
        }
      } catch (err) {
        // 单 skill 失败不影响其他 skill 同步。这里吞错是为了防止启动期 bootstrap
        // 链路被任意一个 skill 的同步异常掀翻——窗口和托盘必须先出来。
        console.warn(`[配置] 同步默认 Skill 失败 (${entry.name})，跳过:`, err)
      }
    }
  } catch (err) {
    console.warn('[配置] 同步默认 Skills 失败:', err)
  }
}

function removeDeletedDefaultSkills(defaultSkillsDir: string): void {
  for (const slug of REMOVED_DEFAULT_SKILL_SLUGS) {
    const target = join(defaultSkillsDir, slug)
    if (!existsSync(target)) continue

    try {
      rmSync(target, { recursive: true, force: true })
      console.log(`[配置] 已移除废弃默认 Skill: ${slug}`)
    } catch (err) {
      console.warn(`[配置] 移除废弃默认 Skill 失败 (${slug})，跳过:`, err)
    }
  }
}

/**
 * 从 app bundle 同步默认插件到 ~/.workmate/default-plugins/
 *
 * 打包模式下从 process.resourcesPath/default-plugins 复制。
 * 开发模式下从源码 bundled-plugins/ 目录复制。
 */
export function seedDefaultPlugins(): void {
  const { app } = require('electron')
  const bundledDir = app.isPackaged
    ? join(process.resourcesPath, 'default-plugins')
    : join(__dirname, '../bundled-plugins')

  if (!existsSync(bundledDir)) {
    console.log('[配置] 未找到内置 default-plugins 目录，跳过')
    return
  }

  const userDir = getDefaultPluginsDir()

  syncDefaultPluginsFromDir(bundledDir, userDir)
}

/**
 * 将 bundled 插件同步到运行时默认插件目录。
 *
 * - 缺失：直接复制
 * - 已存在：仅当 bundled plugin.json version 更高时覆盖
 */
export function syncDefaultPluginsFromDir(bundledDir: string, userDir: string): void {
  if (!existsSync(bundledDir)) {
    console.log('[配置] 未找到内置 default-plugins 目录，跳过')
    return
  }

  try {
    const entries = readdirSync(bundledDir, { withFileTypes: true })

    for (const entry of entries) {
      if (!entry.isDirectory()) continue

      const source = join(bundledDir, entry.name)
      const target = join(userDir, entry.name)

      if (!existsSync(target)) {
        cpSync(source, target, { recursive: true })
        console.log(`[配置] 已同步默认插件: ${entry.name}`)
      } else {
        const bundledVer = parsePluginVersion(source)
        const existingVer = parsePluginVersion(target)
        if (compareSemver(bundledVer, existingVer) > 0) {
          rmSync(target, { recursive: true, force: true })
          cpSync(source, target, { recursive: true })
          console.log(`[配置] 已升级默认插件: ${entry.name} (${existingVer} → ${bundledVer})`)
        }
      }
    }
  } catch (err) {
    console.error('[配置] 同步默认插件失败:', err)
  }
}

/**
 * 获取微信配置文件路径
 *
 * @returns ~/.workmate/wechat.json
 */
export function getWeChatConfigPath(): string {
  return join(getConfigDir(), 'wechat.json')
}

/**
 * 获取微信长轮询同步游标路径
 *
 * @returns ~/.workmate/wechat-sync.json
 */
export function getWeChatSyncPath(): string {
  return join(getConfigDir(), 'wechat-sync.json')
}

/**
 * 获取钉钉配置文件路径
 *
 * @returns ~/.workmate/dingtalk.json
 */
export function getDingTalkConfigPath(): string {
  return join(getConfigDir(), 'dingtalk.json')
}

/**
 * 获取飞书配置文件路径
 *
 * @returns ~/.workmate/feishu.json
 */
export function getFeishuConfigPath(): string {
  return join(getConfigDir(), 'feishu.json')
}

/**
 * 获取飞书聊天绑定持久化路径
 *
 * @returns ~/.workmate/feishu-bindings.json
 */
export function getFeishuBindingsPath(): string {
  return join(getConfigDir(), 'feishu-bindings.json')
}

/**
 * 获取某个飞书 Bot 的聊天绑定持久化路径
 *
 * @returns ~/.workmate/feishu-bindings-{botId}.json
 */
export function getFeishuBotBindingsPath(botId: string): string {
  return join(getConfigDir(), `feishu-bindings-${botId}.json`)
}

/**
 * 获取某个飞书 Bot 的运行时元数据持久化路径
 *
 * 用于保存最近交互用户 open_id 等需要跨进程重启恢复的状态。
 *
 * @returns ~/.workmate/feishu-metadata-{botId}.json
 */
export function getFeishuBotMetadataPath(botId: string): string {
  return join(getConfigDir(), `feishu-metadata-${botId}.json`)
}

/**
 * 获取指定 Agent 会话的工作路径
 *
 * 在工作区目录下创建以 sessionId 命名的子文件夹，
 * 作为该会话的独立 Agent cwd。如果目录不存在则自动创建。
 *
 * @param workspaceSlug 工作区 slug
 * @param sessionId 会话 ID
 * @returns ~/.workmate/agent-workspaces/{slug}/{sessionId}/
 */
export function getAgentSessionWorkspacePath(workspaceSlug: string, sessionId: string): string {
  const dir = join(getAgentWorkspacePath(workspaceSlug), sessionId)

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
    console.log(`[配置] 已创建 Agent 会话工作目录: ${dir}`)
  }

  return dir
}

/**
 * 获取 SDK 隔离配置目录路径
 *
 * 用于设置 CLAUDE_CONFIG_DIR 环境变量，让 SDK 读取独立的配置文件，
 * 而不是用户的 ~/.claude.json，实现 Proma 与 Claude Code CLI 的配置隔离。
 *
 * 如果目录不存在则自动创建。
 *
 * @returns ~/.workmate/sdk-config/
 */
export function getSdkConfigDir(): string {
  const dir = join(getConfigDir(), 'sdk-config')

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
    console.log(`[配置] 已创建 SDK 配置目录: ${dir}`)
  }

  return dir
}

/**
 * 获取 Scratch Pad 文件路径
 *
 * @returns ~/.workmate/scratch-pad.md
 */
export function getScratchPadPath(): string {
  return join(getConfigDir(), 'scratch-pad.md')
}

/**
 * 获取定时任务（Automation）配置文件路径
 *
 * @returns ~/.proma/automations.json
 */
export function getAutomationsPath(): string {
  return join(getConfigDir(), 'automations.json')
}

// ===== 连接器（Connector）路径 =====

/**
 * 获取工作区连接器目录路径
 *
 * @param workspaceSlug 工作区 slug
 * @returns ~/.workmate/agent-workspaces/{slug}/connectors/
 */
export function getConnectorsDir(workspaceSlug: string): string {
  const dir = join(getAgentWorkspacePath(workspaceSlug), 'connectors')

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  return dir
}

/**
 * 获取工作区连接器总配置文件路径
 *
 * @param workspaceSlug 工作区 slug
 * @returns ~/.workmate/agent-workspaces/{slug}/connectors/connectors.json
 */
export function getConnectorsConfigPath(workspaceSlug: string): string {
  return join(getConnectorsDir(workspaceSlug), 'connectors.json')
}

/**
 * 获取默认连接器模板目录路径
 *
 * @returns ~/.workmate/default-connectors/
 */
export function getDefaultConnectorsDir(): string {
  const dir = join(getConfigDir(), 'default-connectors')

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  return dir
}

/**
 * 从连接器目录的 connector.json 中解析 version 字段
 *
 * 无 version 字段时返回 '0.0.0'（确保旧连接器会被更新）。
 */
function parseConnectorVersion(connectorDir: string): string {
  const metaPath = join(connectorDir, 'connector.json')
  if (!existsSync(metaPath)) return '0.0.0'

  try {
    const meta = JSON.parse(readFileSync(metaPath, 'utf-8'))
    return typeof meta.version === 'string' && meta.version.trim() ? meta.version.trim() : '0.0.0'
  } catch {
    return '0.0.0'
  }
}

/**
 * 从 app bundle 同步默认连接器到 ~/.workmate/default-connectors/
 *
 * 打包模式下从 process.resourcesPath/default-connectors 复制。
 * 开发模式下从源码 default-connectors/ 目录复制。
 */
export function seedDefaultConnectors(): void {
  const { app } = require('electron')
  const bundledDir = app.isPackaged
    ? join(process.resourcesPath, 'default-connectors')
    : join(__dirname, '../default-connectors')

  if (!existsSync(bundledDir)) {
    console.log('[配置] 未找到内置 default-connectors 目录，跳过')
    return
  }

  const userDir = getDefaultConnectorsDir()

  try {
    const entries = readdirSync(bundledDir, { withFileTypes: true })

    for (const entry of entries) {
      if (!entry.isDirectory()) continue

      const source = join(bundledDir, entry.name)
      const target = join(userDir, entry.name)

      try {
        if (!existsSync(target)) {
          cpSync(source, target, { recursive: true, filter: defaultSkillCopyFilter })
          console.log(`[配置] 已同步默认连接器: ${entry.name}`)
          continue
        }

        // 已存在则比较版本：bundled 更新时覆盖
        const bundledVer = parseConnectorVersion(source)
        const existingVer = parseConnectorVersion(target)
        if (compareSemver(bundledVer, existingVer) > 0) {
          rmSync(target, { recursive: true, force: true })
          cpSync(source, target, { recursive: true, filter: defaultSkillCopyFilter })
          console.log(`[配置] 已升级默认连接器: ${entry.name} (${existingVer} → ${bundledVer})`)
        }
      } catch (err) {
        console.warn(`[配置] 同步默认连接器失败 (${entry.name})，跳过:`, err)
      }
    }
  } catch (err) {
    console.warn('[配置] 同步默认连接器失败:', err)
  }
}
