import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'

const skillDir = join(import.meta.dir, '../../../default-skills/dpmp-skills')

describe('内置 DPMP Skill', () => {
  test('包含 DPMP Skill 元信息和运行入口', () => {
    const content = readFileSync(join(skillDir, 'SKILL.md'), 'utf-8')

    expect(content).toContain('name: dpmp-skills')
    expect(content).toContain('version: 0.1.5')
    expect(content).toContain('openApiToken')
    expect(content).toContain('DPMP')
    expect(existsSync(join(skillDir, 'run.py'))).toBe(true)
    expect(existsSync(join(skillDir, 'scripts/create_req.py'))).toBe(true)
    expect(existsSync(join(skillDir, 'scripts/create_story.py'))).toBe(true)
  })

  test('只内置环境变量样例，不携带真实配置文件', () => {
    expect(existsSync(join(skillDir, '.env.example'))).toBe(true)
    expect(existsSync(join(skillDir, '.env'))).toBe(false)
  })
})
