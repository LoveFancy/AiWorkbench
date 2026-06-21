import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const manualSkillPath = join(import.meta.dir, '../../../default-skills/workmate-manual/SKILL.md')
const source = readFileSync(manualSkillPath, 'utf-8')
const frontmatter = source.match(/^---\n(?<frontmatter>[\s\S]*?)\n---/)?.groups?.frontmatter ?? ''
const description = frontmatter.match(/^description:\s*(?:"([^"]+)"|(.+))$/m)
const descriptionText = (description?.[1] ?? description?.[2] ?? '').trim()

test('使用手册 Skill 不在候选提示中暴露 Proma 品牌', () => {
  expect(descriptionText).toContain('WorkMate')
  expect(descriptionText).not.toContain('Proma')
  expect(source).not.toContain('WorkMate/Proma')
  expect(source).not.toContain('原 Proma')
})
