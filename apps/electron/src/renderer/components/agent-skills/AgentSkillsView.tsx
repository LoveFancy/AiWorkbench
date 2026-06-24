/**
 * AgentSkillsView — Agent 能力全屏视图
 *
 * 由侧边栏「Agent 技能」入口触发，全屏占据中间内容区（隐藏 TabBar 与右侧文件面板）。
 *
 * 结构：
 * - 顶部：标题 + 工作区切换下拉
 * - 工具条：专家 / 技能 / 连接器切换 + 搜索 + 社区市场（占位）+ 新增入口
 * - 内容：能力卡片网格（商店风），点击卡片打开右侧详情抽屉
 */

import * as React from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { toast } from 'sonner'
import { Blocks, ChevronDown, Search, Plus, FolderOpen, Check, Mail, Upload, RefreshCw, Package, Loader2, XCircle, Unplug, ShieldCheck, Trash2, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Switch } from '@/components/ui/switch'
import { agentExpertGroupsAtom, loadAgentExpertGroupsAtom, workspaceCapabilitiesVersionAtom } from '@/atoms/agent-atoms'
import { loadRemoteExpertDataAtom } from '@/experts/atoms/expert-remote'
import { useProjectActions } from '@/hooks/useProjectActions'
import { ExpertPageView } from '@/experts/views/ExpertPageView'
import { ExpertImportButton } from '@/experts/shared/ExpertImportDropdown'
import { ExpertFilterPills, type FilterTag } from '@/experts/shared/ExpertFilterPills'
import type { AgentPluginInfo, DefaultConnectorInitStep, McpServerEntry, SkillMeta } from '@proma/shared'
import { isVisibleInSkillsView } from '@proma/shared'
import { getCapabilityTabs, type CapabilityTab } from './capability-tabs'
import { useAgentSkillsData } from './useAgentSkillsData'
import { SkillCard } from './SkillCard'
import { McpCard } from './McpCard'
import { SkillDetailSheet } from './SkillDetailSheet'
import { PluginDetailSheet } from './PluginDetailSheet'
import { McpDetailSheet } from './McpDetailSheet'
import { ImportSkillDialog } from './ImportSkillDialog'
import { FeishuCliConnectorDialog } from './FeishuCliConnectorDialog'
import { SkillMarketPanel } from './SkillMarketPanel'
import { sortInstalledCapabilities } from './installed-capabilities'
import {
  getPresetConnectorDefinitions,
  getAllConnectorDefinitions,
  type PresetConnectorDefinition,
} from './default-connectors'

const HUATAI_EMAIL_DOMAIN = 'htsc.com'

function getHuataiEmailLocalPart(emailAddress: string): string {
  const trimmed = emailAddress.trim()
  const withoutDomain = trimmed.endsWith(`@${HUATAI_EMAIL_DOMAIN}`)
    ? trimmed.slice(0, -(`@${HUATAI_EMAIL_DOMAIN}`.length))
    : trimmed
  return withoutDomain.split('@')[0] ?? ''
}

interface AgentSkillsViewProps {
  initialTab?: CapabilityTab
}

