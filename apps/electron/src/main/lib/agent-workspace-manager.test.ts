import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import AdmZip from 'adm-zip'
import { describe, expect, test } from 'bun:test'
import type { AgentPluginInfo, WorkspaceMcpConfig } from '@proma/shared'

import {
  activateDefaultEnabledSkillsForWorkspace,
  deleteWorkspaceSkill,
  getDefaultSkillInitialEnabled,
  getWorkspaceCapabilitiesFromSources,
  installSkillZipToWorkspace,
} from './agent-workspace-manager.ts'

function pluginWithSkill(id: string, skillName: string, enabled = true, category: AgentPluginInfo['category'] = 'general'): AgentPluginInfo {
  return {
    id,
    kind: 'user',
    name: id,
    version: '1.0.0',
    keywords: [],
    path: `/tmp/${id}`,
    enabled,
    category,
    capabilities: [
      {
        type: 'skill',
        name: skillName,
        sourcePluginId: id,
        sourceLabel: id,
        relativePath: `skills/${skillName}`,
        description: `${skillName} 描述`,
        enabled,
      },
    ],
    issues: [],
  }
}

function pluginWithSkills(id: string, skillNames: string[], category: AgentPluginInfo['category'] = 'general'): AgentPluginInfo {
  const base = pluginWithSkill(id, skillNames[0] ?? 'demo', true, category)
  return {
    ...base,
    capabilities: skillNames.map((skillName) => ({
      type: 'skill',
      name: skillName,
      sourcePluginId: id,
      sourceLabel: id,
      relativePath: `skills/${skillName}`,
      description: `${skillName} 描述`,
      enabled: true,
    })),
  }
}

describe('Agent 工作区能力聚合', () => {
  test('合并已启用插件中的 Skill，供 slash 补全使用', () => {
    const capabilities = getWorkspaceCapabilitiesFromSources({
      workspaceSlug: 'default',
      mcpConfig: { servers: {} } satisfies WorkspaceMcpConfig,
      workspaceSkills: [],
      plugins: [pluginWithSkill('user:ecc/claude-api', 'claude-api')],
    })

    expect(capabilities.skills).toContainEqual({
      slug: 'claude-api',
      name: 'claude-api',
      description: 'claude-api 描述',
      enabled: true,
      sourceKind: 'plugin',
      sourcePluginId: 'user:ecc/claude-api',
      sourcePluginName: 'user:ecc/claude-api',
    })
  })

  test('普通插件中的多个 Skill 会分别生成可独立调用的 SkillMeta', () => {
    const capabilities = getWorkspaceCapabilitiesFromSources({
      workspaceSlug: 'default',
      mcpConfig: { servers: {} } satisfies WorkspaceMcpConfig,
      workspaceSkills: [],
      plugins: [pluginWithSkills('user:ecc/dev-tools', ['code-review', 'write-tests'])],
    })

    expect(capabilities.skills).toEqual([
      {
        slug: 'code-review',
        name: 'code-review',
        description: 'code-review 描述',
        enabled: true,
        sourceKind: 'plugin',
        sourcePluginId: 'user:ecc/dev-tools',
        sourcePluginName: 'user:ecc/dev-tools',
      },
      {
        slug: 'write-tests',
        name: 'write-tests',
        description: 'write-tests 描述',
        enabled: true,
        sourceKind: 'plugin',
        sourcePluginId: 'user:ecc/dev-tools',
        sourcePluginName: 'user:ecc/dev-tools',
      },
    ])
  })

  test('专家团插件携带的 Skill 不进入普通工作区能力', () => {
    const capabilities = getWorkspaceCapabilitiesFromSources({
      workspaceSlug: 'default',
      mcpConfig: { servers: {} } satisfies WorkspaceMcpConfig,
      workspaceSkills: [],
      plugins: [pluginWithSkills('user:ecc/product-team', ['private-prd-skill'], 'expert-group')],
    })

    expect(capabilities.skills).toEqual([])
  })

  test('忽略已禁用或有错误的插件 Skill', () => {
    const capabilities = getWorkspaceCapabilitiesFromSources({
      workspaceSlug: 'default',
      mcpConfig: { servers: {} } satisfies WorkspaceMcpConfig,
      workspaceSkills: [],
      plugins: [
        pluginWithSkill('user:ecc/disabled', 'disabled', false),
        {
          ...pluginWithSkill('user:ecc/broken', 'broken'),
          issues: [{ level: 'error', message: '插件损坏' }],
        },
      ],
    })

    expect(capabilities.skills).toEqual([])
  })
})

