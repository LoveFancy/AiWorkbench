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
import { Blocks, ChevronDown, Search, Plus, FolderOpen, Check, Mail, ExternalLink, ArrowRight, Info, Bot, Upload } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { agentExpertGroupsAtom, workspaceCapabilitiesVersionAtom } from '@/atoms/agent-atoms'
import { useProjectActions } from '@/hooks/useProjectActions'
import { ExpertPageView } from '@/experts/views/ExpertPageView'
import type { McpServerEntry, SkillMeta } from '@proma/shared'
import { getCapabilityTabs, type CapabilityTab } from './capability-tabs'
import { useAgentSkillsData } from './useAgentSkillsData'
import { SkillCard } from './SkillCard'
import { McpCard } from './McpCard'
import { SkillDetailSheet } from './SkillDetailSheet'
import { McpDetailSheet } from './McpDetailSheet'
import { ImportSkillDialog } from './ImportSkillDialog'
import { SkillMarketPanel } from './SkillMarketPanel'
import {
  buildHuataiEmailMcpEntry,
  DEFAULT_CONNECTOR_DEFINITIONS,
  FEISHU_CLI_AUTHORIZATION_URL,
  FEISHU_CLI_LAUNCHER_URL,
  type DefaultConnectorDefinition,
  type DefaultConnectorId,
} from './default-connectors'

interface AgentSkillsViewProps {
  initialTab?: CapabilityTab
}

