/**
 * MCP 服务器配置构建 + SDK 内置工具注入
 *
 * 从工作区配置中读取 MCP 服务器列表，并注入平台内置工具：
 * - 记忆工具（memos-cloud）
 * - 生图工具（Nano Banana）
 * - 联网搜索工具（WebSearch）
 */

import { getWorkspaceMcpConfig, getWorkspaceConnectorsConfig, readDisabledToolsFromConnectorJson } from '../agent-workspace-manager'
import type { ConnectorsConfig, McpServerEntry } from '@proma/shared'
import { getMemoryConfig } from '../memory-service'
import { searchMemory, addMemory, formatSearchResult } from '../memos-client'
import { getConnectorsDir } from '../config-paths'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// ---- MCP 服务器 ----

/**
 * 构建工作区 MCP 服务器配置
 *
 * mcp.json 是运行时配置的唯一来源，connectors.json 只管理状态（enabled/type/source）。
 *
 * 加载流程：
 * 1. 构建 serverName → connectorId 映射（仅 enabled 的 MCP 连接器）
 * 2. 从 mcp.json 读取配置，通过映射过滤并重命名为 connectorId
 * 3. 向后兼容：未被 connectors.json 管理的 server 仍加载（如迁移前的旧配置）
 *
 * @param preReadConfig 可选，调用方已读好的配置，避免重复 I/O
 * @param selectedMcpServers 可选，只加载指定的 MCP server（undefined=全部, []=新建会话自动扫描, ['name']=指定）
 */
export function buildMcpServers(
  workspaceSlug: string | undefined,
  preReadConfig?: ConnectorsConfig,
  selectedMcpServers?: readonly string[],
): Record<string, Record<string, unknown>> {
  const mcpServers: Record<string, Record<string, unknown>> = {}
  if (!workspaceSlug) return mcpServers

  const connectorsConfig = preReadConfig ?? getWorkspaceConnectorsConfig(workspaceSlug)

  // selectedMcpServers:
  //   undefined → 加载全部 server
  //   []        → 新建会话，自动扫描 connectorsConfig 获取全部已启用的 MCP 连接器
  //   ['name']  → 只加载指定 server
  let selectedNames: Set<string> | null = null
  if (Array.isArray(selectedMcpServers)) {
    if (selectedMcpServers.length === 0) {
      // 新建会话：收集 connectorsConfig 中所有已启用的 MCP 连接器
      const autoNames: string[] = []
      for (const [connectorId, connector] of Object.entries(connectorsConfig.connectors)) {
        if (connector.enabled && connector.type === 'mcp') {
          autoNames.push(connector.serverName ?? connectorId)
        }
      }
      if (autoNames.length === 0) return mcpServers
      selectedNames = new Set(autoNames)
    } else {
      selectedNames = new Set(selectedMcpServers)
    }
  }

  const mcpConfig = getWorkspaceMcpConfig(workspaceSlug)

  // 构建映射：mcp server name → connector ID（仅 enabled 的 MCP 连接器）
  // 用于将 mcp.json 的 server 重命名为 connectorId（SDK 需要 connectorId 作为 server name）
  const serverNameToConnectorId = new Map<string, string>()
  for (const [connectorId, connector] of Object.entries(connectorsConfig.connectors)) {
    if (!connector.enabled) continue
    if (connector.type !== 'mcp') continue
    const serverName = connector.serverName ?? connectorId
    serverNameToConnectorId.set(serverName, connectorId)
  }

  const loadedServerNames = new Set<string>()

  // 加载被 connectors.json 管理的 server（状态过滤 + serverName → connectorId 重命名）
  for (const [serverName, entry] of Object.entries(mcpConfig.servers ?? {})) {
    if (selectedNames && !selectedNames.has(serverName)) continue
    if (!entry.enabled) continue
    if (serverName === 'memos-cloud') continue

    const connectorId = serverNameToConnectorId.get(serverName)
    if (!connectorId) continue

    registerMcpServer(connectorId, entry, mcpServers)
    loadedServerNames.add(serverName)
  }

  // 向后兼容：加载未被 connectors.json 管理的 server（如迁移前的旧用户配置）
  for (const [serverName, entry] of Object.entries(mcpConfig.servers ?? {})) {
    if (selectedNames && !selectedNames.has(serverName)) continue
    if (!entry.enabled) continue
    if (serverName === 'memos-cloud') continue
    if (loadedServerNames.has(serverName)) continue

    registerMcpServer(serverName, entry, mcpServers)
  }

  if (Object.keys(mcpServers).length > 0) {
    console.log(`[Agent 编排] 已加载 ${Object.keys(mcpServers).length} 个 MCP 服务器`)
  }

  return mcpServers
}

