import { expect, test } from 'bun:test'
import { join } from 'node:path'

const source = await Bun.file(join(import.meta.dir, 'AgentSkillsView.tsx')).text()
const skillCardSource = await Bun.file(join(import.meta.dir, 'SkillCard.tsx')).text()
const skillMarketPanelSource = await Bun.file(join(import.meta.dir, 'SkillMarketPanel.tsx')).text()
const skillMarketCardSource = await Bun.file(join(import.meta.dir, 'SkillMarketCard.tsx')).text()
const skillMarketDetailSheetSource = await Bun.file(join(import.meta.dir, 'SkillMarketDetailSheet.tsx')).text()
const pluginDetailSheetSource = await Bun.file(join(import.meta.dir, 'PluginDetailSheet.tsx')).text()

test('技能页提供技能市场和已安装二级切换', () => {
  expect(source).toContain('技能市场')
  expect(source).toContain('已安装')
  expect(source).toContain("useState<'market' | 'installed'>('market')")
  expect(source).toContain('SkillViewTab')
})

test('技能市场使用小卡片和详情抽屉', () => {
  expect(source).toContain('<SkillMarketPanel')
})

test('已安装区块区分插件和技能', () => {
  expect(source).toContain('skills={standaloneFilteredSkills}')
  expect(source).toContain('InstalledCapabilityGrid')
  expect(source).toContain('PluginDetailSheet')
  expect(source).toContain('isBuiltin={(slug) => data.defaultSkillSlugs.has(slug)}')
})

test('技能市场不展示分类 Tab 且按页加载结果', () => {
  expect(skillMarketPanelSource).not.toContain('MARKET_CATEGORIES')
  expect(skillMarketPanelSource).not.toContain("'推荐'")
  expect(skillMarketPanelSource).not.toContain('skills.slice(0, 12)')
  expect(skillMarketPanelSource).toContain('SKILLHUB_PAGE_SIZE')
  expect(skillMarketPanelSource).not.toContain('while (true)')
  expect(skillMarketPanelSource).toContain('useDebouncedValue')
  expect(skillMarketPanelSource).toContain('loadMoreRef')
  expect(skillMarketPanelSource).toContain('hasMore')
  expect(skillMarketPanelSource).toContain('skills.map((skill)')
})

test('技能市场卡片样式对齐已安装 Skill 卡片', () => {
  expect(skillMarketCardSource).toContain('rounded-xl')
  expect(skillMarketCardSource).toContain('line-clamp-2')
  expect(skillMarketCardSource).toContain('ShieldCheck')
  expect(skillMarketCardSource).toContain('华泰 SkillHub')
  expect(skillMarketPanelSource).toContain('Package')
  expect(skillMarketPanelSource).toContain('插件套件')
})

test('切换已安装 Skill 状态后保留当前技能二级 Tab', () => {
  expect(source).toContain('skillView={skillView}')
  expect(source).toContain('onSkillViewChange={setSkillView}')
  expect(source).not.toContain("function SkillsTab({ skills, total, updateCount, updatingSkill, isBuiltin, workspaceSlug, query, installedSkillNames, onInstalled, onOpen, onToggle, onUpdate }: SkillsTabProps): React.ReactElement {\n  const [skillView, setSkillView] = React.useState<'market' | 'installed'>('market')")
})

test('从市场安装完成后跳转到已安装二级页', () => {
  expect(source).toContain("onInstalled={async () => {\n                  bumpCapabilities((v) => v + 1)\n                  await loadInstalledPlugins()\n                  setSkillView('installed')\n                }}")
})

test('技能页通过添加弹窗提供上传 zip 和跨工作区导入入口', () => {
  expect(source).toContain('handleInstallSkillZip')
  expect(source).toContain('window.electronAPI.installSkillZip(data.workspaceSlug)')
  expect(source).toContain('showSkillAddDialog')
  expect(source).toContain('添加技能')
  expect(source).toContain('上传 Zip')
  expect(source).toContain('从其他工作区导入')
})

test('已安装 Skill 只能在详情侧栏彻底删除', () => {
  expect(source).toContain('onRequestDelete={() => selectedSkill && setPendingDeleteSkill(selectedSkill)}')
  expect(source).toContain('删除后会彻底移除该 Skill 目录和其中所有内容')
  expect(skillCardSource).not.toContain('Trash2')
  expect(skillCardSource).not.toContain('onRequestDelete')
})

test('外部入口可指定打开技能 Tab', () => {
  expect(source).toContain("React.useEffect(() => {\n    setTab(initialTab)\n  }, [initialTab])")
})

