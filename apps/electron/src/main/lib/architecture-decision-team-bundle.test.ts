import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const pluginRoot = join(import.meta.dir, '..', '..', '..', 'bundled-plugins', 'architecture-decision-team')

describe('WorkMate 内置专家团配置', () => {
  test('插件名就是专家团名且只声明一个专家团', () => {
    const manifest = JSON.parse(readFileSync(
      join(pluginRoot, '.claude-plugin', 'plugin.json'),
      'utf-8',
    )) as { name?: string; expertGroup?: string; expertGroups?: string[] }

    expect(manifest.name).toBe('架构决策专家团')
    expect(manifest.expertGroup).toBe('architecture-decision-team')
    expect(manifest.expertGroups).toBeUndefined()
  })

  test('架构决策专家团要求外部调研在同一工具调用批次并行启动', () => {
    const raw = JSON.parse(readFileSync(
      join(pluginRoot, 'expert-groups', 'architecture-decision-team.json'),
      'utf-8',
    )) as { mainRole?: { prompt?: string } }

    const prompt = raw.mainRole?.prompt ?? ''

    expect(prompt).toContain('同一个 assistant 响应')
    expect(prompt).toContain('同一批 tool_use')
    expect(prompt).toContain('不要先启动一个外部技术调研专家')
  })

  test('架构决策专家团通过 WorkMate 内置 web_search 联网，不直接暴露 WebSearch 和 WebFetch 工具', () => {
    const group = JSON.parse(readFileSync(
      join(pluginRoot, 'expert-groups', 'architecture-decision-team.json'),
      'utf-8',
    )) as { builtinTools?: string[]; skills?: string[]; toolsPolicy?: { disallowedTools?: string[] } }
    const researcher = readFileSync(join(pluginRoot, 'agents', 'external-researcher.md'), 'utf-8')

    expect(group.builtinTools).toContain('web-search')
    expect(group.skills ?? []).not.toContain('web-search')
    expect(group.toolsPolicy?.disallowedTools).toEqual(['WebSearch', 'WebFetch'])
    expect(researcher).toContain('mcp__workmate-web-search__web_search')
    expect(researcher).not.toContain('- WebSearch')
    expect(researcher).not.toContain('- WebFetch')
  })

  test('架构决策专家团子专家提供中文显示名', () => {
    const group = JSON.parse(readFileSync(
      join(pluginRoot, 'expert-groups', 'architecture-decision-team.json'),
      'utf-8',
    )) as { subagentLabels?: Record<string, string> }

    expect(group.subagentLabels).toEqual({
      'external-researcher': '外部技术调研专家',
      'architecture-decision-maker': '架构取舍决策专家',
      'implementation-risk-reviewer': '落地风险评审专家',
      'adr-writer': 'ADR 编写专家',
    })
  })
})