/**
 * 注册单个 MCP Server 到配置表
 */
function registerMcpServer(
  name: string,
  entry: McpServerEntry,
  mcpServers: Record<string, Record<string, unknown>>,
): void {
  if (typeof entry.type !== 'string') {
    console.warn(`[MCP Builder] 跳过非法连接器 ${name}: type 不是字符串`)
    return
  }
  if (entry.type === 'stdio') {
    if (typeof entry.command !== 'string' || !entry.command) {
      console.warn(`[MCP Builder] 跳过非法连接器 ${name}: stdio 缺少 command`)
      return
    }
    const mergedEnv: Record<string, string> = {
      ...(process.env.PATH && { PATH: process.env.PATH }),
      ...(entry.env && typeof entry.env === 'object' ? (entry.env as Record<string, string>) : {}),
    }
    mcpServers[name] = {
      type: 'stdio',
      command: entry.command,
      ...(Array.isArray(entry.args) && entry.args.length > 0 && { args: entry.args }),
      ...(Object.keys(mergedEnv).length > 0 && { env: mergedEnv }),
      required: false,
      startup_timeout_sec: typeof entry.timeout === 'number' ? entry.timeout : 30,
    }
  } else if (entry.type === 'http' || entry.type === 'sse') {
    if (typeof entry.url !== 'string' || !entry.url) {
      console.warn(`[MCP Builder] 跳过非法连接器 ${name}: ${entry.type} 缺少 url`)
      return
    }
    mcpServers[name] = {
      type: entry.type,
      url: entry.url,
      ...(entry.headers && typeof entry.headers === 'object' && Object.keys(entry.headers).length > 0 && { headers: entry.headers as Record<string, string> }),
      required: false,
    }
  }
}

/**
 * 收集连接器级别的禁用工具列表
 *
 * 优先从 connectors/{name}/connector.json 读取 disabledTools（新格式），
 * 兜底从 connectors.json 的 ConnectorEntry.disabledTools 读取（旧格式兼容）。
 * 转为 SDK 格式 mcp__<connectorName>__<toolName>，由 agent-orchestrator
 * 合并到 disallowedTools 中传给 SDK。
 *
 * @param workspaceSlug 工作区 slug
 * @param preReadConfig 可选，调用方已读好的配置，避免重复 I/O
 */
export function collectConnectorDisabledTools(
  workspaceSlug: string | undefined,
  preReadConfig?: ConnectorsConfig,
): string[] {
  if (!workspaceSlug) return []

  const connectorsConfig = preReadConfig ?? getWorkspaceConnectorsConfig(workspaceSlug)
  const disabled: string[] = []
  const connectorsDir = getConnectorsDir(workspaceSlug)

  for (const [name, connector] of Object.entries(connectorsConfig.connectors)) {
    if (!connector.enabled) continue
    if (connector.type !== 'mcp') continue

    // 路径穿越防护（与 buildMcpServers 保持一致）
    if (!/^[a-zA-Z0-9._-]+$/.test(name)) {
      console.warn(`[Agent 编排] 跳过非法连接器名称: ${name}`)
      continue
    }

    // 优先从 connectors/{name}/connector.json 读取（新格式）
    // 兜底从 connectors.json 的 disabledTools 字段读取（旧格式兼容）
    const tools = readDisabledToolsFromConnectorJson(connectorsDir, name)
      ?? connector.disabledTools
      ?? []

    for (const tool of tools) {
      disabled.push(`mcp__${name}__${tool}`)
    }
  }

  return disabled
}