export function AgentSkillsView({ initialTab = 'experts' }: AgentSkillsViewProps): React.ReactElement {
  const data = useAgentSkillsData()
  const expertGroups = useAtomValue(agentExpertGroupsAtom)
  const loadExpertGroups = useSetAtom(loadAgentExpertGroupsAtom)
  const loadRemoteExpertData = useSetAtom(loadRemoteExpertDataAtom)
  const bumpCapabilities = useSetAtom(workspaceCapabilitiesVersionAtom)
  const { workspaces, currentWorkspaceId, selectProject } = useProjectActions()

  const [tab, setTab] = React.useState<CapabilityTab>(initialTab)
  const [skillView, setSkillView] = React.useState<'market' | 'installed'>('market')
  const [search, setSearch] = React.useState('')
  const [expertFilterTag, setExpertFilterTag] = React.useState<FilterTag>('all')
  const [expertCategory, setExpertCategory] = React.useState('all')
  const [selectedSkillSlug, setSelectedSkillSlug] = React.useState<string | null>(null)
  const [mcpSheetOpen, setMcpSheetOpen] = React.useState(false)
  const [editingMcp, setEditingMcp] = React.useState<{ name: string; entry: McpServerEntry } | null>(null)
  const [showImport, setShowImport] = React.useState(false)
  const [showSkillAddDialog, setShowSkillAddDialog] = React.useState(false)
  const [wsPopoverOpen, setWsPopoverOpen] = React.useState(false)
  const [pendingDeleteSkill, setPendingDeleteSkill] = React.useState<SkillMeta | null>(null)
  const [installedPlugins, setInstalledPlugins] = React.useState<AgentPluginInfo[]>([])
  const [pluginLoading, setPluginLoading] = React.useState(false)
  const [selectedPluginId, setSelectedPluginId] = React.useState<string | null>(null)
  const [togglingPlugin, setTogglingPlugin] = React.useState<string | null>(null)
  const [uninstallingPlugin, setUninstallingPlugin] = React.useState<string | null>(null)
  const [pendingDeleteMcpName, setPendingDeleteMcpName] = React.useState<string | null>(null)
  const [isDeletingSkill, setIsDeletingSkill] = React.useState(false)
  const [isDeletingMcp, setIsDeletingMcp] = React.useState(false)
  const [isInstallingSkillZip, setIsInstallingSkillZip] = React.useState(false)
  const [isRefreshingExperts, setIsRefreshingExperts] = React.useState(false)
  const [activeDefaultConnector, setActiveDefaultConnector] = React.useState<string | null>(null)
  const [feishuCliConnected, setFeishuCliConnected] = React.useState(false)
  const [connectorEnabledMap, setConnectorEnabledMap] = React.useState<Record<string, boolean>>({})
  const [connectorsConfig, setConnectorsConfig] = React.useState<import('@proma/shared').ConnectorsConfig | null>(null)
  const [unbindingFeishu, setUnbindingFeishu] = React.useState(false)

  React.useEffect(() => {
    setTab(initialTab)
  }, [initialTab])

  // 检查飞书 CLI 连接状态 + 加载连接器 enabled 状态
  React.useEffect(() => {
    window.electronAPI.getFeishuCliAuthStatus().then((s) => {
      setFeishuCliConnected(s.status === 'connected')
    }).catch(() => {})
    void loadConnectorEnabledMap()
  }, [data.workspaceSlug, data.loading])

  const loadConnectorEnabledMap = React.useCallback(async () => {
    if (!data.workspaceSlug) return
    try {
      const config = await window.electronAPI.getConnectorsConfig(data.workspaceSlug)
      setConnectorsConfig(config)
      const map: Record<string, boolean> = {}
      for (const [name, c] of Object.entries(config.connectors)) {
        map[name] = c.enabled
      }
      setConnectorEnabledMap(map)
    } catch { /* connectors 目录可能尚未同步 */ }
  }, [data.workspaceSlug])

  // 从 connectors.json 派生预设连接器列表（替代硬编码）
  const presetConnectors = React.useMemo(
    () => getPresetConnectorDefinitions(connectorsConfig),
    [connectorsConfig],
  )

  const handleToggleDefaultConnector = React.useCallback(async (connectorId: string, enabled: boolean) => {
    setConnectorEnabledMap((prev) => ({ ...prev, [connectorId]: enabled }))
    try {
      const config = await window.electronAPI.getConnectorsConfig(data.workspaceSlug)
      const connector = config.connectors[connectorId]
      if (!connector) {
        // 回滚乐观 UI 更新
        setConnectorEnabledMap((prev) => ({ ...prev, [connectorId]: !enabled }))
        return
      }
      await window.electronAPI.saveConnectorsConfig(data.workspaceSlug, {
        ...config,
        connectors: {
          ...config.connectors,
          [connectorId]: { ...connector, enabled },
        },
      })
      bumpCapabilities((v) => v + 1)
    } catch (e) {
      // 回滚 UI
      setConnectorEnabledMap((prev) => ({ ...prev, [connectorId]: !enabled }))
      toast.error('切换连接器状态失败', { description: (e as Error).message })
    }
  }, [data.workspaceSlug, bumpCapabilities])

  const handleUnbindFeishu = React.useCallback(async (): Promise<void> => {
    if (unbindingFeishu) return
    setUnbindingFeishu(true)
    try {
      await window.electronAPI.unbindFeishuCli()
      setFeishuCliConnected(false)
      // 禁用连接器
      setConnectorEnabledMap((prev) => ({ ...prev, 'feishu-cli': false }))
      bumpCapabilities((v) => v + 1)
      toast.success('已解绑飞书 CLI')
    } catch (e) {
      toast.error('解绑飞书 CLI 失败', { description: (e as Error).message })
    } finally {
      setUnbindingFeishu(false)
    }
  }, [unbindingFeishu, bumpCapabilities])

  const loadInstalledPlugins = React.useCallback(async (): Promise<void> => {
    setPluginLoading(true)
    try {
      const plugins = await window.electronAPI.listAgentPlugins()
      setInstalledPlugins(plugins.filter(isVisibleInSkillsView))
    } catch (error) {
      console.error('[Agent 技能] 加载插件失败:', error)
      toast.error('加载已安装插件失败', { description: error instanceof Error ? error.message : '未知错误' })
    } finally {
      setPluginLoading(false)
    }
  }, [])

  React.useEffect(() => {
    if (tab !== 'skills') return
    void loadInstalledPlugins()
  }, [data.skills.length, loadInstalledPlugins, tab])

  const q = search.trim().toLowerCase()

  const filteredSkills = React.useMemo(() => {
    if (!q) return data.skills
    return data.skills.filter((s) =>
      s.name.toLowerCase().includes(q) ||
      s.slug.toLowerCase().includes(q) ||
      (s.description ?? '').toLowerCase().includes(q),
    )
  }, [data.skills, q])

  const filteredInstalledPlugins = React.useMemo(() => {
    if (!q) return installedPlugins
    return installedPlugins.filter((plugin) =>
      [
        plugin.name,
        plugin.description,
        plugin.author,
        plugin.version,
        plugin.sourceMarketplaceId,
        ...plugin.keywords,
        ...plugin.capabilities.map((capability) => `${capability.name} ${capability.description ?? ''}`),
      ].filter(Boolean).join(' ').toLowerCase().includes(q),
    )
  }, [installedPlugins, q])

  const pluginSkillNames = React.useMemo(() => {
    return new Set(installedPlugins.flatMap((plugin) =>
      plugin.capabilities
        .filter((capability) => capability.type === 'skill')
        .map((capability) => capability.name),
    ))
  }, [installedPlugins])

  const standaloneFilteredSkills = React.useMemo(
    () => filteredSkills.filter((skill) => !pluginSkillNames.has(skill.slug) && !pluginSkillNames.has(skill.name)),
    [filteredSkills, pluginSkillNames],
  )

  const updateCount = data.skills.filter((s) => s.hasUpdate).length
  const installedSkillNames = React.useMemo(() => new Set(data.skills.map((skill) => skill.name)), [data.skills])

  // 连接器总数（预置 + 自定义）
  const mcpCount = React.useMemo(
    () => getAllConnectorDefinitions(connectorsConfig, data.mcpConfig.servers).length,
    [connectorsConfig, data.mcpConfig.servers],
  )

  // 过滤后的连接器列表（供 JSX 直接使用，不在条件渲染中调用 hooks）
  const filteredConnectors = React.useMemo(() => {
    const defs = getAllConnectorDefinitions(connectorsConfig, data.mcpConfig.servers)
    const q = search.toLowerCase()
    if (!q) return defs
    return defs.filter((c) =>
      c.name.toLowerCase().includes(q) ||
      c.description.toLowerCase().includes(q) ||
      c.category.toLowerCase().includes(q),
    )
  }, [search, connectorsConfig, data.mcpConfig.servers])
  const presetConnectorServers = React.useMemo(() => {
    return Object.fromEntries(
      presetConnectors
        .filter((connector) => connector.serverName)
        .map((connector) => [connector.id, data.mcpConfig.servers[connector.serverName as string]]),
    ) as Partial<Record<string, McpServerEntry>>
  }, [data.mcpConfig.servers, presetConnectors])
  const capabilityTabs = React.useMemo(
    () => getCapabilityTabs({ experts: expertGroups.length, skills: data.skills.length, connectors: mcpCount }),
    [data.skills.length, expertGroups.length, mcpCount],
  )

  const selectedSkill = data.skills.find((s) => s.slug === selectedSkillSlug) ?? null
  const selectedIsBuiltin = selectedSkill ? data.defaultSkillSlugs.has(selectedSkill.slug) : false
  const selectedPlugin = installedPlugins.find((plugin) => plugin.id === selectedPluginId) ?? null

  const openSkillFolder = (slug: string): void => {
    if (data.skillsDir) window.electronAPI.openFile(`${data.skillsDir}/${slug}`)
  }

  const handleInstallSkillZip = async (): Promise<void> => {
    if (isInstallingSkillZip) return
    setIsInstallingSkillZip(true)
    try {
      const installed = await window.electronAPI.installSkillZip(data.workspaceSlug)
      if (!installed) return
      bumpCapabilities((v) => v + 1)
      await loadInstalledPlugins()
      setSkillView('installed')
      toast.success(`已上传 Skill：${installed.name}`)
    } catch (error) {
      console.error('[Agent 技能] 上传 Skill zip 包失败:', error)
      const message = error instanceof Error ? error.message : '未知错误'
      toast.error('上传 Skill zip 包失败', { description: message })
    } finally {
      setIsInstallingSkillZip(false)
    }
  }

  const handleRefreshExperts = async (): Promise<void> => {
    if (isRefreshingExperts) return
    setIsRefreshingExperts(true)
    try {
      await Promise.all([loadExpertGroups(), loadRemoteExpertData()])
      toast.success('专家团列表已刷新')
    } catch (error) {
      console.error('[Agent 技能] 刷新专家团失败:', error)
      toast.error('刷新专家团失败')
    } finally {
      setIsRefreshingExperts(false)
    }
  }

  const handleRefreshCurrentTab = async (): Promise<void> => {
    if (tab === 'experts') {
      await handleRefreshExperts()
      return
    }
    bumpCapabilities((v) => v + 1)
    toast.success('连接器列表已刷新')
  }

  const handleRefreshInstalledSkills = async (): Promise<void> => {
    bumpCapabilities((v) => v + 1)
    await loadInstalledPlugins()
  }

  const handleTogglePlugin = async (plugin: AgentPluginInfo, enabled: boolean): Promise<void> => {
    if (togglingPlugin) return
    setTogglingPlugin(plugin.id)
    try {
      await window.electronAPI.setAgentPluginEnabled(plugin.id, enabled)
      await loadInstalledPlugins()
      bumpCapabilities((v) => v + 1)
      toast.success(enabled ? '插件已启用' : '插件已禁用')
    } catch (error) {
      toast.error('更新插件状态失败', { description: error instanceof Error ? error.message : '未知错误' })
    } finally {
      setTogglingPlugin(null)
    }
  }

  const handleUninstallPlugin = async (plugin: AgentPluginInfo): Promise<void> => {
    if (uninstallingPlugin) return
    setUninstallingPlugin(plugin.id)
    try {
      await window.electronAPI.uninstallAgentPlugin(plugin.id)
      setSelectedPluginId(null)
      await loadInstalledPlugins()
      bumpCapabilities((v) => v + 1)
      toast.success('插件已卸载')
    } catch (error) {
      toast.error('卸载插件失败', { description: error instanceof Error ? error.message : '未知错误' })
    } finally {
      setUninstallingPlugin(null)
    }
  }

  if (!data.hasWorkspace) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <div className="flex size-16 items-center justify-center rounded-2xl bg-foreground/[0.04]">
          <Blocks className="size-8 text-foreground/30" />
        </div>
        <div className="text-[15px] font-medium text-foreground/80">未选择工作区</div>
        <div className="max-w-sm text-[13px] text-foreground/50">
          请先在 Agent 模式下选择或创建一个工作区，再来管理它的专家、技能与连接器。
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* 标题栏 + 工作区切换 */}
      {/* 不加 titlebar-drag-region：与 DropdownMenu 嵌套时 drag/no-drag 会让 Radix 拿不到
          pointerdown，下拉打不开。窗口拖拽由 AppShell 顶部 0–50px 的全局 drag 层兜底。
          pt-14 让按钮整体位于全局 drag 层（0–50px, z-50）下方，避免被吃掉点击。 */}
      <div className="titlebar-no-drag mx-auto flex w-full max-w-6xl shrink-0 items-center justify-between px-8 pt-14 pb-4">
        <div className="flex items-center gap-2.5">
          <Blocks className="size-6 text-foreground/70" />
          <h1 className="text-2xl font-semibold text-foreground">Agent 技能</h1>
        </div>

        <Popover open={wsPopoverOpen} onOpenChange={setWsPopoverOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="titlebar-no-drag flex items-center gap-2 rounded-lg border border-border/60 bg-content-area px-3 py-1.5 text-[13px] font-medium text-foreground/80 transition-colors hover:bg-foreground/[0.04]"
            >
              <FolderOpen size={14} className="text-foreground/45" />
              <span className="max-w-[180px] truncate">{data.workspaceName}</span>
              <ChevronDown size={14} className="text-foreground/45" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="max-h-[320px] w-56 overflow-y-auto scrollbar-thin p-1">
            {workspaces.map((w) => (
              <button
                key={w.id}
                type="button"
                onClick={() => {
                  if (w.id !== currentWorkspaceId) {
                    selectProject(w.id)
                    toast.success(`已切换到工作区「${w.name}」`)
                  }
                  setWsPopoverOpen(false)
                }}
                className={cn(
                  'flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors',
                  w.id === currentWorkspaceId
                    ? 'bg-accent text-accent-foreground'
                    : 'text-foreground/80 hover:bg-accent/50',
                )}
              >
                <span className="truncate">{w.name}</span>
                {w.id === currentWorkspaceId && <Check size={14} className="shrink-0 text-primary" />}
              </button>
            ))}
          </PopoverContent>
        </Popover>
      </div>

      {/* 工具条 */}
      <div className="titlebar-no-drag mx-auto flex w-full max-w-6xl shrink-0 items-center gap-3 px-8 pb-4">
        {/* 专家 / 技能 / 连接器切换 */}
        <div className="relative flex h-8 items-stretch rounded-xl bg-muted p-0.5">
          <div
            className={cn(
              'absolute bottom-0.5 top-0.5 w-[calc(33.333%-3px)] rounded-lg bg-background shadow-sm transition-transform duration-300 ease-in-out',
              tab === 'experts' ? 'translate-x-0' : tab === 'skills' ? 'translate-x-[100%]' : 'translate-x-[200%]',
            )}
          />
          {capabilityTabs.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setTab(value)}
              className={cn(
                'relative z-[1] flex min-w-[96px] items-center justify-center gap-1.5 rounded-lg px-4 text-sm font-medium transition-colors duration-200',
                tab === value ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* 搜索框 */}
        <div className="flex h-8 flex-1 items-center gap-2 rounded-lg border border-border/60 bg-content-area px-3 transition-colors focus-within:border-primary/40">
          <Search size={14} className="shrink-0 text-foreground/40" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tab === 'experts' ? '搜索专家、角色、技能...' : tab === 'skills' ? '搜索技能...' : '搜索连接器...'}
            className="w-full bg-transparent text-[13px] text-foreground placeholder:text-foreground/35 focus:outline-none"
          />
        </div>

        {tab === 'experts' && (
          <ExpertFilterPills
            value={expertFilterTag}
            onChange={setExpertFilterTag}
            counts={{}}
          />
        )}

        {/* 顶层刷新只处理没有二级来源的页面；技能页由市场/已安装区域各自刷新。 */}
        {tab !== 'skills' && (
          <button
            type="button"
            onClick={() => void handleRefreshCurrentTab()}
            disabled={tab === 'experts' && isRefreshingExperts}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/60 bg-content-area text-foreground/80 shadow-sm transition-colors hover:bg-foreground/[0.04] disabled:cursor-not-allowed disabled:opacity-60"
            title={tab === 'experts' ? '刷新专家' : '刷新连接器'}
          >
            <RefreshCw size={14} className={tab === 'experts' && isRefreshingExperts ? 'animate-spin' : undefined} />
          </button>
        )}

        {/* Experts：打开本地目录 + 添加专家 */}
        {tab === 'experts' && (
          <button
            type="button"
            onClick={() => void window.electronAPI.openUserPluginsLocalDir().catch(() => toast.error('打开目录失败'))}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/60 bg-content-area text-foreground/80 shadow-sm transition-colors hover:bg-foreground/[0.04]"
            title="打开目录（手动放入自定义专家）"
          >
            <FolderOpen size={14} />
          </button>
        )}
        {tab === 'experts' && <ExpertImportButton label="添加专家" />}

        {/* Skills：打开默认 Skill 目录 + 添加 Skill */}
        {tab === 'skills' && (
          <button
            type="button"
            onClick={() => void window.electronAPI.openDefaultSkillsDir().catch(() => toast.error('打开目录失败'))}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/60 bg-content-area text-foreground/80 shadow-sm transition-colors hover:bg-foreground/[0.04]"
            title="打开目录（手动放入自定义技能）"
          >
            <FolderOpen size={14} />
          </button>
        )}
        {tab === 'skills' && (
          <button
            type="button"
            onClick={() => setShowSkillAddDialog(true)}
            className="flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-[13px] font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          >
            <Plus size={14} />
            <span>添加技能</span>
          </button>
        )}

        {/* 新增连接器 */}
        {tab === 'connectors' && (
          <button
            type="button"
            onClick={() => { setEditingMcp(null); setMcpSheetOpen(true) }}
            className="flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-[13px] font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          >
            <Plus size={14} />
            <span>添加连接器</span>
          </button>
        )}
      </div>

      {/* 内容 */}
      <div className={cn('min-h-0 flex-1', tab === 'experts' ? 'overflow-hidden' : 'overflow-y-auto scrollbar-thin')}>
        {tab === 'experts' ? (
          <ExpertPageView embedded query={search} filterTag={expertFilterTag} onFilterTagChange={setExpertFilterTag} category={expertCategory} onCategoryChange={setExpertCategory} />
        ) : (
          <div className="mx-auto w-full max-w-6xl px-8 pb-10">
            {data.loading ? (
              <div className="py-20 text-center text-sm text-muted-foreground">加载中...</div>
            ) : tab === 'skills' ? (
              <SkillsTab
                skillView={skillView}
                skills={standaloneFilteredSkills}
                total={data.skills.length}
                installedPlugins={filteredInstalledPlugins}
                pluginTotal={installedPlugins.length}
                pluginLoading={pluginLoading}
                updateCount={updateCount}
                updatingSkill={data.updatingSkill}
                isBuiltin={(slug) => data.defaultSkillSlugs.has(slug)}
                workspaceSlug={data.workspaceSlug}
                query={search}
                installedSkillNames={installedSkillNames}
                onInstalled={async () => {
                  bumpCapabilities((v) => v + 1)
                  await loadInstalledPlugins()
                  setSkillView('installed')
                }}
                onOpen={setSelectedSkillSlug}
                onOpenPlugin={setSelectedPluginId}
                onToggle={data.toggleSkill}
                onUpdate={data.updateSkill}
                onSkillViewChange={setSkillView}
                onRefreshInstalled={handleRefreshInstalledSkills}
              />
            ) : mcpCount === 0 ? (
              <EmptyState
                icon={<Plus className="size-8 text-foreground/30" />}
                title="还没有连接器"
                hint="点击右上角「添加连接器」开始，或在 Agent 模式下让 Proma 帮你查找并配置。"
                action={
                  <button
                    type="button"
                    onClick={() => { setEditingMcp(null); setMcpSheetOpen(true) }}
                    className="mt-2 flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
                  >
                    <Plus size={14} />
                    <span>添加连接器</span>
                  </button>
                }
              />
            ) : filteredConnectors.length === 0 ? (
              <EmptyState icon={<Search className="size-8 text-foreground/30" />} title="没有匹配的连接器" hint="试试更换搜索关键词。" />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {filteredConnectors.map((connector) => {
                  const serverEntry = connector.serverName ? data.mcpConfig.servers[connector.serverName] as McpServerEntry | undefined : undefined
                  const isPreset = connector.source === 'preset'
                  return (
                    <ConnectorCard
                      key={connector.id}
                      connector={connector}
                      server={serverEntry ?? null}
                      isFeishuConnected={feishuCliConnected}
                      enabled={connectorEnabledMap[connector.id] ?? false}
                      onOpen={() => {
                        if (isPreset) {
                          setActiveDefaultConnector(connector.id)
                        } else if (connector.serverName && serverEntry) {
                          setEditingMcp({ name: connector.serverName, entry: serverEntry })
                          setMcpSheetOpen(true)
                        }
                      }}
                      onToggle={(enabled) => {
                        if (isPreset) {
                          handleToggleDefaultConnector(connector.id, enabled)
                        } else if (connector.serverName) {
                          data.toggleMcp(connector.serverName, enabled)
                        }
                      }}
                      onUnbindFeishu={handleUnbindFeishu}
                      unbindingFeishu={unbindingFeishu}
                      onRequestDelete={() => !isPreset && connector.serverName && setPendingDeleteMcpName(connector.serverName)}
                      isBuiltin={(connector as any).isBuiltin}
                      lastTestResult={(connector as any).lastTestResult}
                    />
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 详情抽屉 */}
      <SkillDetailSheet
        skill={selectedSkill}
        workspaceSlug={data.workspaceSlug}
        isBuiltin={selectedIsBuiltin}
        updating={data.updatingSkill === selectedSkill?.slug}
        onOpenChange={(open) => { if (!open) setSelectedSkillSlug(null) }}
        onToggle={(enabled) => selectedSkill && data.toggleSkill(selectedSkill.slug, enabled)}
        onUpdate={() => selectedSkill && data.updateSkill(selectedSkill.slug)}
        onRequestDelete={() => selectedSkill && setPendingDeleteSkill(selectedSkill)}
        onOpenFolder={() => selectedSkill && openSkillFolder(selectedSkill.slug)}
        onChanged={() => bumpCapabilities((v) => v + 1)}
      />

      <PluginDetailSheet
        mode="installed"
        plugin={selectedPlugin}
        sourceLabel={selectedPlugin ? getInstalledPluginSourceLabel(selectedPlugin) : undefined}
        toggling={selectedPlugin ? togglingPlugin === selectedPlugin.id : false}
        uninstalling={selectedPlugin ? uninstallingPlugin === selectedPlugin.id : false}
        onOpenChange={(open) => { if (!open) setSelectedPluginId(null) }}
        onToggle={(plugin, enabled) => void handleTogglePlugin(plugin, enabled)}
        onUninstall={(plugin) => void handleUninstallPlugin(plugin)}
        onOpenFolder={(plugin) => { void window.electronAPI.openFile(plugin.path) }}
      />

      {/* Skill 删除确认 */}
      <ConfirmDialog
        open={pendingDeleteSkill !== null}
        onOpenChange={(open) => { if (!open) setPendingDeleteSkill(null) }}
        title={`确认删除 Skill「${pendingDeleteSkill?.name}」？`}
        description="删除后会彻底移除该 Skill 目录和其中所有内容，且无法恢复。"
        confirmLabel="删除"
        loadingLabel="删除中..."
        loading={isDeletingSkill}
        onConfirm={async () => {
          if (!pendingDeleteSkill || isDeletingSkill) return
          setIsDeletingSkill(true)
          const ok = await data.deleteSkill(pendingDeleteSkill.slug, pendingDeleteSkill.name)
          setIsDeletingSkill(false)
          setPendingDeleteSkill(null)
          if (ok) setSelectedSkillSlug(null)
        }}
      />

      {/* MCP 删除确认 */}
      <ConfirmDialog
        open={pendingDeleteMcpName !== null}
        onOpenChange={(open) => { if (!open) setPendingDeleteMcpName(null) }}
        title={`确认删除 MCP 服务器「${pendingDeleteMcpName}」？`}
        description="删除后将无法恢复，确定要删除这个 MCP 服务器吗？"
        confirmLabel="删除"
        loadingLabel="删除中..."
        loading={isDeletingMcp}
        onConfirm={async () => {
          if (!pendingDeleteMcpName || isDeletingMcp) return
          setIsDeletingMcp(true)
          await data.deleteMcp(pendingDeleteMcpName)
          setIsDeletingMcp(false)
          setPendingDeleteMcpName(null)
        }}
      />

      <McpDetailSheet
        open={mcpSheetOpen}
        server={editingMcp}
        workspaceSlug={data.workspaceSlug}
        onOpenChange={(open) => { setMcpSheetOpen(open); if (!open) bumpCapabilities((v) => v + 1) }}
        onSaved={() => setMcpSheetOpen(false)}
        onChanged={() => bumpCapabilities((v) => v + 1)}
      />

      <ImportSkillDialog
        open={showImport}
        onOpenChange={setShowImport}
        workspaceSlug={data.workspaceSlug}
        installedSkills={data.skills}
        onImported={() => bumpCapabilities((v) => v + 1)}
      />

      <Dialog open={showSkillAddDialog} onOpenChange={setShowSkillAddDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>添加技能</DialogTitle>
            <DialogDescription>选择添加方式。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <button
              type="button"
              onClick={() => {
                setShowSkillAddDialog(false)
                void handleInstallSkillZip()
              }}
              disabled={isInstallingSkillZip}
              className="flex items-start gap-3 rounded-lg border border-border/60 bg-content-area p-4 text-left transition-colors hover:bg-foreground/[0.04] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Upload size={18} className="mt-0.5 text-foreground/70" />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-foreground">{isInstallingSkillZip ? '上传中...' : '上传 Zip'}</span>
                <span className="mt-1 block text-xs text-muted-foreground">从本地 zip 包安装 Skill。</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setShowSkillAddDialog(false)
                setShowImport(true)
              }}
              className="flex items-start gap-3 rounded-lg border border-border/60 bg-content-area p-4 text-left transition-colors hover:bg-foreground/[0.04]"
            >
              <Plus size={18} className="mt-0.5 text-foreground/70" />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-foreground">从其他工作区导入</span>
                <span className="mt-1 block text-xs text-muted-foreground">选择其他工作区已有 Skill 导入当前工作区。</span>
              </span>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <HuataiEmailConnectorDialog
        open={activeDefaultConnector === 'huatai-email'}
        workspaceSlug={data.workspaceSlug}
        server={presetConnectorServers['huatai-email'] ?? null}
        onOpenChange={(open) => setActiveDefaultConnector(open ? 'huatai-email' : null)}
        onSaved={() => {
          setActiveDefaultConnector(null)
          void loadConnectorEnabledMap()
          bumpCapabilities((v) => v + 1)
        }}
      />

      <FeishuCliConnectorDialog
        open={activeDefaultConnector === 'feishu-cli'}
        onOpenChange={(open) => setActiveDefaultConnector(open ? 'feishu-cli' : null)}
        onSaved={() => {
          setActiveDefaultConnector(null)
          setFeishuCliConnected(true)
          void loadConnectorEnabledMap()
          bumpCapabilities((v) => v + 1)
        }}
      />
    </div>
  )
}

// ===== Skills Tab =====

interface SkillsTabProps {
  skillView: 'market' | 'installed'
  skills: SkillMeta[]
  total: number
  installedPlugins: AgentPluginInfo[]
  pluginTotal: number
  pluginLoading: boolean
  updateCount: number
  updatingSkill: string | null
  isBuiltin: (slug: string) => boolean
  workspaceSlug: string
  query: string
  installedSkillNames: Set<string>
  onInstalled: () => void
  onOpen: (slug: string) => void
  onOpenPlugin: (pluginId: string) => void
  onToggle: (slug: string, enabled: boolean) => void
  onUpdate: (slug: string) => void
  onSkillViewChange: (view: 'market' | 'installed') => void
  onRefreshInstalled: () => void | Promise<void>
}

function SkillsTab({ skillView, skills, total, installedPlugins, pluginTotal, pluginLoading, updateCount, updatingSkill, isBuiltin, workspaceSlug, query, installedSkillNames, onInstalled, onOpen, onOpenPlugin, onToggle, onUpdate, onSkillViewChange, onRefreshInstalled }: SkillsTabProps): React.ReactElement {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3 border-b border-border/60">
        <div className="flex items-center gap-8">
          <SkillViewTab
            active={skillView === 'market'}
            label="技能市场"
            onClick={() => onSkillViewChange('market')}
          />
          <SkillViewTab
            active={skillView === 'installed'}
            label="已安装"
            onClick={() => onSkillViewChange('installed')}
          />
        </div>
        {skillView === 'installed' && (
          <button
            type="button"
            onClick={() => void onRefreshInstalled()}
            disabled={pluginLoading}
            className="mb-2 flex h-8 items-center gap-1.5 rounded-lg border border-border/60 bg-content-area px-3 text-[13px] font-medium text-foreground/75 shadow-sm transition-colors hover:bg-foreground/[0.04] disabled:cursor-not-allowed disabled:opacity-60"
            title="刷新已安装技能"
          >
            <RefreshCw size={14} className={pluginLoading ? 'animate-spin' : undefined} />
            <span>刷新已安装</span>
          </button>
        )}
      </div>

      {skillView === 'market' ? (
        <SkillMarketPanel
          workspaceSlug={workspaceSlug}
          query={query}
          installedSkillNames={installedSkillNames}
          onInstalled={onInstalled}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {updateCount > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-blue-500/20 bg-blue-500/[0.06] px-3 py-2 text-[13px] text-blue-600 dark:text-blue-400">
              有 {updateCount} 个技能可更新到来源最新版本
            </div>
          )}
          {pluginLoading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">加载中...</div>
          ) : total === 0 && pluginTotal === 0 ? (
            <EmptyState icon={<Blocks className="size-8 text-foreground/30" />} title="暂无已安装技能" hint="可以从技能市场安装，或从其他工作区导入。" />
          ) : skills.length === 0 && installedPlugins.length === 0 ? (
            <EmptyState icon={<Search className="size-8 text-foreground/30" />} title="没有匹配的已安装技能" hint="试试更换搜索关键词。" />
          ) : (
            <InstalledCapabilityGrid
              plugins={installedPlugins}
              skills={skills}
              isBuiltin={isBuiltin}
              updatingSkill={updatingSkill}
              onOpenPlugin={onOpenPlugin}
              onOpenSkill={onOpen}
              onToggleSkill={onToggle}
              onUpdateSkill={onUpdate}
            />
          )}
        </div>
      )}
    </div>
  )
}

function InstalledCapabilityGrid({
  plugins,
  skills,
  isBuiltin,
  updatingSkill,
  onOpenPlugin,
  onOpenSkill,
  onToggleSkill,
  onUpdateSkill,
}: {
  plugins: AgentPluginInfo[]
  skills: SkillMeta[]
  isBuiltin: (slug: string) => boolean
  updatingSkill: string | null
  onOpenPlugin: (pluginId: string) => void
  onOpenSkill: (slug: string) => void
  onToggleSkill: (slug: string, enabled: boolean) => void
  onUpdateSkill: (slug: string) => void
}): React.ReactElement {
  const capabilities = React.useMemo(() => sortInstalledCapabilities(plugins, skills), [plugins, skills])

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {capabilities.map((capability) => {
        if (capability.type === 'plugin') {
          const { plugin } = capability
          return <InstalledPluginCard key={`plugin:${plugin.id}`} plugin={plugin} onOpen={() => onOpenPlugin(plugin.id)} />
        }

        const { skill } = capability
        return (
          <SkillCard
            key={`skill:${skill.slug}`}
            skill={skill}
            isBuiltin={isBuiltin(skill.slug)}
            updating={updatingSkill === skill.slug}
            onOpen={() => onOpenSkill(skill.slug)}
            onToggle={(enabled) => onToggleSkill(skill.slug, enabled)}
            onUpdate={() => onUpdateSkill(skill.slug)}
          />
        )
      })}
    </div>
  )
}

function InstalledPluginCard({ plugin, onOpen }: { plugin: AgentPluginInfo; onOpen: () => void }): React.ReactElement {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen()
        }
      }}
      className={cn(
        'group relative flex h-full cursor-pointer flex-col gap-3 rounded-xl border border-border/60 bg-content-area p-4 text-left transition-all',
        'hover:border-border hover:shadow-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-ring',
        !plugin.enabled && 'opacity-55',
      )}
    >
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-violet-500/10 p-2 text-violet-500 shadow-sm shrink-0">
          <Package size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-foreground">{plugin.name}</span>
            <span className="shrink-0 rounded-md bg-violet-500/10 px-1.5 py-0.5 text-[11px] font-medium text-violet-600 dark:text-violet-300">套件</span>
          </div>
          <div className="mt-0.5 truncate text-xs text-muted-foreground">{getInstalledPluginSourceLabel(plugin)}</div>
        </div>
      </div>
      <p className="line-clamp-2 min-h-[40px] text-[13px] leading-6 text-muted-foreground">
        {plugin.description ?? '暂无描述'}
      </p>
      <div className="mt-auto flex items-center gap-2">
        <span className="truncate rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
          {summarizePluginCapabilities(plugin)}
        </span>
        <span className={cn(
          'ml-auto rounded-md px-1.5 py-0.5 text-[11px] font-medium',
          plugin.enabled ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300' : 'bg-muted text-muted-foreground',
        )}
        >
          {plugin.enabled ? '已启用' : '已禁用'}
        </span>
      </div>
    </div>
  )
}

