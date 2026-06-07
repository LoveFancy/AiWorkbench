import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const skillDir = join(import.meta.dir, '../../../default-skills/find-skills')
const skillPath = join(skillDir, 'SKILL.md')

describe('内置 Skill 查找 Skill', () => {
  test('SKILL.md 优先说明华泰 SkillHub 的标准 Skills CLI 安装方式', () => {
    expect(existsSync(skillPath)).toBe(true)

    const content = readFileSync(skillPath, 'utf-8')

    expect(content).toContain('version: "1.0.2"')
    expect(content).toContain('http://skillhub.uat.saas.htsc')
    expect(content).toContain('npx skills add http://skillhub.uat.saas.htsc --skill <skill-name>')
    expect(content).toContain('npx skills find [query]')
    expect(content).toContain('npx skills add <owner/repo@skill> -g -y')
    expect(content).not.toContain('search_ht_skillhub')
    expect(content).not.toContain('install_ht_skillhub_skill')
  })
})
