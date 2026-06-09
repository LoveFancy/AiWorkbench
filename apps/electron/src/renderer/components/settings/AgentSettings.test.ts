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

test('华泰 SkillHub 平台能力说明收纳到标题旁 tooltip', () => {
  expect(source).toContain('SkillHub 是泰为平台提供的公司级技能中枢平台')
  expect(source).toContain('Skills 元数据管理，权限管理，版本管理，开发调试，上传下载等全生命周期管理能力')
  expect(source).toContain('华泰 SkillHub 说明')
  expect(source).not.toContain('mb-3 flex items-start gap-2 rounded-lg bg-muted/50')
})

test('Skills 设置支持上传 zip 包安装到当前工作区', () => {
  expect(source).toContain('installSkillZip')
  expect(source).toContain('上传 Zip')
  expect(source).toContain('installingZipSkill')
  expect(source).toContain('已安装 Skill')
})

test('Skills 内置分组标题不显示 Proma 来源标记', () => {
  expect(source).toContain("group.isBuiltin ? 'built-in' : group.prefix")
  expect(source).not.toContain('PROMA')
})

test('Skills 设置按已安装 SkillHub 清单归组', () => {
  expect(source).toContain('skillHubSlugs')
  expect(source).toContain('getHtSkillHubSkills(workspaceSlug)')
  expect(source).toContain('groupSkillsByPrefix(skills, defaultSkillSlugs, skillHubSlugs)')
})