export function AgentSkillsView({ initialTab = 'experts' }: AgentSkillsViewProps): React.ReactElement {
  const data = useAgentSkillsData()
  const expertGroups = useAtomValue(agentExpertGroupsAtom)
  const bumpCapabilities = useSetAtom(workspaceCapabilitiesVersionAtom)
  const { workspaces, currentWorkspaceId, selectProject } = useProjectActions()

  const [tab, setTab] = React.useState<CapabilityTab>(initialTab)
  const [skillView, setSkillView] = React.useState<'market' | 'installed'>('market')
  const [search, setSearch] = React.useState('')
  const [selectedSkillSlug, setSelectedSkillSlug] = React.useState<string | null>(null)
  const [mcpSheetOpen, setMcpSheetOpen] = React.useState(false)
  const [editingMcp, setEditingMcp] = React.useState<{ name: string; entry: McpServerEntry } | null>(null)
  const [showImport, setShowImport] = React.useState(false)
  const [wsPopoverOpen, setWsPopoverOpen] = React.useState(false)
  const [pendingDeleteSkill, setPendingDeleteSkill] = React.useState<SkillMeta | null>(null)
  const [pendingDeleteMcpName, setPendingDeleteMcpName] = React.useState<string | null>(null)
  const [isDeletingSkill, setIsDeletingSkill] = React.useState(false)
  const [isDeletingMcp, setIsDeletingMcp] = React.useState(false)
  const [isInstallingSkillZip, setIsInstallingSkillZip] = React.useState(false)
  const [activeDefaultConnector, setActiveDefaultConnector] = React.useState<DefaultConnectorId | null>(null)

  React.useEffect(() => {
    setTab(initialTab)
  }, [initialTab])

  const q = search.trim().toLowerCase()

  const filteredSkills = React.useMemo(() => {
    if (!q) return data.skills
    return data.skills.filter((s) =>
      s.name.toLowerCase().includes(q) ||
      s.slug.toLowerCase().includes(q) ||
      (s.description ?? '').toLowerCase().includes(q),
    )
  }, [data.skills, q])

  const updateCount = data.skills.filter((s) => s.hasUpdate).length
  const installedSkillNames = React.useMemo(() => new Set(data.skills.map((skill) => skill.name)), [data.skills])

  const serverEntries = React.useMemo(() => {
    return Object.entries(data.mcpConfig.servers ?? {})
      .filter(([name]) => name !== 'memos-cloud')
      .filter(([name]) => !q || name.toLowerCase().includes(q))
  }, [data.mcpConfig, q])

  // 不含搜索过滤的 MCP 总数（标签计数与空态判断用）
  const mcpCount = React.useMemo(
    () => Object.keys(data.mcpConfig.servers ?? {}).filter((n) => n !== 'memos-cloud').length + DEFAULT_CONNECTOR_DEFINITIONS.length,
    [data.mcpConfig],
  )
  const capabilityTabs = React.useMemo(
    () => getCapabilityTabs({ experts: expertGroups.length, skills: data.skills.length, connectors: mcpCount }),
    [data.skills.length, expertGroups.length, mcpCount],
  )

  const selectedSkill = data.skills.find((s) => s.slug === selectedSkillSlug) ?? null
  const selectedIsBuiltin = selectedSkill ? data.defaultSkillSlugs.has(selectedSkill.slug) : false

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
          {capabilityTabs.map(({ value, label, count }) => (
            <button
              key={value}
              onClick={() => setTab(value)}
              className={cn(
                'relative z-[1] flex min-w-[96px] items-center justify-center gap-1.5 rounded-lg px-4 text-sm font-medium transition-colors duration-200',
                tab === value ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {label}
              <span className="text-[11px] tabular-nums text-muted-foreground">{count}</span>
            </button>
          ))}
        </div>

        {/* 搜索框 */}
        {tab === 'experts' ? (
          <div className="flex-1" />
        ) : (
          <div className="flex h-8 flex-1 items-center gap-2 rounded-lg border border-border/60 bg-content-area px-3 transition-colors focus-within:border-primary/40">
            <Search size={14} className="shrink-0 text-foreground/40" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tab === 'skills' ? '搜索技能...' : '搜索连接器...'}
              className="w-full bg-transparent text-[13px] text-foreground placeholder:text-foreground/35 focus:outline-none"
            />
          </div>
        )}

        {/* Skills：上传 zip 包或从其他工作区导入 */}
        {tab === 'skills' && (
          <>
            <button
              type="button"
              onClick={() => void handleInstallSkillZip()}
              disabled={isInstallingSkillZip}
              className="flex h-8 items-center gap-1.5 rounded-lg border border-border/60 bg-content-area px-3 text-[13px] font-medium text-foreground/80 shadow-sm transition-colors hover:bg-foreground/[0.04] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Upload size={14} />
              <span>{isInstallingSkillZip ? '上传中...' : '上传 Zip'}</span>
            </button>
            <button
              type="button"
              onClick={() => setShowImport(true)}
              className="flex h-8 items-center gap-1.5 rounded-lg border border-border/60 bg-content-area px-3 text-[13px] font-medium text-foreground/80 shadow-sm transition-colors hover:bg-foreground/[0.04]"
            >
              <Plus size={14} />
              <span>导入</span>
            </button>
          </>
        )}

        {/* 新增 MCP */}
        {tab === 'mcp' && (
          <button
            type="button"
            onClick={() => { setEditingMcp(null); setMcpSheetOpen(true) }}
            className="flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-[13px] font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          >
            <Plus size={14} />
            <span>添加服务器</span>
          </button>
        )}
      </div>

      {/* 内容 */}
      <div className={cn('min-h-0 flex-1', tab === 'experts' ? 'overflow-hidden' : 'overflow-y-auto scrollbar-thin')}>
        {tab === 'experts' ? (
          <ExpertPageView embedded />
        ) : (
          <div className="mx-auto w-full max-w-6xl px-8 pb-10">
            {data.loading ? (
              <div className="py-20 text-center text-sm text-muted-foreground">加载中...</div>
            ) : tab === 'skills' ? (
              <SkillsTab
                skillView={skillView}
                skills={filteredSkills}
                total={data.skills.length}
                updateCount={updateCount}
                updatingSkill={data.updatingSkill}
                isBuiltin={(slug) => data.defaultSkillSlugs.has(slug)}
                workspaceSlug={data.workspaceSlug}
                query={search}
                installedSkillNames={installedSkillNames}
                onInstalled={() => bumpCapabilities((v) => v + 1)}
                onOpen={setSelectedSkillSlug}
                onToggle={data.toggleSkill}
                onUpdate={data.updateSkill}
                onSkillViewChange={setSkillView}
              />
            ) : (
              <McpTab
                entries={serverEntries}
                total={mcpCount}
                query={q}
                onOpen={(name, entry) => { setEditingMcp({ name, entry }); setMcpSheetOpen(true) }}
                onToggle={data.toggleMcp}
                onRequestDelete={setPendingDeleteMcpName}
                onAdd={() => { setEditingMcp(null); setMcpSheetOpen(true) }}
                onOpenDefaultConnector={setActiveDefaultConnector}
              />
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

      <HuataiEmailConnectorDialog
        open={activeDefaultConnector === 'personal-email'}
        workspaceSlug={data.workspaceSlug}
        onOpenChange={(open) => setActiveDefaultConnector(open ? 'personal-email' : null)}
        onSaved={() => {
          setActiveDefaultConnector(null)
          bumpCapabilities((v) => v + 1)
        }}
      />

      <FeishuCliConnectorDialog
        open={activeDefaultConnector === 'feishu-cli'}
        onOpenChange={(open) => setActiveDefaultConnector(open ? 'feishu-cli' : null)}
      />
    </div>
  )
}

// ===== Skills Tab =====

interface SkillsTabProps {
  skillView: 'market' | 'installed'
  skills: SkillMeta[]
  total: number
  updateCount: number
  updatingSkill: string | null
  isBuiltin: (slug: string) => boolean
  workspaceSlug: string
  query: string
  installedSkillNames: Set<string>
  onInstalled: () => void
  onOpen: (slug: string) => void
  onToggle: (slug: string, enabled: boolean) => void
  onUpdate: (slug: string) => void
  onSkillViewChange: (view: 'market' | 'installed') => void
}

function SkillsTab({ skillView, skills, total, updateCount, updatingSkill, isBuiltin, workspaceSlug, query, installedSkillNames, onInstalled, onOpen, onToggle, onUpdate, onSkillViewChange }: SkillsTabProps): React.ReactElement {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-8 border-b border-border/60">
        <SkillViewTab
          active={skillView === 'market'}
          label="技能市场"
          onClick={() => onSkillViewChange('market')}
        />
        <SkillViewTab
          active={skillView === 'installed'}
          label="已安装"
          count={total}
          onClick={() => onSkillViewChange('installed')}
        />
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
          {total === 0 ? (
            <EmptyState icon={<Blocks className="size-8 text-foreground/30" />} title="暂无已安装技能" hint="可以从技能市场安装，或从其他工作区导入。" />
          ) : skills.length === 0 ? (
            <EmptyState icon={<Search className="size-8 text-foreground/30" />} title="没有匹配的已安装技能" hint="试试更换搜索关键词。" />
          ) : (
            <SkillSection skills={skills} isBuiltin={isBuiltin} updatingSkill={updatingSkill} onOpen={onOpen} onToggle={onToggle} onUpdate={onUpdate} />
          )}
        </div>
      )}
    </div>
  )
}

function SkillViewTab({ active, label, count, onClick }: { active: boolean; label: string; count?: number; onClick: () => void }): React.ReactElement {
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
      {count !== undefined && <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{count}</span>}
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

// ===== MCP Tab =====

interface McpTabProps {
  entries: Array<[string, McpServerEntry]>
  total: number
  query: string
  onOpen: (name: string, entry: McpServerEntry) => void
  onToggle: (name: string, enabled: boolean) => void
  onRequestDelete: (name: string) => void
  onAdd: () => void
  onOpenDefaultConnector: (id: DefaultConnectorId) => void
}

function McpTab({ entries, total, query, onOpen, onToggle, onRequestDelete, onAdd, onOpenDefaultConnector }: McpTabProps): React.ReactElement {
  const defaultConnectors = React.useMemo(() => {
    if (!query) return DEFAULT_CONNECTOR_DEFINITIONS
    return DEFAULT_CONNECTOR_DEFINITIONS.filter((connector) =>
      connector.name.toLowerCase().includes(query) ||
      connector.description.toLowerCase().includes(query) ||
      connector.category.toLowerCase().includes(query),
    )
  }, [query])

  if (total === 0) {
    return (
      <EmptyState
        icon={<Plus className="size-8 text-foreground/30" />}
        title="还没有连接器"
        hint="点击右上角「添加服务器」开始，或在 Agent 模式下让 Proma 帮你查找并配置。"
        action={
          <button
            type="button"
            onClick={onAdd}
            className="mt-2 flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          >
            <Plus size={14} />
            <span>添加服务器</span>
          </button>
        }
      />
    )
  }
  if (entries.length === 0 && defaultConnectors.length === 0) {
    return <EmptyState icon={<Search className="size-8 text-foreground/30" />} title="没有匹配的连接器" hint="试试更换搜索关键词。" />
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {defaultConnectors.map((connector) => (
        <DefaultConnectorCard
          key={connector.id}
          connector={connector}
          onOpen={() => onOpenDefaultConnector(connector.id)}
        />
      ))}
      {entries.map(([name, entry]) => (
        <McpCard
          key={name}
          name={name}
          entry={entry}
          onOpen={() => onOpen(name, entry)}
          onToggle={(enabled) => onToggle(name, enabled)}
          onRequestDelete={() => onRequestDelete(name)}
        />
      ))}
    </div>
  )
}

function DefaultConnectorCard({
  connector,
  onOpen,
}: {
  connector: DefaultConnectorDefinition
  onOpen: () => void
}): React.ReactElement {
  const isEmail = connector.id === 'personal-email'
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'group relative flex h-full min-h-[132px] flex-col gap-3 rounded-xl border border-border/60 bg-content-area p-4 text-left transition-all',
        'hover:border-border hover:shadow-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-ring',
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn(
          'rounded-xl p-2 shadow-sm shrink-0',
          isEmail ? 'bg-amber-500/12 text-amber-500' : 'bg-blue-500/12 text-blue-500',
        )}>
          {isEmail ? <Mail size={18} /> : <Blocks size={18} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-foreground">{connector.name}</span>
            <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
              默认
            </span>
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">{connector.category}</div>
        </div>
        <ArrowRight size={16} className="shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground/70" />
      </div>
      <p className="line-clamp-3 text-[12px] leading-relaxed text-muted-foreground">{connector.description}</p>
    </button>
  )
}

function HuataiEmailConnectorDialog({
  open,
  workspaceSlug,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  workspaceSlug: string
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}): React.ReactElement {
  const [emailAddress, setEmailAddress] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (!open) {
      setEmailAddress('')
      setPassword('')
      setSaving(false)
    }
  }, [open])

  const canSave = emailAddress.trim().length > 0 && password.trim().length > 0

  const handleSave = async (): Promise<void> => {
    if (!canSave || saving) return
    setSaving(true)
    try {
      const config = await window.electronAPI.getWorkspaceMcpConfig(workspaceSlug)
      await window.electronAPI.saveWorkspaceMcpConfig(workspaceSlug, {
        servers: {
          ...config.servers,
          email: buildHuataiEmailMcpEntry({ emailAddress, password }),
        },
      })
      toast.success('华泰邮箱 MCP 配置已保存')
      onSaved()
    } catch (error) {
      console.error('[连接器] 保存华泰邮箱配置失败:', error)
      toast.error('保存华泰邮箱配置失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[560px] rounded-2xl border-0 p-8 shadow-2xl">
        <DialogTitle className="text-2xl font-semibold tracking-normal">邮箱绑定</DialogTitle>
        <DialogDescription className="sr-only">绑定华泰个人邮箱并写入当前工作区 MCP 配置。</DialogDescription>

        <div className="mt-2 flex items-start gap-4">
          <div className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-amber-500/12 text-amber-500">
            <Mail size={28} />
          </div>
          <div className="space-y-2">
            <div className="text-[15px] font-medium text-foreground">绑定华泰个人邮箱</div>
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              绑定后会在当前工作区写入 <span className="font-mono text-foreground/70">email</span> MCP 配置。默认只保存 IMAP 读取能力，完成连接测试后再启用。
            </p>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">邮箱账号 *</label>
            <input
              value={emailAddress}
              onChange={(event) => setEmailAddress(event.target.value)}
              placeholder="请输入华泰邮箱账号"
              className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/50 focus:ring-1 focus:ring-primary/30"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">密码 *</label>
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="请输入华泰邮箱密码"
              type="password"
              className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/50 focus:ring-1 focus:ring-primary/30"
            />
            <p className="text-xs text-muted-foreground">密码只保存在本地 MCP 配置中，不会上传到云端。</p>
          </div>
        </div>

        <Button
          type="button"
          size="lg"
          className="mt-4 h-11 rounded-full"
          disabled={!canSave || saving}
          onClick={() => void handleSave()}
        >
          {saving ? '保存中...' : '完成连接'}
        </Button>
      </DialogContent>
    </Dialog>
  )
}

function FeishuCliConnectorDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}): React.ReactElement {
  const [step, setStep] = React.useState<1 | 2>(1)

  React.useEffect(() => {
    if (!open) setStep(1)
  }, [open])

  const openLauncher = (): void => {
    void window.electronAPI.openExternal(FEISHU_CLI_LAUNCHER_URL)
    setStep(2)
  }

  const openAuthorization = (): void => {
    void window.electronAPI.openExternal(FEISHU_CLI_AUTHORIZATION_URL)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[560px] rounded-2xl border-0 p-8 shadow-2xl">
        <DialogTitle className="sr-only">飞书 CLI 连接配置</DialogTitle>
        <DialogDescription className="sr-only">创建飞书智能体应用并完成用户授权。</DialogDescription>

        <div className="flex items-start gap-5">
          <div className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-blue-500/12 text-blue-500">
            <Blocks size={30} />
          </div>
          <div className="space-y-3">
            <h3 className="text-2xl font-semibold tracking-normal text-foreground">飞书 CLI</h3>
            <p className="text-[14px] leading-relaxed text-muted-foreground">
              飞书 CLI 可协助 Agent 操作飞书消息、群组、云文档、云空间、电子表格、多维表格、日历、视频会议、邮箱、任务、知识库、通讯录和搜索等办公场景。
            </p>
          </div>
        </div>

        <div className="mt-7 space-y-5">
          <div className="text-lg font-semibold text-foreground">连接配置</div>
          <div className="flex items-center gap-5">
            <StepPill active={step === 1} index={1} label="创建应用" />
            <div className="h-px w-16 bg-border" />
            <StepPill active={step === 2} index={2} label="用户授权" />
          </div>

          {step === 1 ? (
            <div className="rounded-xl bg-muted/50 px-4 py-3 text-[13px] leading-relaxed text-muted-foreground">
              <div className="flex gap-2">
                <Info size={16} className="mt-0.5 shrink-0" />
                <span>点击下方按钮，将打开浏览器创建飞书个人智能体应用。创建完成后回到 WorkMate 继续授权。</span>
              </div>
            </div>
          ) : (
            <div className="space-y-3 rounded-xl bg-muted/50 px-4 py-3 text-[13px] leading-relaxed text-muted-foreground">
              <div className="flex gap-2">
                <Bot size={16} className="mt-0.5 shrink-0" />
                <span>请确认本机已安装飞书 CLI。未安装时，可在 Agent 中使用内置 Skill 执行飞书 CLI 安装与登录。</span>
              </div>
              <div className="font-mono text-xs text-foreground/70">npx @larksuite/cli@latest install</div>
            </div>
          )}
        </div>

        <Button
          type="button"
          size="lg"
          className="mt-4 h-11 rounded-full"
          onClick={step === 1 ? openLauncher : openAuthorization}
        >
          {step === 1 ? (
            <>
              开始连接
              <ExternalLink size={16} />
            </>
          ) : (
            <>
              开通并授权
              <ExternalLink size={16} />
            </>
          )}
        </Button>
      </DialogContent>
    </Dialog>
  )
}

function StepPill({ active, index, label }: { active: boolean; index: number; label: string }): React.ReactElement {
  return (
    <div className={cn('flex items-center gap-2 text-sm font-medium', active ? 'text-foreground' : 'text-muted-foreground/55')}>
      <span className={cn(
        'flex size-8 items-center justify-center rounded-full text-sm font-semibold',
        active ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground/50',
      )}>
        {index}
      </span>
      <span>{label}</span>
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
