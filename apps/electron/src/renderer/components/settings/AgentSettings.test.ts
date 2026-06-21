import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'bun:test'

const source = readFileSync(join(import.meta.dir, 'AgentSettings.tsx'), 'utf-8')

test('Agent 设置页保留内置工具配置入口', () => {
  expect(source).toContain('title="内置工具"')
  expect(source).toContain("setSettingsTab('tools')")
  expect(source).toContain('Nano Banana')
  expect(source).toContain('联网搜索')
})

test('Agent 设置页不再展示 Agent 技能入口', () => {
  expect(source).not.toContain('title="Agent 技能"')
  expect(source).not.toContain("setActiveView('agent-skills')")
  expect(source).not.toContain('Skills 与 MCP 已移至侧边栏')
})

test('Agent 设置页不再展示华泰 SkillHub', () => {
  expect(source).not.toContain('SkillHubPanel')
  expect(source).not.toContain('华泰 SkillHub')
  expect(source).not.toContain('getHtSkillHubSkills')
  expect(source).not.toContain('workspaceCapabilitiesVersionAtom')
})

test('旧设置页 SkillHubPanel 组件已清理', () => {
  expect(existsSync(join(import.meta.dir, 'SkillHubPanel'))).toBe(false)
})
