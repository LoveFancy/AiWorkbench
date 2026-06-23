import { describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { listAgentExpertGroups } from './agent-expert-group-manager.ts'

const bundledPluginsRoot = join(import.meta.dir, '..', '..', '..', 'bundled-plugins')

interface PluginManifest {
  name?: string
  description?: string
  expertGroup?: string
  expertType?: string
}

interface ExpertGroupManifest {
  id?: string
  name?: string
  categories?: string[]
  introduction?: string
  skills?: string[]
  mainRole?: {
    name?: string
    prompt?: string
  }
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf-8')) as T
}

function expectSkillExists(pluginId: string, skillName: string): void {
  expect(
    existsSync(join(bundledPluginsRoot, pluginId, 'skills', skillName, 'SKILL.md')),
    `${pluginId} 应内置独立 Skill: ${skillName}`,
  ).toBe(true)
}

describe('从 WorkBuddy 转换的内置专家', () => {
  test('文档处理专家独立内置 WorkBuddy 文档 Skills', () => {
    const pluginId = 'document-processing-expert'
    const manifest = readJson<PluginManifest>(join(bundledPluginsRoot, pluginId, '.claude-plugin', 'plugin.json'))
    const group = readJson<ExpertGroupManifest>(join(bundledPluginsRoot, pluginId, 'expert-groups', `${pluginId}.json`))

    expect(manifest.name).toBe('文档处理专家')
    expect(manifest.description ?? '').not.toContain('WorkBuddy')
    expect(manifest.expertGroup).toBe(pluginId)
    expect(manifest.expertType).toBe('agent')
    expect(group.id).toBe(pluginId)
    expect(group.name).toBe('文档处理专家')
    expect(group.categories).toContain('内容创作')
    expect(group.categories).toContain('项目管理与质量')
    expect(group.skills).toEqual(['document-dependency-setup', 'xlsx', 'docx', 'pptx', 'pdf', 'pdfkit-py'])
    expect(group.introduction ?? '').not.toContain('WorkBuddy')
    expect(group.mainRole?.prompt ?? '').not.toContain('WorkBuddy')
    expect(group.introduction ?? '').toContain('Word')
    expect(group.introduction ?? '').toContain('Excel')
    expect(group.introduction ?? '').toContain('PDF')
    expect(group.mainRole?.prompt ?? '').toContain('document-dependency-setup')

    for (const skillName of group.skills ?? []) {
      expectSkillExists(pluginId, skillName)
    }

    const setupSkill = readFileSync(
      join(bundledPluginsRoot, pluginId, 'skills', 'document-dependency-setup', 'SKILL.md'),
      'utf-8',
    )
    const pandocInstaller = readFileSync(
      join(bundledPluginsRoot, pluginId, 'skills', 'document-dependency-setup', 'scripts', 'install-pandoc-windows.ps1'),
      'utf-8',
    )

    expect(setupSkill).toContain('https://htpan.htsc.com.cn/l/tF2Jb7')
    expect(setupSkill).toContain('清华')
    expect(setupSkill).toContain('https://pypi.tuna.tsinghua.edu.cn/simple')
    expect(setupSkill).toContain('Pandoc')
    expect(pandocInstaller).toContain('pandoc-3.9.0.2-windows-x86_64.msi')
    expect(pandocInstaller).toContain('Environment]::SetEnvironmentVariable')
    expect(pandocInstaller).toContain('htpan.htsc.com.cn/l/tF2Jb7')
  })

  test('数据分析专家独立内置 WorkBuddy Data Skills', () => {
    const pluginId = 'data-analysis-expert'
    const expectedSkills = [
      'data-analysis-workflows',
      'data-context-extractor',
      'data-exploration',
      'data-validation',
      'data-visualization',
      'interactive-dashboard-builder',
      'sql-queries',
      'statistical-analysis',
    ]
    const manifest = readJson<PluginManifest>(join(bundledPluginsRoot, pluginId, '.claude-plugin', 'plugin.json'))
    const group = readJson<ExpertGroupManifest>(join(bundledPluginsRoot, pluginId, 'expert-groups', `${pluginId}.json`))

    expect(manifest.name).toBe('数据分析专家')
    expect(manifest.expertGroup).toBe(pluginId)
    expect(manifest.expertType).toBe('agent')
    expect(group.id).toBe(pluginId)
    expect(group.name).toBe('数据分析专家')
    expect(group.categories).toContain('AI与数据智能')
    expect(group.skills).toEqual(expectedSkills)
    expect(manifest.description ?? '').not.toContain('WorkBuddy')
    expect(group.introduction ?? '').not.toContain('WorkBuddy')
    expect(group.mainRole?.prompt ?? '').not.toContain('WorkBuddy')
    expect(group.mainRole?.prompt ?? '').toContain('plotly')

    for (const skillName of expectedSkills) {
      expectSkillExists(pluginId, skillName)
    }
  })

  test('两个转换专家可以被源码内置插件扫描为可用', () => {
    const root = mkdtempSync(join(tmpdir(), 'workmate-converted-experts-'))
    try {
      const groups = listAgentExpertGroups({
        builtinDir: bundledPluginsRoot,
        userDir: join(root, 'user-plugins'),
        configPath: join(root, 'plugins.json'),
        defaultSkillsDir: join(import.meta.dir, '..', '..', '..', 'default-skills'),
      }).filter((group) => ['document-processing-expert', 'data-analysis-expert'].includes(group.id))

      expect(groups.map((group) => group.id).sort()).toEqual([
        'data-analysis-expert',
        'document-processing-expert',
      ])
      for (const group of groups) {
        expect(group.status).toBe('available')
        expect(group.issues).toEqual([])
      }
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
