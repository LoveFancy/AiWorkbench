import { executeEipRequest, type EipRequestInput } from './eip-request-service'

export const EIP_REQUEST_MCP_SERVER = 'workmate-eip'

export async function injectEipRequestMcpServer(
  sdk: typeof import('@anthropic-ai/claude-agent-sdk'),
  mcpServers: Record<string, Record<string, unknown>>,
): Promise<void> {
  const { z } = await import('zod')

  const scalarSchema = z.union([z.string(), z.number(), z.boolean()])
  const headersSchema = z.record(z.string(), z.string()).optional()
  const querySchema = z.record(z.string(), scalarSchema).optional()

  const server = sdk.createSdkMcpServer({
    name: EIP_REQUEST_MCP_SERVER,
    version: '1.0.0',
    tools: [
      sdk.tool(
        'eip_request',
        '调用 EIP 内部接口。自动复用 Workmate 登录态并通过 hteip-client 注入认证。禁止传入 Cookie、Authorization、CSRF、session 等敏感请求头。',
        {
          method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']).describe('HTTP 方法'),
          path: z.string().describe('EIP API 路径，例如 /paas/app/api/app/listByUserNew。优先使用相对路径。'),
          query: querySchema.describe('URL query 参数。无论 GET 还是 POST，都会拼接到 URL。'),
          body: z.unknown().optional().describe('请求体。POST/PUT/PATCH 需要 body 时使用；POST + query + 空 body 时省略。'),
          headers: headersSchema.describe('非敏感请求头。不要传 Cookie、Authorization、X-CSRF-TOKEN。'),
          timeoutMs: z.number().int().positive().max(60_000).optional().describe('超时时间，单位毫秒，最大 60000。'),
          resultPath: z.string().optional().describe('可选的数据提取路径，例如 data.items。'),
        },
        async (args) => {
          try {
            const result = await executeEipRequest(args as EipRequestInput)
            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify(result, null, 2),
                },
              ],
            }
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error)
            console.error('[EIP MCP] eip_request 执行失败:', msg)
            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify({ ok: false, status: 0, data: null, error: msg }, null, 2),
                },
              ],
            }
          }
        },
        { annotations: { readOnlyHint: false } },
      ),
    ],
  })

  mcpServers[EIP_REQUEST_MCP_SERVER] = server as unknown as Record<string, unknown>
  console.log('[Agent 编排] 已注入 EIP 请求工具 (workmate-eip/eip_request)')
}
