import * as React from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ArrowLeft, ChevronDown, Download, ExternalLink, FolderOpen, Loader2, Package, RefreshCw, Trash2, X } from 'lucide-react'
import type { AgentPluginCapability, AgentPluginInfo, AgentPluginMarketplaceDetail } from '@proma/shared'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import { isPluginUpdateAvailable } from '@/lib/plugin-version'

type PluginDetailMode = 'market' | 'installed'

interface PluginDetailSheetProps {
  mode: PluginDetailMode
  plugin: AgentPluginMarketplaceDetail | AgentPluginInfo | null
  loading?: boolean
  installing?: boolean
  toggling?: boolean
  uninstalling?: boolean
  sourceLabel?: string
  onOpenChange: (open: boolean) => void
  onInstall?: (plugin: AgentPluginMarketplaceDetail) => void
  onToggle?: (plugin: AgentPluginInfo, enabled: boolean) => void
  onUninstall?: (plugin: AgentPluginInfo) => void
  onOpenFolder?: (plugin: AgentPluginInfo) => void
}

export function PluginDetailSheet({
  mode,
  plugin,
  loading = false,
  installing = false,
  toggling = false,
  uninstalling = false,
  sourceLabel,
  onOpenChange,
  onInstall,
  onToggle,
  onUninstall,
  onOpenFolder,
}: PluginDetailSheetProps): React.ReactElement {
  const capabilities = pluginCapabilities(plugin)
  const readme = isMarketplaceDetail(plugin) ? plugin.readme : null
  const manifest = isMarketplaceDetail(plugin) ? plugin.manifest : null
  const name = pluginName(plugin)
  const description = plugin?.description || manifest?.description || '暂无描述'
  const version = pluginVersion(plugin)
  const installedVersion = pluginInstalledVersion(plugin)
  const updateAvailable = isMarketplaceDetail(plugin) && isPluginUpdateAvailable(plugin.version, installedVersion)
  const enabled = pluginEnabled(plugin)
  const installed = pluginInstalled(plugin)
  const homepage = pluginHomepage(plugin)
  const repository = pluginRepository(plugin)
  const author = pluginAuthor(plugin)
  const grouped = groupCapabilities(capabilities)
  const capabilitySummary = capabilitySummaryItems(capabilities)
  const visibleCapabilityTypes = CAPABILITY_ORDER.filter((type) => grouped[type].length > 0)
  const emptyCapabilityMessage = isMarketplaceDetail(plugin) && !plugin.installed
    ? {
        title: '安装后可查看具体 Skill、命令、智能体和 MCP 能力',
        description: '市场插件需要安装到本地后，才能读取插件包内的能力清单。',
      }
    : {
        title: '暂无能力',
        description: '当前插件没有声明可展示的组件能力。',
      }

  return (
    <Sheet open={!!plugin} onOpenChange={onOpenChange}>
      <SheetContent hideClose side="right" className="flex w-full sm:w-[46vw] sm:min-w-[520px] sm:max-w-[760px] flex-col gap-0 overflow-hidden p-0" aria-describedby={undefined}>
        <SheetTitle className="sr-only">插件详情</SheetTitle>
        {plugin && (
          <>
            <div className="shrink-0 border-b border-border/60 px-5 py-4">
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="icon" className="size-8 shrink-0" type="button" onClick={() => onOpenChange(false)}>
                  {mode === 'installed' ? <ArrowLeft size={18} /> : <X size={16} />}
                </Button>
                <h3 className="text-lg font-medium text-foreground">插件详情</h3>
              </div>

              <div className="mt-4 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-500">
                    <Package size={23} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <h3 className="truncate text-xl font-semibold leading-7 text-foreground">{name}</h3>
                      {version && (
                        <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                          v{version}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 line-clamp-2 max-w-3xl text-sm leading-5 text-muted-foreground">{description}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-violet-500/10 px-2 py-0.5 text-[11px] font-medium text-violet-600 dark:text-violet-300">套件</span>
                      {sourceLabel && <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">来源 {sourceLabel}</span>}
                      {installed && <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-300">已安装</span>}
                      {enabled !== null && <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{enabled ? '已启用' : '已禁用'}</span>}
                    </div>
                  </div>
                </div>

              <div className="flex shrink-0 flex-wrap items-center gap-2 xl:justify-end">
                {mode === 'market' && isMarketplaceDetail(plugin) && onInstall && (!plugin.installed || updateAvailable) && (
                  <Button size="sm" disabled={installing} onClick={() => onInstall(plugin)}>
                    {installing ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                    {updateAvailable ? installing ? '更新中' : '更新' : installing ? '安装中' : '安装'}
                  </Button>
                )}
                {mode === 'installed' && isInstalledPlugin(plugin) && (
                  <>
                    <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/60 px-2.5 py-1.5">
                      <Switch
                        checked={plugin.enabled}
                        disabled={toggling}
                        onCheckedChange={(checked) => onToggle?.(plugin, checked)}
                      />
                      <span className="text-xs text-muted-foreground">{plugin.enabled ? '已启用' : '已禁用'}</span>
                    </div>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="sm" variant="ghost" onClick={() => onOpenFolder?.(plugin)}>
                          <FolderOpen size={14} />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top">打开目录</TooltipContent>
                    </Tooltip>
                    {plugin.kind === 'user' && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={uninstalling}
                            onClick={() => onUninstall?.(plugin)}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            {uninstalling ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top">卸载</TooltipContent>
                      </Tooltip>
                    )}
                  </>
                )}
                {homepage && (
                  <Button size="sm" variant="outline" onClick={() => void window.electronAPI.openExternal(homepage)}>
                    <ExternalLink size={14} />
                    主页
                  </Button>
                )}
                {repository && (
                  <Button size="sm" variant="outline" onClick={() => void window.electronAPI.openExternal(repository)}>
                    <ExternalLink size={14} />
                    仓库
                  </Button>
                )}
              </div>
            </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
              {loading ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  <RefreshCw size={16} className="mr-2 animate-spin" />
                  加载中...
                </div>
              ) : (
                <div className="flex flex-col gap-4 p-5">
                  <div className="rounded-xl border border-border/60 bg-content-area p-4">
                    <div className="grid gap-x-8 gap-y-3 md:grid-cols-2">
                      <CompactDetailField label="名称" value={name} />
                      <CompactDetailField label="版本" value={version || '未知'} />
                      <CompactDetailField label="作者" value={author || '未知'} />
                      <CompactDetailField label="来源" value={sourceLabel || '未知'} />
                    </div>
                    <div className="mt-4 border-t border-border/50 pt-4">
                      <div className="mb-2 text-xs font-medium text-muted-foreground">能力数量</div>
                      {capabilitySummary.length === 0 ? (
                        <div className="text-sm text-muted-foreground">{emptyCapabilityMessage.title}</div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {capabilitySummary.map((item) => (
                            <span
                              key={item.type}
                              className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs font-medium text-foreground"
                            >
                              <span className="text-muted-foreground">{item.label}</span>
                              <span className="tabular-nums">{item.count}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <section className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">组件能力</h4>
                      {capabilities.length > 0 && (
                        <span className="text-xs text-muted-foreground">{capabilities.length} 项</span>
                      )}
                    </div>
                    {capabilities.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-border/70 bg-content-area/60 px-5 py-7 text-center">
                        <div className="text-sm font-medium text-foreground">{emptyCapabilityMessage.title}</div>
                        <div className="mx-auto mt-1 max-w-md text-xs leading-5 text-muted-foreground">{emptyCapabilityMessage.description}</div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {visibleCapabilityTypes.map((type, index) => (
                          <CapabilityGroup key={type} type={type} capabilities={grouped[type]} defaultOpen={index < 2} />
                        ))}
                      </div>
                    )}
                  </section>

                  {(readme || description) && (
                    <section className="space-y-3">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">说明</h4>
                      <div className={cn('prose prose-sm max-w-none rounded-lg border border-border/60 bg-content-area p-4 dark:prose-invert')}>
                        <Markdown remarkPlugins={[remarkGfm]}>
                          {readme || description}
                        </Markdown>
                      </div>
                    </section>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

const CAPABILITY_ORDER: Array<AgentPluginCapability['type']> = ['skill', 'agent', 'expert-group', 'mcp', 'command']

function CapabilityGroup({ type, capabilities, defaultOpen }: { type: AgentPluginCapability['type']; capabilities: AgentPluginCapability[]; defaultOpen: boolean }): React.ReactElement | null {
  const [open, setOpen] = React.useState(defaultOpen)
  if (capabilities.length === 0) return null
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-lg border border-border/60 bg-content-area">
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-foreground/[0.025]">
        <span className="min-w-0 flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{capabilityLabel(type)}</span>
          {!open && (
            <span className="truncate text-xs text-muted-foreground">
              {capabilities.slice(0, 3).map((capability) => capability.name).join('、')}
              {capabilities.length > 3 ? ` 等 ${capabilities.length} 项` : ''}
            </span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground">{capabilities.length}</span>
          <ChevronDown size={15} className={cn('text-muted-foreground transition-transform', open && 'rotate-180')} />
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="divide-y divide-border/50 border-t border-border/50">
          {capabilities.map((capability) => (
            <div key={`${capability.type}:${capability.name}:${capability.relativePath ?? ''}`} className="px-3 py-2.5">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{capability.name}</span>
                <span className={cn(
                  'rounded-md px-1.5 py-0.5 text-[10px] font-medium',
                  capability.enabled ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300' : 'bg-muted text-muted-foreground',
                )}
                >
                  {capability.enabled ? '启用' : '禁用'}
                </span>
              </div>
              {capability.description && <p className="mt-1 text-xs leading-5 text-muted-foreground">{capability.description}</p>}
              {capability.issue && <p className="mt-1 text-xs text-amber-600 dark:text-amber-300">{capability.issue.message}</p>}
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

function CompactDetailField({ label, value, className }: { label: string; value: string; className?: string }): React.ReactElement {
  return (
    <div className={cn('grid min-w-0 grid-cols-[44px_minmax(0,1fr)] items-baseline gap-2', className)}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="truncate text-sm font-medium text-foreground" title={value}>{value}</div>
    </div>
  )
}

function capabilityLabel(type: AgentPluginCapability['type']): string {
  switch (type) {
    case 'skill':
      return '技能'
    case 'command':
      return '命令'
    case 'agent':
      return '智能体'
    case 'mcp':
      return 'MCP'
    case 'expert-group':
      return '专家团'
  }
}

function groupCapabilities(capabilities: AgentPluginCapability[]): Record<AgentPluginCapability['type'], AgentPluginCapability[]> {
  return capabilities.reduce<Record<AgentPluginCapability['type'], AgentPluginCapability[]>>(
    (acc, capability) => {
      acc[capability.type].push(capability)
      return acc
    },
    { skill: [], command: [], agent: [], mcp: [], 'expert-group': [] },
  )
}

function summarizeCapabilities(capabilities: AgentPluginCapability[]): string {
  const grouped = groupCapabilities(capabilities)
  return [
    grouped.skill.length > 0 ? `${grouped.skill.length} 个技能` : null,
    grouped.agent.length > 0 ? `${grouped.agent.length} 个智能体` : null,
    grouped['expert-group'].length > 0 ? `${grouped['expert-group'].length} 专家团` : null,
    grouped.mcp.length > 0 ? `${grouped.mcp.length} 个 MCP` : null,
    grouped.command.length > 0 ? `${grouped.command.length} 个命令` : null,
  ].filter(Boolean).join(' · ') || '暂无能力'
}

function capabilitySummaryItems(capabilities: AgentPluginCapability[]): Array<{ type: AgentPluginCapability['type']; label: string; count: number }> {
  const grouped = groupCapabilities(capabilities)
  return CAPABILITY_ORDER
    .map((type) => ({ type, label: capabilityLabel(type), count: grouped[type].length }))
    .filter((item) => item.count > 0)
}

function isMarketplaceDetail(plugin: AgentPluginMarketplaceDetail | AgentPluginInfo | null): plugin is AgentPluginMarketplaceDetail {
  return !!plugin && 'marketplaceId' in plugin
}

function isInstalledPlugin(plugin: AgentPluginMarketplaceDetail | AgentPluginInfo | null): plugin is AgentPluginInfo {
  return !!plugin && 'kind' in plugin
}

function pluginCapabilities(plugin: AgentPluginMarketplaceDetail | AgentPluginInfo | null): AgentPluginCapability[] {
  if (!plugin) return []
  if (isInstalledPlugin(plugin)) return plugin.capabilities
  return plugin.capabilities ?? []
}

function pluginName(plugin: AgentPluginMarketplaceDetail | AgentPluginInfo | null): string {
  if (!plugin) return ''
  return plugin.name
}

function pluginVersion(plugin: AgentPluginMarketplaceDetail | AgentPluginInfo | null): string | undefined {
  if (!plugin) return undefined
  if (isInstalledPlugin(plugin)) return plugin.version
  return plugin.version ?? plugin.manifest?.version
}

function pluginInstalledVersion(plugin: AgentPluginMarketplaceDetail | AgentPluginInfo | null): string | undefined {
  if (!plugin) return undefined
  if (isInstalledPlugin(plugin)) return plugin.version
  if (!plugin.installed) return undefined
  return plugin.manifest?.version
}

function pluginEnabled(plugin: AgentPluginMarketplaceDetail | AgentPluginInfo | null): boolean | null {
  if (!plugin) return null
  if (isInstalledPlugin(plugin)) return plugin.enabled
  return plugin.enabled ?? null
}

function pluginInstalled(plugin: AgentPluginMarketplaceDetail | AgentPluginInfo | null): boolean {
  if (!plugin) return false
  if (isInstalledPlugin(plugin)) return true
  return plugin.installed
}

function pluginHomepage(plugin: AgentPluginMarketplaceDetail | AgentPluginInfo | null): string | undefined {
  if (!plugin) return undefined
  if (isInstalledPlugin(plugin)) return plugin.homepage
  return plugin.manifest?.homepage
}

function pluginRepository(plugin: AgentPluginMarketplaceDetail | AgentPluginInfo | null): string | undefined {
  if (!plugin) return undefined
  if (isInstalledPlugin(plugin)) return plugin.repository
  return plugin.manifest?.repository
}

function pluginAuthor(plugin: AgentPluginMarketplaceDetail | AgentPluginInfo | null): string | undefined {
  if (!plugin) return undefined
  if (isInstalledPlugin(plugin)) return plugin.author
  return plugin.manifest?.author?.name
}