function getInstalledPluginSourceLabel(plugin: AgentPluginInfo): string {
  if (plugin.kind === 'builtin') return 'WorkMate 内置'
  if (plugin.sourceMarketplaceId) return `市场 (${plugin.sourceMarketplaceId})`
  return '本地插件'
}

function summarizePluginCapabilities(plugin: AgentPluginInfo): string {
  const counts = plugin.capabilities.reduce<Record<string, number>>((acc, capability) => {
    acc[capability.type] = (acc[capability.type] ?? 0) + 1
    return acc
  }, {})
  return [
    counts.skill ? `${counts.skill} 个技能` : null,
    counts.agent ? `${counts.agent} 个智能体` : null,

    counts.mcp ? `${counts.mcp} 个 MCP` : null,
    counts.command ? `${counts.command} 个命令` : null,
  ].filter(Boolean).join(' · ') || '暂无能力'
}

function SkillViewTab({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative flex h-11 items-center gap-2 text-sm font-semibold transition-colors',
        active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      <span>{label}</span>
      {active && <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-foreground" />}
    </button>
  )
}

interface SkillSectionProps {
  skills: SkillMeta[]
  isBuiltin: (slug: string) => boolean
  updatingSkill: string | null
  onOpen: (slug: string) => void
  onToggle: (slug: string, enabled: boolean) => void
  onUpdate: (slug: string) => void
}

function SkillSection({ skills, isBuiltin, updatingSkill, onOpen, onToggle, onUpdate }: SkillSectionProps): React.ReactElement {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {skills.map((skill) => (
          <SkillCard
            key={skill.slug}
            skill={skill}
            isBuiltin={isBuiltin(skill.slug)}
            updating={updatingSkill === skill.slug}
            onOpen={() => onOpen(skill.slug)}
            onToggle={(enabled) => onToggle(skill.slug, enabled)}
            onUpdate={() => onUpdate(skill.slug)}
          />
        ))}
      </div>
    </div>
  )
}

