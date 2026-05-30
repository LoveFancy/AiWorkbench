import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'bun:test'

const source = readFileSync(join(import.meta.dir, 'AgentSettings.tsx'), 'utf-8')

test('AI 配置创建 Agent 会话后必须打开并激活会话 Tab', () => {
  expect(source).toContain('useOpenSession')
  expect(source).toContain("openSession('agent'")
  expect(source).toContain("setActiveView('conversations')")
})

test('MCP AI 配置提示词指定可用 MCP 的查找来源和安全校验', () => {
  expect(source).toContain('https://registry.modelcontextprotocol.io')
  expect(source).toContain('https://modelcontextprotocol.io/registry')
  expect(source).toContain('Smithery')
  expect(source).toContain('Glama')
  expect(source).toContain('mcp.so')
  expect(source).toContain('安装前要核对')
})
