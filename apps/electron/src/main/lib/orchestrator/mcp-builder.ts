/**
 * MCP 服务器配置构建 + SDK 内置工具注入
 *
 * 从工作区配置中读取 MCP 服务器列表，并注入平台内置工具：
 * - 记忆工具（memos-cloud）
 * - 生图工具（Nano Banana）
 * - 联网搜索工具（WebSearch）
 */

import { getWorkspaceMcpConfig, getWorkspaceConnectorsConfig, readDisabledToolsFromConnectorJson } from '../agent-workspace-manager'
import type { ConnectorsConfig } from '@proma/shared'
import { getMemoryConfig } from '../memory-service'
import { searchMemory, addMemory, formatSearchResult } from '../memos-client'
import { getConnectorsDir } from '../config-paths'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// ---- MCP 服务器 ----

/**
 * 构建工作区 MCP 服务器配置
 *
 * 新旧格式合并加载：
 * 1. 遍历 connectors.json 中 enabled + type='mcp' 的连接器：
 *    - 优先从 connectors/{name}/mcp.json 加载
 *    - 不存在时兜底从旧 mcp.json 按 serverName 查找
 * 2. 旧 mcp.json 中未被连接器覆盖的 server 也一并加载
 *
 * @param preReadConfig 可选，调用方已读好的配置，避免重复 I/O
 * @param selectedMcpServers 可选，只加载指定的 MCP server（空数组 = 全部）
 */
export function buildMcpServers(
  workspaceSlug: string | undefined,
  preReadConfig?: ConnectorsConfig,
  selectedMcpServers: readonly string[] = [],
): Record<string, Record<string, unknown>> {
  const mcpServers: Record<string, Record<string, unknown>> = {}
  if (!workspaceSlug) return mcpServers

  const selectedNames = new Set(selectedMcpServers)
  const connectorsConfig = preReadConfig ?? getWorkspaceConnectorsConfig(workspaceSlug)
  const oldMcpConfig = getWorkspaceMcpConfig(workspaceSlug)

  // 记录已被连接器覆盖的 serverName（避免兜底时重复加载）
  const coveredServerNames = new Set<string>()

  // 第一阶段：从连接器加载
  for (const [name, connector] of Object.entries(connectorsConfig.connectors)) {
    if (!connector.enabled) continue
    if (connector.type !== 'mcp') continue
    if (selectedNames.size > 0 && !selectedNames.has(name)) continue

    // 路径穿越防护
    if (!/^[a-zA-Z0-9._-]+$/.test(name)) {
      console.warn(`[Agent 编排] 跳过非法连接器名称: ${name}`)
      continue
    }

    // 优先从 connectors/{name}/mcp.json 加载
    const mcpPath = join(getConnectorsDir(workspaceSlug), name, 'mcp.json')
    if (existsSync(mcpPath)) {
      try {
        const entry = JSON.parse(readFileSync(mcpPath, 'utf-8'))
        registerMcpServer(name, entry, mcpServers)
        if (connector.serverName) coveredServerNames.add(connector.serverName)
        continue
      } catch (err) {
        console.error(`[Agent 编排] 读取连接器 MCP 配置失败 (${name}):`, err)
      }
    }

    // 兜底：从旧 mcp.json 按 serverName 查找
    if (connector.serverName) {
      const oldEntry = oldMcpConfig.servers?.[connector.serverName]
      if (oldEntry?.enabled) {
        registerMcpServer(name, oldEntry, mcpServers)
        coveredServerNames.add(connector.serverName)
      }
    }
  }

  // 第二阶段：加载旧 mcp.json 中未被连接器覆盖的 server
  for (const [name, entry] of Object.entries(oldMcpConfig.servers ?? {})) {
    if (selectedNames.size > 0 && !selectedNames.has(name)) continue
    if (!entry.enabled) continue
    if (name === 'memos-cloud') continue
    if (coveredServerNames.has(name)) continue
    registerMcpServer(name, entry, mcpServers)
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
  entry: Record<string, unknown>,
  mcpServers: Record<string, Record<string, unknown>>,
): void {
  if (entry.type === 'stdio' && entry.command) {
    const mergedEnv: Record<string, string> = {
      ...(process.env.PATH && { PATH: process.env.PATH }),
      ...(entry.env as Record<string, string> ?? {}),
    }
    mcpServers[name] = {
      type: 'stdio',
      command: entry.command,
      ...(entry.args && (entry.args as string[]).length > 0 && { args: entry.args }),
      ...(Object.keys(mergedEnv).length > 0 && { env: mergedEnv }),
      required: false,
      startup_timeout_sec: (entry.timeout as number) ?? 30,
    }
  } else if ((entry.type === 'http' || entry.type === 'sse') && entry.url) {
    mcpServers[name] = {
      type: entry.type,
      url: entry.url,
      ...(entry.headers && Object.keys(entry.headers as Record<string, string>).length > 0 && { headers: entry.headers }),
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

  for (const [name, connector] of Object.entries(connectorsConfig.connectors)) {
    if (!connector.enabled) continue
    if (connector.type !== 'mcp') continue

    // 优先从 connectors/{name}/connector.json 读取（新格式）
    // 兜底从 connectors.json 的 disabledTools 字段读取（旧格式兼容）
    const tools = readDisabledToolsFromConnectorJson(getConnectorsDir(workspaceSlug), name)
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
