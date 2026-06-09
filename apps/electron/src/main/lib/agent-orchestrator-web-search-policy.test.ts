import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'

const source = await Bun.file(join(import.meta.dir, 'agent-orchestrator.ts')).text()

describe('Agent 联网检索工具策略', () => {
  test('默认禁用 SDK 原生 WebSearch，统一走 Proma 直连检索', () => {
    expect(source).toContain("const SDK_NATIVE_SEARCH_TOOLS = ['WebSearch'] as const")
    expect(source).toContain('mergeDisallowedTools(expertRuntime?.disallowedTools)')
    expect(source).toContain('disallowedTools: mergeDisallowedTools(expertRuntime?.disallowedTools)')
    expect(source).not.toContain("const SDK_NATIVE_WEB_TOOLS = ['WebSearch', 'WebFetch'] as const")
  })

  test('WorkMate WebSearch MCP 全局注入，不依赖专家团 builtinTools', () => {
    expect(source).toContain('await this.injectWebSearchTools(sdk, mcpServers)')
    expect(source).not.toContain("expertRuntime.group.builtinTools?.includes('web-search')")
  })

  test('计划模式允许 WebFetch 获取已知 URL，但不允许 SDK 原生搜索', () => {
    expect(source).not.toContain("'Read', 'Glob', 'Grep', 'WebSearch', 'WebFetch'")
    expect(source).toContain("'Read', 'Glob', 'Grep', 'WebFetch',")
  })
})