describe('默认 Skill 初始启用状态', () => {
  test('华泰邮箱和 Python 安装 Skill 默认启用', () => {
    expect(getDefaultSkillInitialEnabled('feishu-lark-setup')).toBe(false)
    expect(getDefaultSkillInitialEnabled('huatai-email-setup')).toBe(true)
    expect(getDefaultSkillInitialEnabled('install-python')).toBe(true)
    expect(getDefaultSkillInitialEnabled('find-skills')).toBe(true)
  })
})

describe('Agent 工作区索引迁移', () => {
  test('v2 老工作区会自动启用华泰邮箱和 Python 安装 Skill', () => {
    const fixture = createWorkspaceMigrationFixture()

    try {
      activateDefaultEnabledSkillsForWorkspace('default', {
        activeDir: join(fixture.workspaceDir, 'skills'),
        inactiveDir: join(fixture.workspaceDir, 'skills-inactive'),
      })

      expect(existsSync(join(fixture.workspaceDir, 'skills', 'huatai-email-setup', 'SKILL.md'))).toBe(true)
      expect(existsSync(join(fixture.workspaceDir, 'skills', 'install-python', 'SKILL.md'))).toBe(true)
      expect(existsSync(join(fixture.workspaceDir, 'skills-inactive', 'huatai-email-setup'))).toBe(false)
      expect(existsSync(join(fixture.workspaceDir, 'skills-inactive', 'install-python'))).toBe(false)
    } finally {
      rmSync(fixture.root, { recursive: true, force: true })
    }
  })
})

describe('Agent 工作区 Skill zip 安装', () => {
  test('从 zip 顶层 Skill 目录安装到活跃 Skills 目录', () => {
    const fixture = createSkillZipFixture()

    try {
      const meta = installSkillZipToWorkspace('default', fixture.zipPath, {
        activeDir: fixture.activeDir,
        inactiveDir: fixture.inactiveDir,
        tempRoot: fixture.tempRoot,
      })

      const installedSkillMd = join(fixture.activeDir, 'my-skill', 'SKILL.md')
      expect(meta).toEqual({
        slug: 'my-skill',
        name: '我的 Skill',
        description: '测试上传安装',
        enabled: true,
        sourceKind: 'workspace',
      })
      expect(existsSync(installedSkillMd)).toBe(true)
      expect(readFileSync(installedSkillMd, 'utf-8')).toContain('description: 测试上传安装')
    } finally {
      cleanupFixture(fixture)
    }
  })

  test('活跃或禁用目录存在同名 Skill 时拒绝安装', () => {
    const fixture = createSkillZipFixture()
    mkdirSync(join(fixture.inactiveDir, 'my-skill'), { recursive: true })

    try {
      expect(() => installSkillZipToWorkspace('default', fixture.zipPath, {
        activeDir: fixture.activeDir,
        inactiveDir: fixture.inactiveDir,
        tempRoot: fixture.tempRoot,
      })).toThrow('当前工作区已存在同名 Skill: my-skill')
    } finally {
      cleanupFixture(fixture)
    }
  })

  test('zip 中包含路径穿越条目时拒绝安装', () => {
    const fixture = createSkillZipFixture({ includeTraversal: true })

    try {
      expect(() => installSkillZipToWorkspace('default', fixture.zipPath, {
        activeDir: fixture.activeDir,
        inactiveDir: fixture.inactiveDir,
        tempRoot: fixture.tempRoot,
      })).toThrow('Skill zip 包包含不安全路径')
      expect(existsSync(join(fixture.activeDir, 'my-skill'))).toBe(false)
    } finally {
      cleanupFixture(fixture)
    }
  })
})