function ConnectorCard({
  connector,
  server,
  isFeishuConnected,
  enabled,
  onOpen,
  onToggle,
  onUnbindFeishu,
  unbindingFeishu,
  onRequestDelete,
  isBuiltin,
  lastTestResult,
}: {
  connector: PresetConnectorDefinition & {
    source?: 'preset' | 'user'
  }
  server: McpServerEntry | null
  isFeishuConnected: boolean
  enabled: boolean
  onOpen: () => void
  onToggle: (enabled: boolean) => void
  onUnbindFeishu: () => void
  unbindingFeishu: boolean
  onRequestDelete?: () => void
  isBuiltin?: boolean
  lastTestResult?: { success: boolean; message: string }
}): React.ReactElement {
  const isMcp = connector.connectorType === 'mcp'
  const isCli = connector.connectorType === 'cli'
  const isComingSoon = connector.status === 'coming-soon'
  const isInitialized = Boolean(server)
  // MCP 类型：MCP server 存在才算已配置；CLI 类型：凭据连接才算已配置
  const isConfigured = isCli ? isFeishuConnected : isMcp ? isInitialized : false
  const isUserConnector = connector.source === 'user'
  const isPresetConnector = connector.source === 'preset'

  // 参考 SkillCard 显示 source 标签
  const connectorSourceLabel = () => {
    if (isPresetConnector) {
      return (
        <span className="flex items-center gap-1 rounded-md bg-blue-500/10 px-1.5 py-0.5 text-[11px] font-medium text-blue-600 dark:text-blue-400">
          <ShieldCheck size={12} /> WorkMate 内置
        </span>
      )
    }
    return (
      <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
        {connector.category ?? '用户自定义'}
      </span>
    )
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={isComingSoon ? undefined : onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          !isComingSoon && onOpen()
        }
      }}
      className={cn(
        'group relative flex h-full flex-col gap-3 rounded-xl border border-border/60 bg-content-area p-4 text-left transition-all cursor-pointer',
        'hover:border-border hover:shadow-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-ring',
        isComingSoon ? 'cursor-not-allowed opacity-55' : !enabled && 'opacity-55',
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn(
          'rounded-xl p-2 shadow-sm shrink-0',
          isMcp ? 'bg-amber-500/12 text-amber-500' : 'bg-blue-500/12 text-blue-500',
        )}>
          {isMcp ? <Mail size={18} /> : <Blocks size={18} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-foreground">{connector.name}</span>
            <span className={cn(
              'shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium',
              isComingSoon ? 'bg-muted text-muted-foreground'
                : isConfigured ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                  : 'bg-muted text-muted-foreground',
            )}>
              {isComingSoon ? '敬请期待' : isConfigured ? '已连接' : '待配置'}
            </span>
          </div>
          <div className="mt-0.5 truncate text-xs text-muted-foreground">
            {connector.category}
          </div>
        </div>
        {!isComingSoon && (
          <Switch
            checked={enabled}
            onCheckedChange={onToggle}
            onClick={(e) => e.stopPropagation()}
            className="shrink-0"
          />
        )}
      </div>
      <p className="line-clamp-2 min-h-[40px] text-[13px] leading-6 text-muted-foreground">
        {isInitialized && server
          ? `${server.type.toUpperCase()}: ${server.type === 'stdio' ? server.command : server.url}`
          : connector.description ?? '暂无描述'}
      </p>

      <div className="mt-auto flex items-center gap-2">
        {connectorSourceLabel()}

        {isConfigured && lastTestResult && (
          <span
            className={cn(
              'flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium',
              lastTestResult.success
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'bg-destructive/10 text-destructive',
            )}
          >
            {lastTestResult.success ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
            {lastTestResult.success ? '连接正常' : '连接失败'}
          </span>
        )}

        <div className="ml-auto flex items-center gap-1">
          {isCli && isConfigured && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onUnbindFeishu()
                  }}
                  disabled={unbindingFeishu}
                  className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed"
                >
                  <Unplug size={16} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">解绑飞书 CLI</TooltipContent>
            </Tooltip>
          )}
          {isUserConnector && !isBuiltin && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onRequestDelete?.()
                  }}
                  className="rounded p-1.5 text-muted-foreground transition-colors hover:text-destructive"
                >
                  <Trash2 size={16} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">删除</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
    </div>
  )
}

