import { describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  getAgentExpertGroup,
  listAgentExpertGroups,
  resolveExpertGroupRuntime,
} from './agent-expert-group-manager.ts'
import { setPluginEnabled } from './plugin-registry-service.ts'

interface TestPaths {
  builtinDir: string
  userDir: string
  configPath: string
  defaultSkillsDir: string
}

function tempRoot(): { root: string; paths: TestPaths; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), 'proma-expert-groups-'))
  return {
    root,
    paths: {
      builtinDir: join(root, 'default-plugins'),
      userDir: join(root, 'user-plugins'),
      configPath: join(root, 'plugins.json'),
      defaultSkillsDir: join(root, 'default-skills'),
    },
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  }
}

function createExpertPlugin(paths: TestPaths, name = 'workmate-experts'): string {
  const pluginDir = join(paths.builtinDir, name)
  mkdirSync(join(pluginDir, '.claude-plugin'), { recursive: true })
  mkdirSync(join(pluginDir, 'expert-groups'), { recursive: true })
  mkdirSync(join(pluginDir, 'agents'), { recursive: true })
  mkdirSync(join(pluginDir, 'skills', 'prd-writer'), { recursive: true })
  writeFileSync(
    join(pluginDir, '.claude-plugin', 'plugin.json'),
    JSON.stringify({
      name,
      version: '1.0.0',
      expertGroups: ['product-team'],
    }),
    'utf-8',
  )
  writeFileSync(
    join(pluginDir, 'expert-groups', 'product-team.json'),
    JSON.stringify({
      id: 'product-team',
      name: '产品专家团',
      description: '把想法整理成需求、PRD 和 Story。',
      introduction: '我是产品专家团，会先帮你梳理目标、约束和可行动方案。',
      mainRole: {
        name: '产品负责人',
        prompt: '你是产品专家团的主角色。',
      },
      subagents: ['requirement-analyst'],
      builtinTools: ['web-search'],
      skills: ['prd-writer'],
      mcpServers: ['dpmp'],
      tags: ['PRD', 'Story'],
      samplePrompts: ['帮我把这个想法整理成 PRD'],
      toolsPolicy: {
        mode: 'inherit',
        disallowedTools: ['WebSearch', 'WebFetch'],
      },
    }),
    'utf-8',
  )
  writeFileSync(
    join(pluginDir, 'agents', 'requirement-analyst.md'),
    '---\ndescription: 需求分析专家\nmaxTurns: 6\ntools:\n  - Read\n  - Grep\n---\n你负责澄清需求并输出结构化分析。',
    'utf-8',
  )
  writeFileSync(
    join(pluginDir, 'skills', 'prd-writer', 'SKILL.md'),
    '---\nname: prd-writer\ndescription: 编写 PRD\n---\n# PRD Writer',
    'utf-8',
  )
  writeFileSync(
    join(pluginDir, '.mcp.json'),
    JSON.stringify({ mcpServers: { dpmp: { type: 'stdio', command: 'dpmp' } } }),
    'utf-8',
  )
  return pluginDir
}

