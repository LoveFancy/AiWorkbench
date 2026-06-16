import { existsSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import type {
  AgentDefinition,
  AgentExpertGroupInfo,
  AgentExpertGroupManifest,
  AgentExpertGroupStatus,
  AgentPluginIssueLevel,
  McpServerEntry,
} from '@proma/shared'
import { listInstalledPlugins } from './plugin-registry-service'
import { getDefaultSkillsDir } from './config-paths'

const SUPPORTED_BUILTIN_TOOLS = new Set(['web-search'])

interface ExpertGroupRegistryPaths {
  builtinDir?: string
  userDir?: string
  configPath?: string
  runtimeDir?: string
  defaultSkillsDir?: string
}

export interface ResolveExpertGroupRuntimeInput {
  expertGroupId?: string
  expertPluginId?: string
}

export interface ExpertGroupRuntime {
  group: AgentExpertGroupInfo
  mainPrompt: string
  agents: Record<string, AgentDefinition>
  pluginPaths: Array<{ type: 'local'; path: string }>
  mcpServers: Record<string, McpServerEntry>
  promptHints: string[]
  allowedTools?: string[]
  disallowedTools?: string[]
}

interface ExpertIssue {
  level: AgentPluginIssueLevel
  message: string
  status?: AgentExpertGroupStatus
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : []
}

function stringRecord(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined
  const entries = Object.entries(value)
    .filter((entry): entry is [string, string] => entry[0].trim().length > 0 && typeof entry[1] === 'string' && entry[1].trim().length > 0)
    .map(([key, label]) => [key.trim(), label.trim()] as const)
  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

function positiveInteger(value: unknown): number | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined
  const parsed = typeof value === 'number' ? value : Number.parseInt(value, 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}

function readJson(filePath: string): unknown {
  return JSON.parse(readFileSync(filePath, 'utf-8')) as unknown
}

function normalizeExpertManifest(raw: unknown, filePath: string, groupName: string): { manifest?: AgentExpertGroupManifest; issues: ExpertIssue[] } {
  if (!isRecord(raw)) {
    return { issues: [{ level: 'error', message: '专家团配置不是 JSON 对象' }] }
  }

  const issues: ExpertIssue[] = []
  const mainRole = isRecord(raw.mainRole) ? raw.mainRole : {}
  const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : basename(filePath, '.json')
  const name = groupName.trim()
  const mainRoleName = typeof mainRole.name === 'string' && mainRole.name.trim() ? mainRole.name.trim() : ''
  const mainRolePrompt = typeof mainRole.prompt === 'string' && mainRole.prompt.trim() ? mainRole.prompt.trim() : ''
  const subagentLabels = stringRecord(raw.subagentLabels)

  if (!name) issues.push({ level: 'error', message: '专家团缺少插件名称' })
  if (!mainRoleName) issues.push({ level: 'error', message: '专家团缺少 mainRole.name' })
  if (!mainRolePrompt) issues.push({ level: 'error', message: '专家团缺少 mainRole.prompt' })

  if (issues.some((issue) => issue.level === 'error')) {
    return { issues }
  }

  return {
    manifest: {
      id,
      name,
      ...(typeof raw.description === 'string' && raw.description.trim() && { description: raw.description.trim() }),
      ...(typeof raw.introduction === 'string' && raw.introduction.trim() && { introduction: raw.introduction.trim() }),
      mainRole: {
        name: mainRoleName,
        prompt: mainRolePrompt,
      },
      subagents: stringArray(raw.subagents),
      ...(subagentLabels && { subagentLabels }),
      builtinTools: stringArray(raw.builtinTools),
      skills: stringArray(raw.skills),
      mcpServers: stringArray(raw.mcpServers),
      tags: stringArray(raw.tags),
      samplePrompts: stringArray(raw.samplePrompts),
      ...(isRecord(raw.toolsPolicy) && {
        toolsPolicy: {
          mode: raw.toolsPolicy.mode === 'restrict' ? 'restrict' : 'inherit',
          allowedTools: stringArray(raw.toolsPolicy.allowedTools),
          disallowedTools: stringArray(raw.toolsPolicy.disallowedTools),
        },
      }),
    },
    issues,
  }
}

function readExpertManifest(filePath: string, groupName: string): { manifest?: AgentExpertGroupManifest; issues: ExpertIssue[] } {
  try {
    return normalizeExpertManifest(readJson(filePath), filePath, groupName)
  } catch (error) {
    return {
      issues: [{ level: 'error', message: `解析专家团配置失败: ${error instanceof Error ? error.message : String(error)}` }],
    }
  }
}

function statusFor(enabled: boolean, issues: ExpertIssue[]): AgentExpertGroupStatus {
  if (!enabled) return 'plugin_disabled'
  const statusIssue = issues.find((issue) => issue.status)
  if (statusIssue?.status) return statusIssue.status
  if (issues.some((issue) => issue.level === 'error')) return 'invalid_manifest'
  return 'available'
}

function mcpServerNames(pluginPath: string): Set<string> {
  const mcpPath = join(pluginPath, '.mcp.json')
  if (!existsSync(mcpPath)) return new Set()

  try {
    const raw = readJson(mcpPath)
    const record = isRecord(raw) ? raw : {}
    const servers = isRecord(record.mcpServers) ? record.mcpServers : record
    return new Set(Object.keys(servers).filter((name) => isRecord(servers[name])))
  } catch {
    return new Set()
  }
}

function hasSkill(pluginPath: string, defaultSkillsDir: string, skillName: string): boolean {
  return existsSync(join(pluginPath, 'skills', skillName, 'SKILL.md')) ||
    existsSync(join(defaultSkillsDir, skillName, 'SKILL.md'))
}

function validateExpertReferences(pluginPath: string, manifest: AgentExpertGroupManifest, paths?: ExpertGroupRegistryPaths): ExpertIssue[] {
  const issues: ExpertIssue[] = []

  for (const agentName of manifest.subagents ?? []) {
    if (!existsSync(join(pluginPath, 'agents', `${agentName}.md`))) {
      issues.push({
        level: 'error',
        status: 'missing_subagent',
        message: `缺少 SubAgent: ${agentName}`,
      })
    }
  }

  const defaultSkillsDir = paths?.defaultSkillsDir ?? getDefaultSkillsDir()
  for (const toolName of manifest.builtinTools ?? []) {
    if (!SUPPORTED_BUILTIN_TOOLS.has(toolName)) {
      issues.push({
        level: 'warning',
        message: `未支持的内置工具: ${toolName}`,
      })
    }
  }

  for (const skillName of manifest.skills ?? []) {
    if (!hasSkill(pluginPath, defaultSkillsDir, skillName)) {
      issues.push({
        level: 'error',
        status: 'missing_skill',
        message: `缺少 Skill: ${skillName}`,
      })
    }
  }

  const mcpNames = manifest.mcpServers ?? []
  if (mcpNames.length > 0) {
    const existingMcpNames = mcpServerNames(pluginPath)
    for (const mcpName of mcpNames) {
      if (!existingMcpNames.has(mcpName)) {
        issues.push({
          level: 'warning',
          message: `未找到 MCP Server: ${mcpName}`,
        })
      }
    }
  }

  return issues
}

export function listAgentExpertGroups(paths?: ExpertGroupRegistryPaths): AgentExpertGroupInfo[] {
  const groups: AgentExpertGroupInfo[] = []
  for (const plugin of listInstalledPlugins(paths)) {
    const capabilities = plugin.capabilities.filter((capability) => capability.type === 'expert-group' && capability.relativePath)
    for (const capability of capabilities) {
      const filePath = join(plugin.path, capability.relativePath!)
      const { manifest, issues } = readExpertManifest(filePath, plugin.name)
      if (!manifest) {
        groups.push({
          id: capability.name,
          name: plugin.name,
          mainRole: { name: '', prompt: '' },
          expertType: capability.expertType,
          sourcePluginId: plugin.id,
          sourceLabel: plugin.name,
          sourcePluginVersion: plugin.version,
          sourcePluginKind: plugin.kind,
          sourcePluginPath: plugin.path,
          filePath,
          enabled: plugin.enabled,
          status: statusFor(plugin.enabled, issues),
          issues,
        })
        continue
      }

      const allIssues = [
        ...issues,
        ...validateExpertReferences(plugin.path, manifest, paths),
        ...(capability.issue ? [capability.issue] : []),
      ]
      groups.push({
        ...manifest,
        expertType: manifest.expertType ?? capability.expertType,
        sourcePluginId: plugin.id,
        sourceLabel: plugin.name,
        sourcePluginVersion: plugin.version,
        sourcePluginKind: plugin.kind,
        sourcePluginPath: plugin.path,
        filePath,
        enabled: plugin.enabled,
        status: statusFor(plugin.enabled, allIssues),
        issues: allIssues,
      })
    }
  }
  return groups.sort((a, b) => a.name.localeCompare(b.name))
}

export function getAgentExpertGroup(
  input: { expertGroupId: string; expertPluginId?: string },
  paths?: ExpertGroupRegistryPaths,
): AgentExpertGroupInfo | undefined {
  return listAgentExpertGroups(paths).find((group) => (
    group.id === input.expertGroupId &&
    (!input.expertPluginId || group.sourcePluginId === input.expertPluginId)
  ))
}

function parseFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!match) return { frontmatter: {}, body: content.trim() }
  const frontmatter: Record<string, unknown> = {}
  const lines = match[1]?.split('\n') ?? []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const keyValue = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (!keyValue) continue
    const key = keyValue[1]!
    const value = keyValue[2]!.trim()
    if (value) {
      frontmatter[key] = value.replace(/^['"]|['"]$/g, '')
      continue
    }
    const values: string[] = []
    let j = i + 1
    while (j < lines.length && /^\s*-\s+/.test(lines[j]!)) {
      values.push(lines[j]!.replace(/^\s*-\s+/, '').trim())
      j++
    }
    if (values.length > 0) {
      frontmatter[key] = values
      i = j - 1
    }
  }
  return { frontmatter, body: (match[2] ?? '').trim() }
}

function readAgentDefinition(pluginPath: string, agentName: string): AgentDefinition | null {
  const filePath = join(pluginPath, 'agents', `${agentName}.md`)
  if (!existsSync(filePath)) return null
  const { frontmatter, body } = parseFrontmatter(readFileSync(filePath, 'utf-8'))
  const description = typeof frontmatter.description === 'string' && frontmatter.description.trim()
    ? frontmatter.description.trim()
    : agentName
  const maxTurns = positiveInteger(frontmatter.maxTurns)
  return {
    description,
    prompt: body,
    tools: stringArray(frontmatter.tools),
    ...(maxTurns !== undefined && { maxTurns }),
  }
}

function readPluginMcp(pluginPath: string, names: string[]): Record<string, McpServerEntry> {
  const mcpPath = join(pluginPath, '.mcp.json')
  if (!existsSync(mcpPath) || names.length === 0) return {}
  try {
    const raw = readJson(mcpPath)
    const record = isRecord(raw) ? raw : {}
    const servers = isRecord(record.mcpServers) ? record.mcpServers : record
    const result: Record<string, McpServerEntry> = {}
    for (const name of names) {
      const entry = servers[name]
      if (!isRecord(entry)) continue
      const type = entry.type === 'stdio' || entry.type === 'http' || entry.type === 'sse' ? entry.type : undefined
      if (!type) continue
      result[name] = {
        type,
        ...(typeof entry.command === 'string' && { command: entry.command }),
        ...(Array.isArray(entry.args) && { args: entry.args.filter((item): item is string => typeof item === 'string') }),
        ...(typeof entry.url === 'string' && { url: entry.url }),
        ...(isRecord(entry.env) && { env: Object.fromEntries(Object.entries(entry.env).filter(([, value]) => typeof value === 'string')) as Record<string, string> }),
        enabled: true,
      }
    }
    return result
  } catch {
    return {}
  }
}

export function resolveExpertGroupRuntime(
  input: ResolveExpertGroupRuntimeInput,
  paths?: ExpertGroupRegistryPaths,
): ExpertGroupRuntime | null {
  if (!input.expertGroupId) return null
  const group = getAgentExpertGroup({
    expertGroupId: input.expertGroupId,
    expertPluginId: input.expertPluginId,
  }, paths)
  if (!group || group.status !== 'available') return null

  const agents: Record<string, AgentDefinition> = {}
  for (const agentName of group.subagents ?? []) {
    const definition = readAgentDefinition(group.sourcePluginPath, agentName)
    if (definition) agents[agentName] = definition
  }

  const tags = group.tags?.length ? group.tags.join('、') : group.name
  return {
    group,
    mainPrompt: group.mainRole.prompt,
    agents,
    pluginPaths: [{ type: 'local', path: group.sourcePluginPath }],
    mcpServers: readPluginMcp(group.sourcePluginPath, group.mcpServers ?? []),
    promptHints: [`当任务需要 ${tags} 时，优先考虑使用${group.name}。`],
    ...(group.toolsPolicy?.mode === 'restrict' && { allowedTools: group.toolsPolicy.allowedTools ?? [] }),
    ...(group.toolsPolicy?.disallowedTools?.length && { disallowedTools: group.toolsPolicy.disallowedTools }),
  }
}
