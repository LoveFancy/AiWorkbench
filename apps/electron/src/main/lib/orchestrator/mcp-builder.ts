/**
 * MCP 服务器配置构建 + SDK 内置工具注入
 *
 * 从工作区配置中读取 MCP 服务器列表，并注入平台内置工具：
 * - 记忆工具（memos-cloud）
 * - 生图工具（Nano Banana）
 * - 联网搜索工具（WebSearch）
 */

import { getWorkspaceMcpConfig } from '../agent-workspace-manager'
import { getMemoryConfig } from '../memory-service'
import { searchMemory, addMemory, formatSearchResult } from '../memos-client'

// ---- MCP 服务器 ----

/**
 * 构建工作区 MCP 服务器配置
 */
export function buildMcpServers(
  workspaceSlug: string | undefined,
  selectedMcpServers: readonly string[] = [],
): Record<string, Record<string, unknown>> {
  const mcpServers: Record<string, Record<string, unknown>> = {}
  if (!workspaceSlug) return mcpServers
  if (selectedMcpServers.length === 0) return mcpServers

  const selectedNames = new Set(selectedMcpServers)
  const mcpConfig = getWorkspaceMcpConfig(workspaceSlug)
  for (const [name, entry] of Object.entries(mcpConfig.servers ?? {})) {
    if (!selectedNames.has(name)) continue
    if (!entry.enabled) continue
    if (name === 'memos-cloud') continue

    if (entry.type === 'stdio' && entry.command) {
      const mergedEnv: Record<string, string> = {
        ...(process.env.PATH && { PATH: process.env.PATH }),
        ...entry.env,
      }
      mcpServers[name] = {
        type: 'stdio',
        command: entry.command,
        ...(entry.args && entry.args.length > 0 && { args: entry.args }),
        ...(Object.keys(mergedEnv).length > 0 && { env: mergedEnv }),
        required: false,
        startup_timeout_sec: entry.timeout ?? 30,
      }
    } else if ((entry.type === 'http' || entry.type === 'sse') && entry.url) {
      mcpServers[name] = {
        type: entry.type,
        url: entry.url,
        ...(entry.headers && Object.keys(entry.headers).length > 0 && { headers: entry.headers }),
        required: false,
      }
    }
  }

  if (Object.keys(mcpServers).length > 0) {
    console.log(`[Agent 编排] 已加载 ${Object.keys(mcpServers).length} 个 MCP 服务器`)
  }

  return mcpServers
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