describe('Agent 专家团管理器', () => {
  test('列出启用插件提供的专家团', () => {
    const temp = tempRoot()
    try {
      createExpertPlugin(temp.paths)

      const groups = listAgentExpertGroups(temp.paths)

      expect(groups).toHaveLength(1)
      expect(groups[0]).toMatchObject({
        id: 'product-team',
        name: '产品专家团',
        sourcePluginId: 'builtin:workmate-experts',
        sourceLabel: 'workmate-experts',
        sourcePluginVersion: '1.0.0',
        enabled: true,
        status: 'available',
      })
    } finally {
      temp.cleanup()
    }
  })

  test('插件禁用后专家团保留但不可用', () => {
    const temp = tempRoot()
    try {
      createExpertPlugin(temp.paths)
      setPluginEnabled('builtin:workmate-experts', false, temp.paths)

      const groups = listAgentExpertGroups(temp.paths)

      expect(groups).toHaveLength(1)
      expect(groups[0]?.enabled).toBe(false)
      expect(groups[0]?.status).toBe('plugin_disabled')
    } finally {
      temp.cleanup()
    }
  })

  test('按插件和 ID 获取专家团', () => {
    const temp = tempRoot()
    try {
      createExpertPlugin(temp.paths)

      const group = getAgentExpertGroup({
        expertGroupId: 'product-team',
        expertPluginId: 'builtin:workmate-experts',
      }, temp.paths)

      expect(group?.mainRole.name).toBe('产品负责人')
      expect(group?.introduction).toBe('我是产品专家团，会先帮你梳理目标、约束和可行动方案。')
      expect(group?.tags).toEqual(['PRD', 'Story'])
    } finally {
      temp.cleanup()
    }
  })

  test('解析专家团运行时配置', () => {
    const temp = tempRoot()
    try {
      const pluginDir = createExpertPlugin(temp.paths)

      const runtime = resolveExpertGroupRuntime({
        expertGroupId: 'product-team',
        expertPluginId: 'builtin:workmate-experts',
      }, temp.paths)

      expect(runtime?.mainPrompt).toBe('你是产品专家团的主角色。')
      expect(runtime?.pluginPaths).toEqual([{ type: 'local', path: pluginDir }])
      expect(runtime?.agents['requirement-analyst']).toMatchObject({
        description: '需求分析专家',
        prompt: '你负责澄清需求并输出结构化分析。',
        tools: ['Read', 'Grep'],
        maxTurns: 6,
      })
      expect(runtime?.promptHints).toContain('当任务需要 PRD、Story 时，优先考虑使用产品专家团。')
      expect(runtime?.group.builtinTools).toEqual(['web-search'])
      expect(runtime?.mcpServers.dpmp).toMatchObject({ type: 'stdio', command: 'dpmp' })
      expect(runtime?.disallowedTools).toEqual(['WebSearch', 'WebFetch'])
    } finally {
      temp.cleanup()
    }
  })

  test('缺少 SubAgent 时标记为不可用', () => {
    const temp = tempRoot()
    try {
      createExpertPlugin(temp.paths)
      rmSync(join(temp.paths.builtinDir, 'workmate-experts', 'agents', 'requirement-analyst.md'))

      const groups = listAgentExpertGroups(temp.paths)
      const runtime = resolveExpertGroupRuntime({
        expertGroupId: 'product-team',
        expertPluginId: 'builtin:workmate-experts',
      }, temp.paths)

      expect(groups[0]?.status).toBe('missing_subagent')
      expect(groups[0]?.issues.some((issue) => issue.message.includes('requirement-analyst'))).toBe(true)
      expect(runtime).toBeNull()
    } finally {
      temp.cleanup()
    }
  })

  test('缺少 Skill 时标记为不可用', () => {
    const temp = tempRoot()
    try {
      createExpertPlugin(temp.paths)
      rmSync(join(temp.paths.builtinDir, 'workmate-experts', 'skills', 'prd-writer'), { recursive: true, force: true })

      const groups = listAgentExpertGroups(temp.paths)

      expect(groups[0]?.status).toBe('missing_skill')
      expect(groups[0]?.issues.some((issue) => issue.message.includes('prd-writer'))).toBe(true)
    } finally {
      temp.cleanup()
    }
  })

  test('专家团可以引用内置默认 Skill', () => {
    const temp = tempRoot()
    try {
      createExpertPlugin(temp.paths)
      mkdirSync(join(temp.paths.defaultSkillsDir, 'web-search'), { recursive: true })
      writeFileSync(
        join(temp.paths.defaultSkillsDir, 'web-search', 'SKILL.md'),
        '---\nname: web-search\ndescription: 联网检索\n---\n# Web Search',
        'utf-8',
      )
      writeFileSync(
        join(temp.paths.builtinDir, 'workmate-experts', 'expert-groups', 'product-team.json'),
        JSON.stringify({
          id: 'product-team',
          name: '产品专家团',
          mainRole: {
            name: '产品负责人',
            prompt: '你是产品专家团的主角色。',
          },
          subagents: ['requirement-analyst'],
          skills: ['web-search'],
        }),
        'utf-8',
      )
      rmSync(join(temp.paths.builtinDir, 'workmate-experts', 'skills', 'prd-writer'), { recursive: true, force: true })

      const groups = listAgentExpertGroups(temp.paths)

      expect(groups[0]?.status).toBe('available')
      expect(groups[0]?.skills).toEqual(['web-search'])
      expect(groups[0]?.issues).toEqual([])
    } finally {
      temp.cleanup()
    }
  })

  test('未知内置工具给出 warning 但不阻断专家团加载', () => {
    const temp = tempRoot()
    try {
      createExpertPlugin(temp.paths)
      writeFileSync(
        join(temp.paths.builtinDir, 'workmate-experts', 'expert-groups', 'product-team.json'),
        JSON.stringify({
          id: 'product-team',
          name: '产品专家团',
          mainRole: {
            name: '产品负责人',
            prompt: '你是产品专家团的主角色。',
          },
          subagents: ['requirement-analyst'],
          builtinTools: ['unknown-tool'],
        }),
        'utf-8',
      )

      const groups = listAgentExpertGroups(temp.paths)

      expect(groups[0]?.status).toBe('available')
      expect(groups[0]?.issues).toContainEqual({
        level: 'warning',
        message: '未支持的内置工具: unknown-tool',
      })
    } finally {
      temp.cleanup()
    }
  })
})
