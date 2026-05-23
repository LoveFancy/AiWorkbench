import { describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import {
  installHtSkillHubSkill,
  validateHtSkillHubFilePath,
  type HtSkillHubSkill,
} from './skillhub-service.ts'

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
    files: ['SKILL.md', 'references/usage.md'],
  }
}

describe('华泰 SkillHub 服务', () => {
  test('拒绝存在路径穿越的 Skill 文件路径', () => {
    expect(() => validateHtSkillHubFilePath('../secret.txt')).toThrow('非法 Skill 文件路径')
    expect(() => validateHtSkillHubFilePath('/tmp/secret.txt')).toThrow('非法 Skill 文件路径')
    expect(() => validateHtSkillHubFilePath('references\\secret.md')).toThrow('非法 Skill 文件路径')
  })

  test('安装未安装的 Skill 到当前工作区启用目录', async () => {
    const workspace = createTempWorkspace()
    try {
      const result = await installHtSkillHubSkill({
        workspaceSlug: 'default',
        skill: marketSkill(),
        overwrite: false,
        activeDir: workspace.activeDir,
        inactiveDir: workspace.inactiveDir,
        fetchText: async (_url) => '# downloaded',
      })

      expect(result.status).toBe('installed')
      expect(result.enabled).toBe(true)
      expect(readFileSync(join(workspace.activeDir, 'ht-wiki-cli', 'SKILL.md'), 'utf-8')).toBe('# downloaded')
      expect(readFileSync(join(workspace.activeDir, 'ht-wiki-cli', 'references', 'usage.md'), 'utf-8')).toBe('# downloaded')
    } finally {
      workspace.cleanup()
    }
  })

  test('覆盖已禁用 Skill 时仍保持禁用状态', async () => {
    const workspace = createTempWorkspace()
    try {
      const installedDir = join(workspace.inactiveDir, 'ht-wiki-cli')
      mkdirSync(installedDir, { recursive: true })
      writeFileSync(join(installedDir, 'SKILL.md'), '# old', 'utf-8')

      const result = await installHtSkillHubSkill({
        workspaceSlug: 'default',
        skill: marketSkill(),
        overwrite: true,
        activeDir: workspace.activeDir,
        inactiveDir: workspace.inactiveDir,
        fetchText: async (_url) => '# new',
      })

      expect(result.status).toBe('overwritten')
      expect(result.enabled).toBe(false)
      expect(existsSync(join(workspace.activeDir, 'ht-wiki-cli'))).toBe(false)
      expect(readFileSync(join(workspace.inactiveDir, 'ht-wiki-cli', 'SKILL.md'), 'utf-8')).toBe('# new')
    } finally {
      workspace.cleanup()
    }
  })
})
