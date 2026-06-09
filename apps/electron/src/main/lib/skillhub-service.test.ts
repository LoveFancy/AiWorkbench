import { describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import type { HtSkillHubSkill } from './skillhub-service.ts'

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
})