test('技能市场区分华泰 SkillHub 和插件市场，不再展示推荐分类', () => {
  expect(skillMarketPanelSource).toContain("label: '华泰 SkillHub'")
  expect(skillMarketPanelSource).toContain("label: '插件市场'")
  expect(skillMarketPanelSource).toContain('PluginMarketContent')
  expect(skillMarketPanelSource).toContain('添加市场')
  expect(skillMarketPanelSource).toContain('MoreHorizontal')
  expect(skillMarketPanelSource).toContain('removeAgentPluginMarketplace')
  expect(skillMarketPanelSource).toContain('getAgentPluginMarketplaceDetail')
  expect(skillMarketPanelSource).toContain('<PluginDetailSheet')
  expect(skillMarketPanelSource).not.toContain("'推荐'")
  expect(skillMarketPanelSource).not.toContain('MARKET_CATEGORIES')
})

test('Agent 技能页添加插件市场支持公开和 Token 认证选择', () => {
  expect(skillMarketPanelSource).toContain('marketplaceAuthMode')
  expect(skillMarketPanelSource).toContain('访问方式')
  expect(skillMarketPanelSource).toContain('公开市场')
  expect(skillMarketPanelSource).toContain('Token 认证')
  expect(skillMarketPanelSource).toContain('marketplaceTokenInput')
  expect(skillMarketPanelSource).toContain("auth: marketplaceAuthMode === 'token'")
})

test('Agent 技能页添加插件市场支持隐蔽配置读取分支', () => {
  expect(skillMarketPanelSource).toContain("React.useState('main')")
  expect(skillMarketPanelSource).toContain('高级选项')
  expect(skillMarketPanelSource).toContain('读取分支')
  expect(skillMarketPanelSource).toContain('marketplaceBranchInput')
  expect(skillMarketPanelSource).toContain('branch: marketplaceBranchInput.trim() || inferred.branch ||')
})

test('插件详情仅在市场版本高于本地版本时展示更新按钮', () => {
  expect(pluginDetailSheetSource).toContain('isPluginUpdateAvailable')
  expect(pluginDetailSheetSource).toContain('updateAvailable')
  expect(pluginDetailSheetSource).not.toContain("plugin.installed ? installing ? '更新中' : '更新'")
})

test('技能市场来源切换展示职责和适用方式说明', () => {
  expect(skillMarketPanelSource).toContain("description: '公司内部维护的 Skill 能力库，适合安装经过团队沉淀和权限认证的工作流技能。'")
  expect(skillMarketPanelSource).toContain("description: 'Claude Code 插件生态入口，适合安装包含 Skills、Commands、Agents 或 MCP 的插件包。'")
  expect(skillMarketPanelSource).toContain("import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'")
  expect(skillMarketPanelSource).toContain('Info')
  expect(skillMarketPanelSource).toContain('{item.description}')
})

test('刷新动作按当前可见区域局部处理', () => {
  expect(source).toContain("{tab !== 'skills' && (")
  expect(source).toContain('onRefreshInstalled={handleRefreshInstalledSkills}')
  expect(source).toContain('onClick={() => void onRefreshInstalled()}')
  expect(source).toContain("title=\"刷新已安装技能\"")
  expect(source).toContain('刷新已安装')
  expect(skillMarketPanelSource).toContain('handleRefreshSkillHub')
  expect(skillMarketPanelSource).toContain("title=\"刷新 SkillHub\"")
  expect(skillMarketPanelSource).toContain('刷新 SkillHub')
  expect(skillMarketPanelSource).toContain('handleRefreshCurrentPluginMarket')
  expect(skillMarketPanelSource).toContain("title=\"刷新插件市场\"")
  expect(skillMarketPanelSource).toContain('刷新插件市场')
})

test('插件详情抽屉使用收窄宽度避免占据过多主界面', () => {
  expect(pluginDetailSheetSource).toContain('w-full sm:w-[46vw] sm:min-w-[520px] sm:max-w-[760px]')
  expect(pluginDetailSheetSource).not.toContain('w-[62vw] min-w-[680px] max-w-[1100px]')
})

test('未安装的市场插件详情提示安装后查看具体能力', () => {
  expect(pluginDetailSheetSource).toContain('安装后可查看具体 Skill、命令、智能体和 MCP 能力')
  expect(pluginDetailSheetSource).toContain('市场插件需要安装到本地后，才能读取插件包内的能力清单。')
  expect(pluginDetailSheetSource).toContain('emptyCapabilityMessage')
})

test('技能市场详情抽屉展示元信息并避免重复描述正文', () => {
  expect(skillMarketDetailSheetSource).toContain('shouldRenderContent')
  expect(skillMarketDetailSheetSource).toContain('buildMetadataRows')
  expect(skillMarketDetailSheetSource).toContain('SettingsCard')
  expect(skillMarketDetailSheetSource).toContain('skill.tags.slice(0, 8)')
  expect(skillMarketDetailSheetSource).toContain('downloadCount')
  expect(skillMarketDetailSheetSource).toContain("value: '华泰 SkillHub'")
  expect(skillMarketDetailSheetSource).toContain('暂无更多详情')
})