describe('Agent 工作区 Skill 删除', () => {
  test('同时彻底删除启用和禁用目录中的同名 Skill 内容', () => {
    const fixture = createSkillZipFixture()
    mkdirSync(join(fixture.activeDir, 'my-skill'), { recursive: true })
    mkdirSync(join(fixture.inactiveDir, 'my-skill'), { recursive: true })

    try {
      deleteWorkspaceSkill('default', 'my-skill', {
        activeDir: fixture.activeDir,
        inactiveDir: fixture.inactiveDir,
      })

      expect(existsSync(join(fixture.activeDir, 'my-skill'))).toBe(false)
      expect(existsSync(join(fixture.inactiveDir, 'my-skill'))).toBe(false)
    } finally {
      cleanupFixture(fixture)
    }
  })

  test('拒绝删除路径不安全的 Skill 名称', () => {
    const fixture = createSkillZipFixture()
    const outsideDir = join(fixture.root, 'escape')
    mkdirSync(outsideDir, { recursive: true })

    try {
      expect(() => deleteWorkspaceSkill('default', '../escape', {
        activeDir: fixture.activeDir,
        inactiveDir: fixture.inactiveDir,
      })).toThrow('Skill 名称包含不安全路径')
      expect(existsSync(outsideDir)).toBe(true)
    } finally {
      cleanupFixture(fixture)
    }
  })
})

interface SkillZipFixture {
  root: string
  activeDir: string
  inactiveDir: string
  tempRoot: string
  zipPath: string
}

function createSkillZipFixture(options: { includeTraversal?: boolean } = {}): SkillZipFixture {
  const root = mkdtempSync(join(tmpdir(), 'proma-skill-zip-test-'))
  const activeDir = join(root, 'skills')
  const inactiveDir = join(root, 'skills-inactive')
  const tempRoot = join(root, 'tmp')
  mkdirSync(activeDir, { recursive: true })
  mkdirSync(inactiveDir, { recursive: true })
  mkdirSync(tempRoot, { recursive: true })

  const zip = new AdmZip()
  zip.addFile('my-skill/SKILL.md', Buffer.from('---\nname: 我的 Skill\ndescription: 测试上传安装\n---\n\n# 使用说明\n', 'utf-8'))
  zip.addFile('my-skill/assets/example.txt', Buffer.from('example', 'utf-8'))
  if (options.includeTraversal) {
    zip.addFile('escape.txt', Buffer.from('unsafe', 'utf-8'))
    const unsafeEntry = zip.getEntry('escape.txt')
    if (unsafeEntry) unsafeEntry.entryName = '../escape.txt'
  }

  const zipPath = join(root, 'my-skill.zip')
  zip.writeZip(zipPath)

  return { root, activeDir, inactiveDir, tempRoot, zipPath }
}

function cleanupFixture(fixture: SkillZipFixture): void {
  rmSync(fixture.root, { recursive: true, force: true })
}

interface WorkspaceMigrationFixture {
  root: string
  workspaceDir: string
}

function createWorkspaceMigrationFixture(): WorkspaceMigrationFixture {
  const root = mkdtempSync(join(tmpdir(), 'proma-workspace-migration-test-'))
  const workspaceDir = join(root, 'agent-workspaces', 'default')
  const inactiveDir = join(workspaceDir, 'skills-inactive')
  mkdirSync(inactiveDir, { recursive: true })

  writeSkill(join(inactiveDir, 'huatai-email-setup'), 'huatai-email-setup')
  writeSkill(join(inactiveDir, 'install-python'), 'install-python')

  return { root, workspaceDir }
}

function writeSkill(skillDir: string, name: string): void {
  mkdirSync(skillDir, { recursive: true })
  writeFileSync(
    join(skillDir, 'SKILL.md'),
    `---\nname: ${name}\ndescription: 测试 Skill\nversion: "1.0.0"\n---\n\n# ${name}\n`,
    'utf-8',
  )
}