function HuataiEmailConnectorDialog({
  open,
  workspaceSlug,
  server,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  workspaceSlug: string
  server: McpServerEntry | null
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}): React.ReactElement {
  const [emailLocalPart, setEmailLocalPart] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [editing, setEditing] = React.useState(false)
  const [initSteps, setInitSteps] = React.useState<DefaultConnectorInitStep[]>([])
  const isInitialized = Boolean(server)
  const currentEmail = server?.env?.MCP_EMAIL_SERVER_EMAIL_ADDRESS ?? ''

  React.useEffect(() => {
    if (!open) {
      setEmailLocalPart('')
      setPassword('')
      setSaving(false)
      setEditing(false)
      setInitSteps([])
      return
    }
    setEmailLocalPart(getHuataiEmailLocalPart(currentEmail))
  }, [currentEmail, open])

  const fullEmailAddress = `${emailLocalPart.trim()}@${HUATAI_EMAIL_DOMAIN}`
  const canSave = emailLocalPart.trim().length > 0 && password.trim().length > 0

  const handleSave = async (): Promise<void> => {
    if (!canSave || saving) return
    setSaving(true)
    setInitSteps([
      { id: 'check-python', label: '检查环境', status: 'running' },
      { id: 'check-package', label: '检查 mcp-email-server', status: 'pending' },
      { id: 'install-package', label: '安装 mcp-email-server', status: 'pending' },
      { id: 'write-config', label: '写入 MCP 配置', status: 'pending' },
      { id: 'self-check', label: '自检连接器', status: 'pending' },
    ])
    try {
      const result = await window.electronAPI.initializeDefaultConnector(workspaceSlug, {
        connectorId: 'huatai-email',
        emailAddress: fullEmailAddress,
        password,
      })
      setInitSteps(result.steps)
      if (!result.success) {
        toast.error('华泰邮箱连接器初始化失败', { description: result.message })
        return
      }
      toast.success('华泰邮箱连接器已初始化')
      setEditing(false)
      onSaved()
    } catch (error) {
      console.error('[连接器] 初始化华泰邮箱失败:', error)
      toast.error('初始化华泰邮箱失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(calc(100vw-48px),560px)] max-w-none overflow-hidden rounded-2xl border-0 p-8 shadow-2xl">
        <DialogTitle className="text-2xl font-semibold tracking-normal">邮箱绑定</DialogTitle>
        <DialogDescription className="sr-only">绑定华泰邮箱并写入当前工作区 MCP 配置。</DialogDescription>

        <div className="mt-2 flex items-start gap-4">
          <div className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-amber-500/12 text-amber-500">
            <Mail size={28} />
          </div>
          <div className="min-w-0 space-y-2">
            <div className="text-[15px] font-medium text-foreground">绑定华泰邮箱</div>
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              绑定时会检查环境、安装 <span className="font-mono text-foreground/70">mcp-email-server</span>，并写入当前工作区的 <span className="font-mono text-foreground/70">email</span> MCP 配置。默认只启用 IMAP 读取能力。
            </p>
          </div>
        </div>

        {isInitialized && !editing && server && (
          <div className="mt-6 space-y-3 rounded-xl bg-muted/45 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-foreground">当前 MCP 配置</div>
                <div className="mt-1 text-xs text-muted-foreground">已挂载为 <span className="font-mono text-foreground/70">email</span>，不会在连接器列表中重复展示。</div>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
                重新绑定
              </Button>
            </div>
            <div className="grid gap-2 text-xs text-muted-foreground">
              <ConnectorDetailRow label="状态" value={server.enabled ? '已启用' : '未启用'} />
              <ConnectorDetailRow label="类型" value={server.type} />
              <ConnectorDetailRow label="命令" value={server.type === 'stdio' ? server.command : server.url} mono />
              <ConnectorDetailRow label="账号" value={currentEmail || '未配置'} mono />
              <ConnectorDetailRow label="IMAP" value={`${server.env?.MCP_EMAIL_SERVER_IMAP_HOST ?? '未配置'}:${server.env?.MCP_EMAIL_SERVER_IMAP_PORT ?? ''}`} mono />
              {server.lastTestResult && (
                <ConnectorDetailRow
                  label="最近自检"
                  value={`${server.lastTestResult.success ? '成功' : '失败'} · ${server.lastTestResult.message}`}
                />
              )}
            </div>
          </div>
        )}

        {(!isInitialized || editing) && (
          <div className="mx-auto w-full max-w-[420px] mt-6 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">邮箱账号 *</label>
              <div className="flex h-11 overflow-hidden rounded-lg border border-border/80 bg-content-area shadow-sm transition-colors focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/15">
                <input
                  value={emailLocalPart}
                  onChange={(event) => setEmailLocalPart(getHuataiEmailLocalPart(event.target.value))}
                  placeholder="请输入邮箱前缀"
                  className="min-w-0 flex-1 bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground"
                />
                <span className="flex shrink-0 items-center border-l border-border/60 bg-muted/45 px-3 text-sm text-muted-foreground">
                  @{HUATAI_EMAIL_DOMAIN}
                </span>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">密码 *</label>
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="请输入华泰邮箱密码"
                type="password"
                className="h-11 w-full rounded-lg border border-border/80 bg-content-area px-3 text-sm shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/60 focus:ring-2 focus:ring-primary/15"
              />
              <p className="text-xs text-muted-foreground">密码只保存在本地 MCP 配置中，不会上传到云端。</p>
            </div>
            <Button
              type="button"
              size="lg"
              className="h-11 w-full rounded-full"
              disabled={!canSave || saving}
              onClick={() => void handleSave()}
            >
              {saving ? '保存中...' : isInitialized ? '保存并覆盖配置' : '完成连接'}
            </Button>
          </div>
        )}

        {initSteps.length > 0 && (
          <div className="mt-5 min-w-0 overflow-hidden space-y-2 rounded-xl bg-muted/45 p-3">
            {initSteps.map((step) => (
              <div key={step.id} className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                {step.status === 'running' ? (
                  <Loader2 size={14} className="shrink-0 animate-spin text-primary" />
                ) : step.status === 'success' || step.status === 'skipped' ? (
                  <Check size={14} className="shrink-0 text-emerald-500" />
                ) : step.status === 'error' ? (
                  <XCircle size={14} className="shrink-0 text-destructive" />
                ) : (
                  <span className="size-3.5 shrink-0 rounded-full border border-border" />
                )}
                <span className="shrink-0 font-medium text-foreground/80">{step.label}</span>
                {step.message && <span className="min-w-0 flex-1 truncate">{step.message}</span>}
              </div>
            ))}
          </div>
        )}

      </DialogContent>
    </Dialog>
  )
}

function ConnectorDetailRow({ label, value, mono = false }: { label: string; value: string | undefined; mono?: boolean }): React.ReactElement {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg bg-background/70 px-3 py-2">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className={cn('min-w-0 break-all text-right text-foreground/80', mono && 'font-mono')}>{value || '未配置'}</span>
    </div>
  )
}

// ===== Empty State =====

function EmptyState({ icon, title, hint, action }: { icon: React.ReactNode; title: string; hint: string; action?: React.ReactNode }): React.ReactElement {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 pt-24 text-center">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-foreground/[0.04]">{icon}</div>
      <div className="flex flex-col gap-1.5">
        <div className="text-[15px] font-medium text-foreground/85">{title}</div>
        <div className="text-[13px] leading-relaxed text-foreground/50">{hint}</div>
      </div>
      {action}
    </div>
  )
}
