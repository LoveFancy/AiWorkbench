/**
 * WorkMate 联网搜索 MCP Server（Agent 模式）
 *
 * 复用 Chat 模式的 Compass 搜索实现，避免 Agent 通过 Skill 脚本在错误 cwd 下执行。
 */

import type { ToolCall } from '@proma/core'
import type { WebSearchTimeRange } from './web-search-tool'
import { executeWebSearchTool } from './web-search-tool'

export interface WebSearchMcpArgs {
  query: string
  timeRange?: WebSearchTimeRange
}

export interface WebSearchMcpResult {
  [key: string]: unknown
  content: Array<{ type: 'text'; text: string }>
}

export type WebSearchMcpExecutor = (args: WebSearchMcpArgs) => Promise<string>

export const WORKMATE_WEB_SEARCH_MCP_SERVER = 'workmate-web-search'
export const WORKMATE_WEB_SEARCH_MCP_TOOL = 'web_search'
export const WORKMATE_WEB_SEARCH_MCP_TOOL_NAME = `mcp__${WORKMATE_WEB_SEARCH_MCP_SERVER}__${WORKMATE_WEB_SEARCH_MCP_TOOL}`

async function executeWorkMateWebSearch(args: WebSearchMcpArgs): Promise<string> {
  const toolCall: ToolCall = {
    id: 'agent-web-search',
    name: WORKMATE_WEB_SEARCH_MCP_TOOL,
    arguments: {
      query: args.query,
      ...(args.timeRange && { timeRange: args.timeRange }),
    },
  }
  const result = await executeWebSearchTool(toolCall)
  return result.content
}

export async function createWebSearchMcpServer(
  sdk: typeof import('@anthropic-ai/claude-agent-sdk'),
  executeSearch: WebSearchMcpExecutor = executeWorkMateWebSearch,
): Promise<Record<string, unknown>> {
  const { z } = await import('zod')
  const server = sdk.createSdkMcpServer({
    name: WORKMATE_WEB_SEARCH_MCP_SERVER,
    version: '1.0.0',
    tools: [
      sdk.tool(
        WORKMATE_WEB_SEARCH_MCP_TOOL,
        'Search current public web information through the built-in WorkMate Compass search service. Use this for recent facts, external evidence, technology ecosystem research, release notes, vendor status, and source-backed architecture decisions.',
        {
          query: z.string().describe('Search query string. Keep it concise and specific.'),
          timeRange: z.enum(['OneDay', 'OneWeek', 'OneMonth', 'OneYear']).optional().describe('Search time range. Choose by content freshness: OneDay for today/live/breaking updates, OneWeek for recent days, OneMonth for default current facts and releases, OneYear for trends or stable-but-changing research. Broaden if results are insufficient.'),
        },
        async (args): Promise<WebSearchMcpResult> => {
          try {
            const text = await executeSearch(args)
            return { content: [{ type: 'text' as const, text }] }
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error)
            console.error('[WorkMate WebSearch MCP] 执行失败:', error)
            return { content: [{ type: 'text' as const, text: `搜索失败: ${msg}` }] }
          }
        },
        { annotations: { readOnlyHint: true } },
      ),
    ],
  })

  return server as unknown as Record<string, unknown>
}

export async function injectWebSearchMcpServer(
  sdk: typeof import('@anthropic-ai/claude-agent-sdk'),
  mcpServers: Record<string, Record<string, unknown>>,
  executeSearch?: WebSearchMcpExecutor,
): Promise<void> {
  mcpServers[WORKMATE_WEB_SEARCH_MCP_SERVER] = await createWebSearchMcpServer(sdk, executeSearch)
  console.log(`[WorkMate WebSearch MCP] 已注入内置联网搜索工具 (${WORKMATE_WEB_SEARCH_MCP_SERVER})`)
}
