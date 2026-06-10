import { describe, expect, test } from 'bun:test'

import {
  createWebSearchMcpServer,
  injectWebSearchMcpServer,
  type WebSearchMcpArgs,
  type WebSearchMcpResult,
} from './web-search-mcp.ts'

interface CapturedTool {
  name: string
  description: string
  schema: Record<string, { description?: string }>
  handler: (args: WebSearchMcpArgs) => Promise<WebSearchMcpResult>
}

describe('Agent 内置联网搜索 MCP 工具', () => {
  test('创建 web_search 工具并把查询参数交给 WorkMate 搜索执行器', async () => {
    const capturedTools: CapturedTool[] = []
    const fakeSdk = {
      tool: (
        name: string,
        description: string,
        schema: Record<string, { description?: string }>,
        handler: (args: WebSearchMcpArgs) => Promise<WebSearchMcpResult>,
      ) => {
        const tool = { name, description, schema, handler }
        capturedTools.push(tool)
        return tool
      },
      createSdkMcpServer: (config: { name: string; version: string; tools: unknown[] }) => config,
    } as unknown as typeof import('@anthropic-ai/claude-agent-sdk')

    const server = await createWebSearchMcpServer(fakeSdk, async (args) => {
      return `query=${args.query};timeRange=${args.timeRange ?? 'default'}`
    })
    const tool = capturedTools[0]
    if (!tool) throw new Error('未捕获 web_search 工具定义')

    expect(server).toMatchObject({ name: 'workmate-web-search', version: '1.0.0' })
    expect(tool.name).toBe('web_search')
    expect(tool.description).toContain('WorkMate')
    expect(tool.schema.timeRange?.description).toContain('Choose by content freshness')
    expect(tool.schema.timeRange?.description).toContain('Broaden if results are insufficient')

    const result = await tool.handler({ query: 'Claude Code 版本', timeRange: 'OneWeek' })

    expect(result).toEqual({
      content: [{ type: 'text', text: 'query=Claude Code 版本;timeRange=OneWeek' }],
    })
  })

  test('注入时使用稳定 MCP server 名称，供 SubAgent 通过 mcp__workmate-web-search__web_search 调用', async () => {
    const fakeSdk = {
      tool: (
        name: string,
        description: string,
        _schema: Record<string, unknown>,
        handler: (args: WebSearchMcpArgs) => Promise<WebSearchMcpResult>,
      ) => ({ name, description, handler }),
      createSdkMcpServer: (config: { name: string; version: string; tools: unknown[] }) => config,
    } as unknown as typeof import('@anthropic-ai/claude-agent-sdk')
    const mcpServers: Record<string, Record<string, unknown>> = {}

    await injectWebSearchMcpServer(fakeSdk, mcpServers, async () => '搜索结果')

    expect(Object.keys(mcpServers)).toEqual(['workmate-web-search'])
  })
})
