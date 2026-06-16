/**
 * HTTP 自定义工具 MCP Server（Agent 模式）
 *
 * 将 Tool Builder 生成的自定义 HTTP 工具包装为 MCP 服务器，
 * 注入到每个 Agent 会话，让 Agent 也能调用用户自定义的 HTTP 接口。
 *
 * 复用 executeHttpTool() 执行请求，自动继承：
 * - 模板占位符替换（{{param}}）
 * - EIP 网关认证（useEipAuth）
 * - 响应路径提取（resultPath）
 * - 30 秒超时控制
 */

import { randomUUID } from 'node:crypto'
import type { ToolCall } from '@proma/core'
import type { ChatToolMeta, ChatToolParam } from '@proma/shared'
import { getChatToolsConfig } from '../chat-tool-config'
import { executeHttpTool } from './http-tool-executor'

// ===== 常量 =====

export const CUSTOM_HTTP_MCP_SERVER = 'proma-custom-http'

// ===== Zod Schema 动态构建 =====

function buildZodSchema(
  z: typeof import('zod').z,
  params: ChatToolParam[],
): Record<string, import('zod').ZodTypeAny> {
  const schema: Record<string, import('zod').ZodTypeAny> = {}

  for (const param of params) {
    let field: import('zod').ZodTypeAny

    switch (param.type) {
      case 'number':
        field = z.number()
        break
      case 'boolean':
        field = z.boolean()
        break
      case 'string':
      default:
        field = z.string()
        break
    }

    if (param.description) {
      field = field.describe(param.description)
    }

    if (param.enum && param.enum.length > 0 && param.type === 'string') {
      const allowedValues = param.enum as readonly [string, ...string[]]
      field = (field as import('zod').ZodString).refine(
        (val) => allowedValues.includes(val),
        { message: `必须是以下值之一: ${allowedValues.join(', ')}` },
      )
    }

    if (!param.required) {
      field = field.optional()
    }

    schema[param.name] = field
  }

  return schema
}

// ===== 单工具构建 =====

function buildMcpTool(
  sdk: typeof import('@anthropic-ai/claude-agent-sdk'),
  z: typeof import('zod').z,
  meta: ChatToolMeta,
) {
  return sdk.tool(
    meta.id.replace(/-/g, '_'),
    meta.description,
    buildZodSchema(z, meta.params),
    async (args: Record<string, unknown>) => {
      try {
        const toolCall: ToolCall = {
          id: randomUUID(),
          name: meta.id,
          arguments: args,
        }

        const result = await executeHttpTool(toolCall, meta)

        const text = result.isError
          ? `工具执行失败: ${result.content}`
          : result.content

        return { content: [{ type: 'text' as const, text }] }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        console.error(`[HTTP Custom MCP] ${meta.id} 执行失败:`, error)
        return { content: [{ type: 'text' as const, text: `HTTP 请求失败: ${msg}` }] }
      }
    },
    { annotations: { readOnlyHint: true } },
  )
}

// ===== 注入入口 =====

export async function injectHttpCustomMcpServer(
  sdk: typeof import('@anthropic-ai/claude-agent-sdk'),
  mcpServers: Record<string, Record<string, unknown>>,
): Promise<void> {
  const config = getChatToolsConfig()
  const enabledTools = config.customTools.filter(
    (t) => config.toolStates[t.id]?.enabled !== false,
  )

  if (enabledTools.length === 0) return

  const { z } = await import('zod')
  const tools = enabledTools.map((meta) => buildMcpTool(sdk, z, meta))

  const server = sdk.createSdkMcpServer({
    name: CUSTOM_HTTP_MCP_SERVER,
    version: '1.0.0',
    tools,
  })

  mcpServers[CUSTOM_HTTP_MCP_SERVER] = server as unknown as Record<string, unknown>
  console.log(
    `[HTTP Custom MCP] 已注册 ${tools.length} 个工具: ` +
    enabledTools.map((t) => t.id.replace(/-/g, '_')).join(', '),
  )
}
