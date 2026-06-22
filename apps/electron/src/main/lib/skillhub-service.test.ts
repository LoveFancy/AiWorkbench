import { afterEach, describe, expect, mock, test } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import type { HtSkillHubSkill } from './skillhub-service.ts'
import { clearConfigRootOverride, resolveConfigDir } from './config-root-service.ts'
import { getAgentWorkspacePath, getWorkspaceSkillsDir } from './config-paths.ts'

let electronAppIsPackaged = false

mock.module('electron', () => ({
  app: {
    get isPackaged() {
      return electronAppIsPackaged
    },
  },
  safeStorage: {
    isEncryptionAvailable: () => false,
  },
}))

mock.module('adm-zip', () => ({
  default: class AdmZipMock {},
}))

mock.module('../../shared/hteip-client', () => ({
  resolveApiBase: () => 'https://gateway.example.com',
}))

function createTempWorkspace(): { root: string; activeDir: string; inactiveDir: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), 'proma-skillhub-'))
  const activeDir = join(root, 'skills')
  const inactiveDir = join(root, 'skills-inactive')
  mkdirSync(activeDir, { recursive: true })
  mkdirSync(inactiveDir, { recursive: true })
  return {
    root,
    activeDir,
    inactiveDir,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  }
}

function marketSkill(): HtSkillHubSkill {
  return {
    name: 'ht-wiki-cli',
    description: '查询华泰 Wiki 内容',
    version: '1.0.0',
    files: ['SKILL.md', 'references/usage.md'],
    installed: false,
  }
}

describe('华泰 SkillHub 服务', () => {
  afterEach(() => {
    clearConfigRootOverride()
    delete process.env.WORKMATE_SKILLHUB_MOCK
    electronAppIsPackaged = false
  })

  test('HtSkillHubSkill 类型结构正确', () => {
    const s = marketSkill()
    expect(s.name).toBe('ht-wiki-cli')
    expect(s.version).toBe('1.0.0')
    expect(s.installed).toBe(false)
    expect(s.files).toHaveLength(2)
  })

  test('已安装的 Skill 目录存在性检查', () => {
    const workspace = createTempWorkspace()
    try {
      const installedDir = join(workspace.inactiveDir, 'ht-wiki-cli')
      mkdirSync(installedDir, { recursive: true })
      writeFileSync(join(installedDir, 'SKILL.md'), '# old', 'utf-8')
      expect(existsSync(join(workspace.inactiveDir, 'ht-wiki-cli', 'SKILL.md'))).toBe(true)
    } finally {
      workspace.cleanup()
    }
  })

  test('卸载时拒绝越界 Skill 名称并保留工作区文件', async () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'workmate-skillhub-uninstall-'))
    try {
      resolveConfigDir({ homeDir, configDirName: '.workmate-test' })
      const workspaceSlug = 'workspace-a'
      const workspacePath = getAgentWorkspacePath(workspaceSlug)
      const skillsDir = getWorkspaceSkillsDir(workspaceSlug)
      writeFileSync(join(workspacePath, 'sentinel.txt'), 'keep', 'utf-8')
      mkdirSync(join(skillsDir, 'safe-skill'), { recursive: true })

      const { uninstallHtSkillHubSkill } = await import('./skillhub-service.ts')

      await expect(uninstallHtSkillHubSkill(workspaceSlug, '..')).rejects.toThrow('非法 Skill 名称')
      expect(existsSync(join(workspacePath, 'sentinel.txt'))).toBe(true)
      expect(existsSync(skillsDir)).toBe(true)
    } finally {
      clearConfigRootOverride()
      rmSync(homeDir, { recursive: true, force: true })
    }
  })

  test('日志输出用的 SkillHub headers 会脱敏认证信息', async () => {
    const { redactSkillHubHeaders } = await import('./skillhub-service.ts')

    const redacted = redactSkillHubHeaders({
      Authorization: 'Bearer skillhub-secret-token',
      Cookie: 'EIPGW-TOKEN=eipgw-secret-token',
      'Content-Type': 'application/json',
    })

    const serialized = JSON.stringify(redacted)
    expect(serialized).not.toContain('skillhub-secret-token')
    expect(serialized).not.toContain('eipgw-secret-token')
    expect(redacted.Authorization).toBe('[REDACTED]')
    expect(redacted.Cookie).toBe('[REDACTED]')
    expect(redacted['Content-Type']).toBe('application/json')
  })

  test('开发 mock 返回 SkillHub 市场数据并支持关键词过滤', async () => {
    process.env.WORKMATE_SKILLHUB_MOCK = '1'
    const { fetchSkillHubSkills, fetchSkillHubDetail } = await import('./skillhub-service.ts')

    const all = await fetchSkillHubSkills()
    expect(all.length).toBeGreaterThan(0)
    expect(all.some((skill) => skill.skillName === 'prd-writer')).toBe(true)

    const filtered = await fetchSkillHubSkills({ keyword: 'Drawio' })
    expect(filtered.map((skill) => skill.skillName)).toEqual(['drawio-doc-exporter'])

    const detail = await fetchSkillHubDetail('prd-writer')
    expect(detail.readme).toContain('逐章节确认模式')
  })

  test('SkillHub 市场索引返回分页信息，不要求前端全量拉取', async () => {
    process.env.WORKMATE_SKILLHUB_MOCK = '1'
    const { fetchHtSkillHubIndexPage } = await import('./skillhub-service.ts')

    const page = await fetchHtSkillHubIndexPage(undefined, 1, undefined, undefined, 2)

    expect(page.page).toBe(1)
    expect(page.pageSize).toBe(2)
    expect(page.items).toHaveLength(2)
    expect(page.hasMore).toBe(true)
  })

  test('打包环境缺少 NODE_ENV 时不启用 SkillHub mock', async () => {
    const previousNodeEnv = process.env.NODE_ENV
    electronAppIsPackaged = true
    delete process.env.NODE_ENV

    try {
      const { shouldUseMockSkillHub } = await import('./skillhub-auth-service.ts')

      expect(shouldUseMockSkillHub()).toBe(false)
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV
      else process.env.NODE_ENV = previousNodeEnv
    }
  })
})
