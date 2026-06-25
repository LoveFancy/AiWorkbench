import { describe, expect, test } from 'bun:test'

import { EIP_REQUEST_MCP_SERVER, injectEipRequestMcpServer } from './eip-request-mcp'

describe('EIP 请求 MCP 工具', () => {
  test('注入 workmate-eip MCP server 并暴露 eip_request 工具', async () => {
    const capturedTools: Array<{ name: string; description: string }> = []
    const fakeSdk = {
      tool: (
        name: string,
        description: string,
        _schema: Record<string, unknown>,
        handler: (args: unknown) => Promise<unknown>,
      ) => {
        const tool = { name, description, handler }
        capturedTools.push(tool)
        return tool
      },
      createSdkMcpServer: (config: { name: string; version: string; tools: unknown[] }) => config,
    } as unknown as typeof import('@anthropic-ai/claude-agent-sdk')
    const mcpServers: Record<string, Record<string, unknown>> = {}

    await injectEipRequestMcpServer(fakeSdk, mcpServers)

    expect(Object.keys(mcpServers)).toEqual([EIP_REQUEST_MCP_SERVER])
    expect(capturedTools[0]?.name).toBe('eip_request')
    expect(capturedTools[0]?.description).toContain('hteip-client')
  })
})
