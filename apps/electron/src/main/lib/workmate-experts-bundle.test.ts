import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const pluginRoot = join(import.meta.dir, '..', '..', '..', 'bundled-plugins', 'workmate-experts')

describe('WorkMate 内置专家团配置', () => {
  test('架构决策专家团要求外部调研在同一工具调用批次并行启动', () => {
    const raw = JSON.parse(readFileSync(
      join(pluginRoot, 'expert-groups', 'architecture-decision-team.json'),
      'utf-8',
    )) as { mainRole?: { prompt?: string } }

    const prompt = raw.mainRole?.prompt ?? ''

    expect(prompt).toContain('同一个 assistant 响应')
    expect(prompt).toContain('同一批 tool_use')
    expect(prompt).toContain('不要先启动一个 external-researcher')
  })

  test('架构决策专家团通过 web-search Skill 联网，不直接暴露 WebSearch 和 WebFetch 工具', () => {
    const group = JSON.parse(readFileSync(
      join(pluginRoot, 'expert-groups', 'architecture-decision-team.json'),
      'utf-8',
    )) as { skills?: string[]; toolsPolicy?: { disallowedTools?: string[] } }
    const researcher = readFileSync(join(pluginRoot, 'agents', 'external-researcher.md'), 'utf-8')

    expect(group.skills).toContain('web-search')
    expect(group.toolsPolicy?.disallowedTools).toEqual(['WebSearch', 'WebFetch'])
    expect(researcher).toContain('优先调用 `web-search` Skill')
    expect(researcher).not.toContain('- WebSearch')
    expect(researcher).not.toContain('- WebFetch')
  })
})
