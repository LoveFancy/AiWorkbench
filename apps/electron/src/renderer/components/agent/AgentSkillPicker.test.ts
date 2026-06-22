import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import type { SkillMeta } from '@proma/shared'
import { filterEnabledSkillsForPicker } from './AgentSkillPicker'

const source = await Bun.file(join(import.meta.dir, 'AgentSkillPicker.tsx')).text()

const skills: SkillMeta[] = [
  { slug: 'ardot-design-assistant', name: 'ardot-design-assistant', description: 'Use this skill for any visual design task.', enabled: true, sourceKind: 'workspace' },
  { slug: 'multi-modal', name: '多模态内容生成', description: '支持文生视频、文生图等能力。', enabled: true, sourceKind: 'workspace' },
  { slug: 'disabled-skill', name: 'disabled-skill', description: '不可用', enabled: false, sourceKind: 'workspace' },
]

describe('AgentSkillPicker helpers', () => {
  test('只返回启用的 Skill，并按名称、slug、描述搜索', () => {
    expect(filterEnabledSkillsForPicker(skills, '').map((skill) => skill.slug)).toEqual([
      'ardot-design-assistant',
      'multi-modal',
    ])
    expect(filterEnabledSkillsForPicker(skills, 'video').map((skill) => skill.slug)).toEqual([])
    expect(filterEnabledSkillsForPicker(skills, '文生').map((skill) => skill.slug)).toEqual(['multi-modal'])
    expect(filterEnabledSkillsForPicker(skills, 'ardot').map((skill) => skill.slug)).toEqual(['ardot-design-assistant'])
  })

  test('Skill 列表使用固定 Skill 图标，不显示首字母头像', () => {
    expect(source).toContain('<WandSparkles className="mt-0.5 size-4 shrink-0 text-violet-500" />')
    expect(source).not.toContain('getSkillAvatarText')
  })

  test('技能入口使用带下拉箭头的触发按钮', () => {
    expect(source).toContain('ChevronDown')
    expect(source).toContain('<span className="text-[13px] font-medium">技能</span>')
  })
})
