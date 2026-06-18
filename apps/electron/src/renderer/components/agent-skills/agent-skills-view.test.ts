import { expect, test } from 'bun:test'
import { join } from 'node:path'

const source = await Bun.file(join(import.meta.dir, 'AgentSkillsView.tsx')).text()

test('技能页提供技能市场和已安装二级切换', () => {
  expect(source).toContain('技能市场')
  expect(source).toContain('已安装')
  expect(source).toContain("useState<'market' | 'installed'>('market')")
  expect(source).toContain('SkillViewTab')
})

test('技能市场使用小卡片和详情抽屉', () => {
  expect(source).toContain('<SkillMarketPanel')
})

test('已安装区块展示所有本地技能，包含内置技能', () => {
  expect(source).toContain('skills={filteredSkills}')
  expect(source).toContain('isBuiltin={(slug) => data.defaultSkillSlugs.has(slug)}')
})

test('切换已安装 Skill 状态后保留当前技能二级 Tab', () => {
  expect(source).toContain('skillView={skillView}')
  expect(source).toContain('onSkillViewChange={setSkillView}')
  expect(source).not.toContain("function SkillsTab({ skills, total, updateCount, updatingSkill, isBuiltin, workspaceSlug, query, installedSkillNames, onInstalled, onOpen, onToggle, onUpdate }: SkillsTabProps): React.ReactElement {\n  const [skillView, setSkillView] = React.useState<'market' | 'installed'>('market')")
})