// ---- 工具注入 ----

/**
 * 注入 SDK 内置记忆工具（全局，不依赖工作区）
 */
export async function injectMemoryTools(
  sdk: typeof import('@anthropic-ai/claude-agent-sdk'),
  mcpServers: Record<string, Record<string, unknown>>,
): Promise<void> {
  const memoryConfig = getMemoryConfig()
  const memUserId = memoryConfig.userId?.trim() || 'proma-user'
  if (!memoryConfig.enabled || !memoryConfig.apiKey) return

  try {
    const { z } = await import('zod')
    const memosServer = sdk.createSdkMcpServer({
      name: 'mem',
      version: '1.0.0',
      tools: [
        sdk.tool(
          'recall_memory',
          'Search user memories (facts and preferences) from MemOS Cloud. Use this to recall relevant context about the user.',
          { query: z.string().describe('Search query for memory retrieval'), limit: z.number().optional().describe('Max results (default 6)') },
          async (args) => {
            const result = await searchMemory(
              { apiKey: memoryConfig.apiKey, userId: memUserId, baseUrl: memoryConfig.baseUrl },
              args.query,
              args.limit,
            )
            return { content: [{ type: 'text' as const, text: formatSearchResult(result) }] }
          },
          { annotations: { readOnlyHint: true } },
        ),
        sdk.tool(
          'add_memory',
          'Store a conversation message pair into MemOS Cloud for long-term memory. Call this after meaningful exchanges worth remembering.',
          {
            userMessage: z.string().describe('The user message to store'),
            assistantMessage: z.string().optional().describe('The assistant response to store'),
            conversationId: z.string().optional().describe('Conversation ID for grouping'),
            tags: z.array(z.string()).optional().describe('Tags for categorization'),
          },
          async (args) => {
            await addMemory(
              { apiKey: memoryConfig.apiKey, userId: memUserId, baseUrl: memoryConfig.baseUrl },
              args,
            )
            return { content: [{ type: 'text' as const, text: 'Memory stored successfully.' }] }
          },
        ),
      ],
    })
    mcpServers['mem'] = memosServer as unknown as Record<string, unknown>
    console.log(`[Agent 编排] 已注入内置记忆工具 (mem)`)
  } catch (err) {
    console.error(`[Agent 编排] 注入记忆工具失败:`, err)
  }
}

/**
 * 注入 SDK 内置生图工具（Nano Banana）
 */
export async function injectNanoBananaTools(
  sdk: typeof import('@anthropic-ai/claude-agent-sdk'),
  mcpServers: Record<string, Record<string, unknown>>,
  sessionId: string,
  agentCwd?: string,
): Promise<void> {
  try {
    const { injectNanoBananaMcpServer } = await import('../chat-tools/nano-banana-mcp')
    await injectNanoBananaMcpServer(sdk, mcpServers, sessionId, agentCwd)
  } catch (err) {
    console.error(`[Agent 编排] 注入 Nano Banana MCP 失败:`, err)
  }
}

/**
 * 注入 WorkMate 内置联网搜索工具（专家团按需启用）
 */
export async function injectWebSearchTools(
  sdk: typeof import('@anthropic-ai/claude-agent-sdk'),
  mcpServers: Record<string, Record<string, unknown>>,
): Promise<void> {
  try {
    const { injectWebSearchMcpServer } = await import('../chat-tools/web-search-mcp')
    await injectWebSearchMcpServer(sdk, mcpServers)
  } catch (err) {
    console.error(`[Agent 编排] 注入 WorkMate 联网搜索 MCP 失败:`, err)
  }
}
