import { expect, test } from 'bun:test'
import { join } from 'node:path'

const source = await Bun.file(join(import.meta.dir, 'AgentSkillsView.tsx')).text()
const skillCardSource = await Bun.file(join(import.meta.dir, 'SkillCard.tsx')).text()

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

test('技能页在导入旁边提供上传 Skill zip 包入口', () => {
  expect(source).toContain('handleInstallSkillZip')
  expect(source).toContain('window.electronAPI.installSkillZip(data.workspaceSlug)')
  expect(source).toContain('上传 Zip')
  expect(source.indexOf('上传 Zip')).toBeLessThan(source.indexOf('<span>导入</span>'))
})

test('已安装 Skill 卡片支持彻底删除 Skill 内容', () => {
  expect(source).toContain('onRequestDelete={setPendingDeleteSkill}')
  expect(source).toContain('onRequestDelete: (skill: SkillMeta) => void')
  expect(source).toContain('onRequestDelete={() => onRequestDelete(skill)}')
  expect(source).toContain('删除后会彻底移除该 Skill 目录和其中所有内容')
  expect(skillCardSource).toContain('Trash2')
  expect(skillCardSource).toContain('onRequestDelete')
  expect(skillCardSource).toContain('删除')
  expect(skillCardSource).not.toContain('{!isBuiltin && (')
})
