import { describe, expect, test } from 'bun:test'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

interface SkillFrontmatter {
  filePath: string
  name: string
  description: string
  version: string
}

const defaultSkillsDir = join(import.meta.dir, '../../../default-skills')
const bundledPluginsDir = join(import.meta.dir, '../../../bundled-plugins')

function parseFrontmatter(filePath: string): SkillFrontmatter {
  const source = readFileSync(filePath, 'utf-8')
  const match = source.match(/^---\n(?<frontmatter>[\s\S]*?)\n---/)
  if (!match?.groups?.frontmatter) {
    throw new Error(`缺少 frontmatter: ${filePath}`)
  }

  const frontmatter = match.groups.frontmatter
  const name = frontmatter.match(/^name:\s*(.+)$/m)?.[1]?.trim().replace(/^"|"$/g, '') ?? ''
  const version = frontmatter.match(/^version:\s*(.+)$/m)?.[1]?.trim().replace(/^"|"$/g, '') ?? ''
  const foldedDescription = frontmatter.match(/^description:\s*>\n(?<body>(?:\s+.+\n?)+)/m)
  const description = foldedDescription ? null : frontmatter.match(/^description:\s*(?:"([^"]+)"|(.+))$/m)

  return {
    filePath,
    name,
    description: (description?.[1] ?? description?.[2] ?? foldedDescription?.groups?.body ?? '').trim(),
    version,
  }
}

function listDefaultSkillFrontmatters(): SkillFrontmatter[] {
  return readdirSync(defaultSkillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => parseFrontmatter(join(defaultSkillsDir, entry.name, 'SKILL.md')))
}

function listBundledPluginSkillFrontmatters(): SkillFrontmatter[] {
  return readdirSync(bundledPluginsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((plugin) => {
      const skillsDir = join(bundledPluginsDir, plugin.name, 'skills')
      if (!existsSync(skillsDir)) return []
      return readdirSync(skillsDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => parseFrontmatter(join(skillsDir, entry.name, 'SKILL.md')))
    })
}

function expectChineseDescription(skill: SkillFrontmatter): void {
  expect(skill.description, `${skill.filePath} 应提供中文说明`).toMatch(/[\u4e00-\u9fa5]/)
  expect(skill.description, `${skill.filePath} 不应保留英文触发说明开头`).not.toMatch(/^(Use|Always|Helps|Create)\b/)
}

describe('内置 Skill 元数据', () => {
  test('默认 Skill 使用中文说明，并将 proma-coach 更名为 workmate-coach', () => {
    const skills = listDefaultSkillFrontmatters()

    expect(skills.map((skill) => skill.name)).not.toContain('proma-coach')
    expect(skills.map((skill) => skill.name)).not.toContain('web-search')
    expect(skills.map((skill) => skill.name)).toContain('workmate-coach')
    for (const skill of skills) {
      expectChineseDescription(skill)
      expect(skill.version, `${skill.filePath} 修改默认 Skill 内容时必须提供版本号`).toMatch(/^\d+\.\d+\.\d+$/)
    }
  })

  test('内置插件 Skill 使用中文说明', () => {
    for (const skill of listBundledPluginSkillFrontmatters()) {
      expectChineseDescription(skill)
    }
  })
})
