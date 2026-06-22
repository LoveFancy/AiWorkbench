import * as React from 'react'
import { ChevronDown, Info, KeyRound, Loader2, LogIn, MoreHorizontal, Package, Plus, RefreshCw } from 'lucide-react'
import { useAtomValue, useSetAtom } from 'jotai'
import { toast } from 'sonner'
import type { AgentPluginMarketplace, AgentPluginMarketplaceDetail, AgentPluginMarketplacePlugin } from '@proma/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { authStateAtom, loginDialogOpenAtom } from '@/auth/renderer'
import { settingsOpenAtom } from '@/atoms/settings-tab'
import { cn } from '@/lib/utils'
import { getCapabilityToastId } from '@/lib/capabilities-toast'
import { inferMarketplaceInput, supportsMarketplaceBranch } from '@/lib/plugin-marketplace-input'
import type { SkillMarketItem } from './skill-market-types'
import { SkillMarketCard } from './SkillMarketCard'
import { SkillMarketDetailSheet } from './SkillMarketDetailSheet'
import { PluginDetailSheet } from './PluginDetailSheet'

interface SkillMarketPanelProps {
  workspaceSlug: string
  query: string
  installedSkillNames: Set<string>
  onInstalled: () => void | Promise<void>
}

type MarketSource = 'skillhub' | 'plugins'
const MARKET_SOURCES: Array<{ value: MarketSource; label: string; description: string }> = [
  {
    value: 'skillhub',
    label: '华泰 SkillHub',
    description: '公司内部维护的 Skill 能力库，适合安装经过团队沉淀和权限认证的工作流技能。',
  },
  {
    value: 'plugins',
    label: '插件市场',
    description: 'Claude Code 插件生态入口，适合安装包含 Skills、Commands、Agents 或 MCP 的插件包。',
  },
]
const SKILLHUB_PAGE_SIZE = 20
const SKILLHUB_SEARCH_DEBOUNCE_MS = 300

function useDebouncedValue(value: string, delayMs: number): string {
  const [debouncedValue, setDebouncedValue] = React.useState(value)

  React.useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedValue(value), delayMs)
    return () => window.clearTimeout(timer)
  }, [delayMs, value])

  return debouncedValue
}

export function SkillMarketPanel({ workspaceSlug, query, installedSkillNames, onInstalled }: SkillMarketPanelProps): React.ReactElement {
  const authState = useAtomValue(authStateAtom)
  const setLoginDialogOpen = useSetAtom(loginDialogOpenAtom)
  const setSettingsOpen = useSetAtom(settingsOpenAtom)

  const [source, setSource] = React.useState<MarketSource>('skillhub')
  const [skills, setSkills] = React.useState<SkillMarketItem[]>([])
  const [loading, setLoading] = React.useState(false)
  const [skillHubRefreshing, setSkillHubRefreshing] = React.useState(false)
  const [authLoading, setAuthLoading] = React.useState(false)
  const [authenticated, setAuthenticated] = React.useState<boolean | null>(null)
  const [installing, setInstalling] = React.useState<string | null>(null)
  const [selectedSkill, setSelectedSkill] = React.useState<SkillMarketItem | null>(null)
  const [detailContent, setDetailContent] = React.useState<string | null>(null)
  const [detailLoading, setDetailLoading] = React.useState(false)
  const [page, setPage] = React.useState(1)
  const [hasMore, setHasMore] = React.useState(false)
  const [loadingMore, setLoadingMore] = React.useState(false)
  const loadMoreRef = React.useRef<HTMLDivElement | null>(null)
  const requestSeqRef = React.useRef(0)
  const debouncedQuery = useDebouncedValue(query, SKILLHUB_SEARCH_DEBOUNCE_MS)

  const checkAuth = React.useCallback(async (): Promise<boolean> => {
    try {
      const status = await window.electronAPI.getSkillHubAuthStatus()
      setAuthenticated(status.authenticated)
      return status.authenticated
    } catch {
      setAuthenticated(false)
      return false
    }
  }, [])

  const loadSkills = React.useCallback(async (nextPage = 1): Promise<void> => {
    if (!workspaceSlug) return
    const requestSeq = requestSeqRef.current + 1
    requestSeqRef.current = requestSeq
    const keyword = debouncedQuery.trim() || undefined
    if (nextPage === 1) setLoading(true)
    else setLoadingMore(true)
    try {
      const result = await window.electronAPI.getHtSkillHubSkills(workspaceSlug, nextPage, keyword, undefined, SKILLHUB_PAGE_SIZE)
      if (requestSeq !== requestSeqRef.current) return

      const pageItems = result.items.filter((skill) => !installedSkillNames.has(skill.name))
      setSkills((prev) => nextPage === 1 ? pageItems : [...prev, ...pageItems])
      setPage(result.page)
      setHasMore(result.hasMore)
    } catch (error) {
      if (requestSeq !== requestSeqRef.current) return
      console.error('[技能市场] 加载失败:', error)
      toast.error('加载技能市场失败', { description: error instanceof Error ? error.message : '未知错误' })
    } finally {
      if (requestSeq === requestSeqRef.current) {
        if (nextPage === 1) setLoading(false)
        else setLoadingMore(false)
      }
    }
  }, [debouncedQuery, installedSkillNames, workspaceSlug])

  React.useEffect(() => {
    if (source !== 'skillhub') return
    void (async () => {
      const ok = await checkAuth()
      if (ok) void loadSkills(1)
    })()
  }, [checkAuth, loadSkills, source])

  React.useEffect(() => {
    if (source !== 'skillhub' || !authenticated || !hasMore || loading || loadingMore) return
    const sentinel = loadMoreRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0]
      if (!entry?.isIntersecting) return
      void loadSkills(page + 1)
    }, { rootMargin: '240px' })

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [authenticated, hasMore, loadSkills, loading, loadingMore, page, source])

  const handleAuthenticate = React.useCallback(async (): Promise<void> => {
    setAuthLoading(true)
    try {
      await window.electronAPI.skillHubAuthenticate()
      const ok = await checkAuth()
      if (ok) void loadSkills(1)
    } catch (error) {
      toast.error('SkillHub 认证失败', { description: error instanceof Error ? error.message : '未知错误' })
    } finally {
      setAuthLoading(false)
    }
  }, [checkAuth, loadSkills])

  const handleRefreshSkillHub = React.useCallback(async (): Promise<void> => {
    if (skillHubRefreshing || loading || loadingMore) return
    setSkillHubRefreshing(true)
    try {
      const ok = await checkAuth()
      if (ok) await loadSkills(1)
    } finally {
      setSkillHubRefreshing(false)
    }
  }, [checkAuth, loadSkills, loading, loadingMore, skillHubRefreshing])

  const handleLogin = React.useCallback((): void => {
    setSettingsOpen(false)
    setTimeout(() => setLoginDialogOpen(true), 200)
  }, [setLoginDialogOpen, setSettingsOpen])

  const handleInstall = React.useCallback(async (skill: SkillMarketItem): Promise<void> => {
    if (installing) return
    setInstalling(skill.name)
    try {
      await window.electronAPI.installHtSkillHubSkill(workspaceSlug, skill.name, false)
      toast.success(`已安装：${skill.displayName || skill.name}`, {
        id: getCapabilityToastId({ type: 'skill_added', name: skill.name }),
      })
      await onInstalled()
      setSkills((prev) => prev.filter((item) => item.name !== skill.name))
      setSelectedSkill((current) => current?.name === skill.name ? { ...current, installed: true } : current)
    } catch (error) {
      toast.error('安装失败', { description: error instanceof Error ? error.message : '未知错误' })
    } finally {
      setInstalling(null)
    }
  }, [installing, onInstalled, workspaceSlug])

  const openDetail = React.useCallback((skill: SkillMarketItem): void => {
    setSelectedSkill(skill)
    setDetailContent(null)
    setDetailLoading(true)
    window.electronAPI.readHtSkillHubSkill(skill.name)
      .then(setDetailContent)
      .catch((error) => {
        console.error('[技能市场] 读取详情失败:', error)
        setDetailContent(null)
      })
      .finally(() => setDetailLoading(false))
  }, [])

  return (
    <>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            {MARKET_SOURCES.map((item) => (
              <Tooltip key={item.value}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => setSource(item.value)}
                    className={cn(
                      'flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors',
                      source === item.value ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <span>{item.label}</span>
                    <Info size={13} className="text-muted-foreground" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[280px] text-xs leading-5">
                  {item.description}
                </TooltipContent>
              </Tooltip>
            ))}
          </div>

          {source === 'skillhub' && (
            <button
              type="button"
              onClick={() => void handleRefreshSkillHub()}
              disabled={skillHubRefreshing || loading || loadingMore}
              className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-border/60 bg-content-area px-3 text-[13px] font-medium text-foreground/75 shadow-sm transition-colors hover:bg-foreground/[0.04] disabled:cursor-not-allowed disabled:opacity-60"
              title="刷新 SkillHub"
            >
              <RefreshCw size={14} className={skillHubRefreshing || loading ? 'animate-spin' : undefined} />
              <span>刷新 SkillHub</span>
            </button>
          )}
        </div>

        {source === 'skillhub' ? (
          <SkillHubMarketContent
            authStateLoggedIn={authState.isLoggedIn}
            authenticated={authenticated}
            authLoading={authLoading}
            loading={loading}
            loadingMore={loadingMore}
            hasMore={hasMore}
            loadMoreRef={loadMoreRef}
            skills={skills}
            installing={installing}
            onLogin={handleLogin}
            onAuthenticate={() => void handleAuthenticate()}
            onOpenDetail={openDetail}
            onInstall={(skill) => void handleInstall(skill)}
          />
        ) : (
          <PluginMarketContent query={query} onInstalled={onInstalled} />
        )}
      </div>

      <SkillMarketDetailSheet
        skill={selectedSkill}
        content={detailContent}
        loadingContent={detailLoading}
        installing={selectedSkill ? installing === selectedSkill.name : false}
        onOpenChange={(open) => { if (!open) setSelectedSkill(null) }}
        onInstall={(skill) => void handleInstall(skill)}
      />
    </>
  )
}

interface SkillHubMarketContentProps {
  authStateLoggedIn: boolean
  authenticated: boolean | null
  authLoading: boolean
  loading: boolean
  loadingMore: boolean
  hasMore: boolean
  loadMoreRef: React.RefObject<HTMLDivElement>
  skills: SkillMarketItem[]
  installing: string | null
  onLogin: () => void
  onAuthenticate: () => void
  onOpenDetail: (skill: SkillMarketItem) => void
  onInstall: (skill: SkillMarketItem) => void
}

function SkillHubMarketContent({ authStateLoggedIn, authenticated, authLoading, loading, loadingMore, hasMore, loadMoreRef, skills, installing, onLogin, onAuthenticate, onOpenDetail, onInstall }: SkillHubMarketContentProps): React.ReactElement {
  if (!authStateLoggedIn) {
    return (
      <div className="rounded-lg border border-dashed border-border/70 bg-content-area px-4 py-8 text-center">
        <div className="text-sm font-medium text-foreground">登录后访问华泰 SkillHub</div>
        <div className="mt-1 text-xs text-muted-foreground">华泰 SkillHub 需要 OA 登录和 SkillHub 认证。</div>
        <Button size="sm" className="mt-4" onClick={onLogin}>
          <LogIn size={14} />
          登录 OA
        </Button>
      </div>
    )
  }

  if (authenticated === false) {
    return (
      <div className="rounded-lg border border-dashed border-border/70 bg-content-area px-4 py-8 text-center">
        <div className="text-sm font-medium text-foreground">需要认证 SkillHub</div>
        <div className="mt-1 text-xs text-muted-foreground">认证后可以浏览和安装公司技能。</div>
        <Button size="sm" className="mt-4" onClick={onAuthenticate} disabled={authLoading}>
          <RefreshCw size={14} className={authLoading ? 'animate-spin' : undefined} />
          {authLoading ? '认证中' : '认证 SkillHub'}
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {loading ? (
        <div className="py-10 text-center text-sm text-muted-foreground">加载中...</div>
      ) : skills.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/70 py-10 text-center text-sm text-muted-foreground">没有匹配的 SkillHub 技能</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {skills.map((skill) => (
            <SkillMarketCard
              key={skill.name}
              skill={skill}
              installing={installing === skill.name}
              onOpen={() => onOpenDetail(skill)}
              onInstall={() => onInstall(skill)}
            />
          ))}
        </div>
      )}
      {skills.length > 0 && (
        <div ref={loadMoreRef} className="py-2 text-center text-xs text-muted-foreground">
          {loadingMore ? '继续加载中...' : hasMore ? '向下滚动加载更多' : '已加载全部'}
        </div>
      )}
    </div>
  )
}

function PluginMarketContent({ query, onInstalled }: { query: string; onInstalled: () => void | Promise<void> }): React.ReactElement {
  const [marketplaces, setMarketplaces] = React.useState<AgentPluginMarketplace[]>([])
  const [plugins, setPlugins] = React.useState<AgentPluginMarketplacePlugin[]>([])
  const [selectedMarketplaceId, setSelectedMarketplaceId] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [refreshing, setRefreshing] = React.useState<string | null>(null)
  const [removing, setRemoving] = React.useState<string | null>(null)
  const [installing, setInstalling] = React.useState<string | null>(null)
  const [addOpen, setAddOpen] = React.useState(false)
  const [sourceInput, setSourceInput] = React.useState('')
  const [marketplaceAdvancedOpen, setMarketplaceAdvancedOpen] = React.useState(false)
  const [marketplaceBranchInput, setMarketplaceBranchInput] = React.useState('main')
  const [marketplaceAuthMode, setMarketplaceAuthMode] = React.useState<'none' | 'token'>('none')
  const [marketplaceTokenInput, setMarketplaceTokenInput] = React.useState('')
  const [adding, setAdding] = React.useState(false)
  const [pendingRemoveMarketplace, setPendingRemoveMarketplace] = React.useState<AgentPluginMarketplace | null>(null)
  const [selectedPlugin, setSelectedPlugin] = React.useState<AgentPluginMarketplaceDetail | null>(null)
  const [detailLoading, setDetailLoading] = React.useState(false)

  const load = React.useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      const [nextMarketplaces, nextPlugins] = await Promise.all([
        window.electronAPI.listAgentPluginMarketplaces(),
        window.electronAPI.searchAgentPluginMarketplace(query.trim()),
      ])
      setMarketplaces(nextMarketplaces)
      setPlugins(nextPlugins)
      if (selectedMarketplaceId && !nextMarketplaces.some((item) => item.id === selectedMarketplaceId)) {
        setSelectedMarketplaceId(null)
      }
    } catch (error) {
      toast.error('加载插件市场失败', { description: error instanceof Error ? error.message : '未知错误' })
    } finally {
      setLoading(false)
    }
  }, [query, selectedMarketplaceId])

  React.useEffect(() => {
    void load()
  }, [load])

  const visiblePlugins = React.useMemo(
    () => selectedMarketplaceId ? plugins.filter((plugin) => plugin.marketplaceId === selectedMarketplaceId) : plugins,
    [plugins, selectedMarketplaceId],
  )
  const inferredMarketplace = React.useMemo(() => {
    if (!sourceInput.trim()) return null
    try {
      return inferMarketplaceInput(sourceInput)
    } catch {
      return null
    }
  }, [sourceInput])
  const branchSupported = inferredMarketplace ? supportsMarketplaceBranch(inferredMarketplace.type) : true

  const handleSourceInputChange = React.useCallback((value: string): void => {
    setSourceInput(value)
    if (!value.trim()) {
      setMarketplaceBranchInput('main')
      return
    }
    try {
      const inferred = inferMarketplaceInput(value)
      if (inferred.branch) setMarketplaceBranchInput(inferred.branch)
    } catch {
      // 输入过程中可能暂时不是合法地址，保持当前分支选择。
    }
  }, [])

  const handleRefresh = async (marketplace: AgentPluginMarketplace): Promise<void> => {
    if (refreshing || removing) return
    setRefreshing(marketplace.id)
    try {
      await window.electronAPI.refreshAgentPluginMarketplace(marketplace.id)
      toast.success('插件市场已刷新')
      await load()
    } catch (error) {
      toast.error('刷新插件市场失败', { description: error instanceof Error ? error.message : '未知错误' })
      await load()
    } finally {
      setRefreshing(null)
    }
  }

  const handleRefreshCurrentPluginMarket = async (): Promise<void> => {
    if (refreshing || removing || loading) return
    const selectedMarketplace = selectedMarketplaceId
      ? marketplaces.find((marketplace) => marketplace.id === selectedMarketplaceId)
      : null

    if (selectedMarketplace) {
      await handleRefresh(selectedMarketplace)
      return
    }

    setRefreshing('__all__')
    try {
      await Promise.all(marketplaces.map((marketplace) => window.electronAPI.refreshAgentPluginMarketplace(marketplace.id)))
      await load()
    } catch (error) {
      toast.error('刷新插件市场失败', { description: error instanceof Error ? error.message : '未知错误' })
      await load()
    } finally {
      setRefreshing(null)
    }
  }

  const handleRemove = async (marketplace: AgentPluginMarketplace): Promise<void> => {
    if (refreshing || removing) return
    setRemoving(marketplace.id)
    try {
      await window.electronAPI.removeAgentPluginMarketplace(marketplace.id)
      toast.success('插件市场已删除')
      if (selectedMarketplaceId === marketplace.id) setSelectedMarketplaceId(null)
      await load()
    } catch (error) {
      toast.error('删除插件市场失败', { description: error instanceof Error ? error.message : '未知错误' })
    } finally {
      setRemoving(null)
    }
  }

  const handleInstall = async (plugin: AgentPluginMarketplacePlugin): Promise<void> => {
    const key = `${plugin.marketplaceId}:${plugin.name}`
    if (installing) return
    setInstalling(key)
    try {
      await window.electronAPI.installAgentMarketplacePlugin({
        marketplaceId: plugin.marketplaceId,
        pluginName: plugin.name,
        enable: true,
        overwrite: plugin.installed,
      })
      toast.success(plugin.installed ? '插件已更新' : '插件已安装')
      await load()
      const detail = await window.electronAPI.getAgentPluginMarketplaceDetail(plugin.marketplaceId, plugin.name)
      setSelectedPlugin((current) => current && current.marketplaceId === plugin.marketplaceId && current.name === plugin.name ? detail : current)
      await onInstalled()
    } catch (error) {
      toast.error('安装插件失败', { description: error instanceof Error ? error.message : '未知错误' })
    } finally {
      setInstalling(null)
    }
  }

  const openPluginDetail = React.useCallback((plugin: AgentPluginMarketplacePlugin): void => {
    setSelectedPlugin({
      ...plugin,
      capabilities: [],
    })
    setDetailLoading(true)
    window.electronAPI.getAgentPluginMarketplaceDetail(plugin.marketplaceId, plugin.name)
      .then(setSelectedPlugin)
      .catch((error) => {
        toast.error('加载插件详情失败', { description: error instanceof Error ? error.message : '未知错误' })
      })
      .finally(() => setDetailLoading(false))
  }, [])

  const handleAddMarketplace = async (): Promise<void> => {
    if (!sourceInput.trim() || (marketplaceAuthMode === 'token' && !marketplaceTokenInput.trim()) || adding) return
    setAdding(true)
    try {
      const inferred = inferMarketplaceInput(sourceInput)
      await window.electronAPI.addAgentPluginMarketplace({
        id: inferred.id,
        name: inferred.name,
        source: inferred.source,
        type: inferred.type,
        ...(supportsMarketplaceBranch(inferred.type) && {
          branch: marketplaceBranchInput.trim() || inferred.branch || 'main',
        }),
        auth: marketplaceAuthMode === 'token'
          ? { type: 'token', token: marketplaceTokenInput.trim() }
          : { type: 'none' },
      })
      await window.electronAPI.refreshAgentPluginMarketplace(inferred.id)
      toast.success('插件市场已添加')
      setSelectedMarketplaceId(inferred.id)
      setSourceInput('')
      setMarketplaceAdvancedOpen(false)
      setMarketplaceBranchInput('main')
      setMarketplaceAuthMode('none')
      setMarketplaceTokenInput('')
      setAddOpen(false)
      await load()
    } catch (error) {
      toast.error('添加插件市场失败', { description: error instanceof Error ? error.message : '未知错误' })
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
          <button
            type="button"
            onClick={() => setSelectedMarketplaceId(null)}
            className={cn(
              'h-8 shrink-0 rounded-md px-3 text-xs font-medium transition-colors',
              selectedMarketplaceId === null ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            全部市场
          </button>
          {marketplaces.map((marketplace) => (
            <div
              key={marketplace.id}
              className={cn(
                'flex h-8 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-medium transition-colors',
                selectedMarketplaceId === marketplace.id ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <button
                type="button"
                onClick={() => setSelectedMarketplaceId(marketplace.id)}
                className="max-w-[180px] truncate px-1"
                title={marketplace.name}
              >
                {marketplace.name}
              </button>
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    title="市场操作"
                  >
                    {refreshing === marketplace.id || removing === marketplace.id ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <MoreHorizontal size={13} />
                    )}
                  </button>
                </PopoverTrigger>
                <PopoverContent align="center" sideOffset={4} className="w-[86px] rounded-lg p-1">
                  <button
                    type="button"
                    onClick={() => void handleRefresh(marketplace)}
                    disabled={refreshing !== null || removing !== null}
                    className="flex h-7 w-full items-center justify-center rounded-md text-xs font-medium text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    刷新
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingRemoveMarketplace(marketplace)}
                    disabled={refreshing !== null || removing !== null}
                    className="flex h-7 w-full items-center justify-center rounded-md text-xs font-medium text-red-600 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    删除
                  </button>
                </PopoverContent>
              </Popover>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="flex size-8 shrink-0 items-center justify-center rounded-full border border-dashed border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
            title="添加市场"
          >
            <Plus size={15} />
          </button>
        </div>

        <button
          type="button"
          onClick={() => void handleRefreshCurrentPluginMarket()}
          disabled={loading || refreshing !== null || removing !== null || marketplaces.length === 0}
          className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-border/60 bg-content-area px-3 text-[13px] font-medium text-foreground/75 shadow-sm transition-colors hover:bg-foreground/[0.04] disabled:cursor-not-allowed disabled:opacity-60"
          title="刷新插件市场"
        >
          <RefreshCw size={14} className={loading || refreshing !== null ? 'animate-spin' : undefined} />
          <span>刷新插件市场</span>
        </button>
      </div>

      {loading ? (
        <div className="py-10 text-center text-sm text-muted-foreground">加载中...</div>
      ) : marketplaces.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/70 py-10 text-center">
          <div className="text-sm font-medium text-foreground">暂无插件市场</div>
          <div className="mt-1 text-xs text-muted-foreground">添加市场后可以浏览和安装插件。</div>
          <Button size="sm" className="mt-4" onClick={() => setAddOpen(true)}>
            <Plus size={14} />
            添加市场
          </Button>
        </div>
      ) : visiblePlugins.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/70 py-10 text-center text-sm text-muted-foreground">没有匹配的插件</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visiblePlugins.map((plugin) => {
            const key = `${plugin.marketplaceId}:${plugin.name}`
            return (
              <PluginMarketCard
                key={key}
                plugin={plugin}
                installing={installing === key}
                onOpen={() => openPluginDetail(plugin)}
                onInstall={() => void handleInstall(plugin)}
              />
            )
          })}
        </div>
      )}

      <Dialog
        open={addOpen}
        onOpenChange={(open) => {
          if (adding) return
          setAddOpen(open)
          if (!open) {
            setSourceInput('')
            setMarketplaceAdvancedOpen(false)
            setMarketplaceBranchInput('main')
            setMarketplaceAuthMode('none')
            setMarketplaceTokenInput('')
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加市场</DialogTitle>
            {!adding && (
              <DialogDescription>
                支持 GitHub、Gitee、GitLab、Raw URL 或本地 marketplace.json。
              </DialogDescription>
            )}
          </DialogHeader>
          {adding ? (
            <div className="flex min-h-[300px] flex-col items-center justify-center gap-5">
              <Loader2 size={44} className="animate-spin text-primary" />
              <div className="text-sm font-medium text-foreground">正在下载市场...</div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">市场源 *</label>
                <Input
                  value={sourceInput}
                  onChange={(event) => handleSourceInputChange(event.target.value)}
                  placeholder="owner/repo 或 https://..."
                />
              </div>
              <div className="text-xs leading-5 text-muted-foreground">
                <div>示例：owner/repo（GitHub）、git@gitlab.example.com:owner/repo.git、https://example.com/marketplace.json、./path/to/marketplace</div>
              </div>
              <div className="rounded-lg border border-dashed border-border/60 bg-muted/20">
                <button
                  type="button"
                  className="flex h-8 w-full items-center justify-between px-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                  onClick={() => setMarketplaceAdvancedOpen((open) => !open)}
                >
                  <span>高级选项</span>
                  <ChevronDown size={14} className={cn('transition-transform', marketplaceAdvancedOpen && 'rotate-180')} />
                </button>
                {marketplaceAdvancedOpen && (
                  <div className="space-y-2 border-t border-border/50 px-3 pb-3 pt-2">
                    {branchSupported ? (
                      <>
                        <label className="text-xs font-medium text-foreground/80">读取分支</label>
                        <Input
                          value={marketplaceBranchInput}
                          onChange={(event) => setMarketplaceBranchInput(event.target.value)}
                          placeholder="main"
                          className="h-8 text-sm"
                        />
                        <div className="text-[11px] leading-5 text-muted-foreground">仓库型市场读取 .claude-plugin/marketplace.json 的分支，默认 main。</div>
                      </>
                    ) : (
                      <div className="text-xs leading-5 text-muted-foreground">当前市场源不需要配置读取分支。</div>
                    )}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium">访问方式</div>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={marketplaceAuthMode === 'none' ? 'secondary' : 'outline'}
                    onClick={() => {
                      setMarketplaceAuthMode('none')
                      setMarketplaceTokenInput('')
                    }}
                  >
                    公开市场
                  </Button>
                  <Button
                    type="button"
                    variant={marketplaceAuthMode === 'token' ? 'secondary' : 'outline'}
                    onClick={() => setMarketplaceAuthMode('token')}
                  >
                    <KeyRound size={16} className="mr-2" />
                    Token 认证
                  </Button>
                </div>
              </div>
              {marketplaceAuthMode === 'token' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">访问 Token *</label>
                  <Input
                    type="password"
                    value={marketplaceTokenInput}
                    onChange={(event) => setMarketplaceTokenInput(event.target.value)}
                    placeholder="用于读取私有插件市场"
                  />
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={adding}
              onClick={() => {
                setSourceInput('')
                setMarketplaceAdvancedOpen(false)
                setMarketplaceBranchInput('main')
                setMarketplaceAuthMode('none')
                setMarketplaceTokenInput('')
                setAddOpen(false)
              }}
            >
              取消
            </Button>
            <Button disabled={!sourceInput.trim() || (marketplaceAuthMode === 'token' && !marketplaceTokenInput.trim()) || adding} onClick={() => void handleAddMarketplace()}>
              {adding && <Loader2 size={16} className="mr-2 animate-spin" />}
              提交
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={pendingRemoveMarketplace !== null}
        onOpenChange={(open) => { if (!open) setPendingRemoveMarketplace(null) }}
        title={`删除插件市场「${pendingRemoveMarketplace?.name ?? ''}」？`}
        description="删除后会移除该市场缓存和列表入口，已安装的插件不会被删除。"
        confirmLabel="删除"
        loadingLabel="删除中..."
        loading={pendingRemoveMarketplace ? removing === pendingRemoveMarketplace.id : false}
        onConfirm={async () => {
          if (!pendingRemoveMarketplace) return
          await handleRemove(pendingRemoveMarketplace)
          setPendingRemoveMarketplace(null)
        }}
      />

      <PluginDetailSheet
        mode="market"
        plugin={selectedPlugin}
        loading={detailLoading}
        installing={selectedPlugin ? installing === `${selectedPlugin.marketplaceId}:${selectedPlugin.name}` : false}
        sourceLabel={selectedPlugin?.marketplaceName}
        onOpenChange={(open) => { if (!open) setSelectedPlugin(null) }}
        onInstall={(plugin) => void handleInstall(plugin)}
      />
    </div>
  )
}

function PluginMarketCard({ plugin, installing, onOpen, onInstall }: { plugin: AgentPluginMarketplacePlugin; installing: boolean; onOpen: () => void; onInstall: () => void }): React.ReactElement {
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
      className="group relative flex h-full cursor-pointer flex-col gap-3 rounded-xl border border-border/60 bg-content-area p-4 text-left transition-all hover:border-border hover:shadow-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      <div className="flex items-start gap-3">
        <div className="shrink-0 rounded-xl bg-violet-500/10 p-2 text-violet-500 shadow-sm">
          <Package size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-medium text-foreground">{plugin.name}</span>
            <span className="shrink-0 rounded-md bg-violet-500/10 px-1.5 py-0.5 text-[11px] font-medium text-violet-600 dark:text-violet-300">套件</span>
            {plugin.version && (
              <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                v{plugin.version}
              </span>
            )}
          </div>
          <div className="mt-0.5 truncate text-xs text-muted-foreground">市场 ({plugin.marketplaceName || plugin.marketplaceId})</div>
        </div>
      </div>

      <p className="line-clamp-2 min-h-[40px] text-[13px] leading-6 text-muted-foreground">
        {plugin.description || '暂无描述'}
      </p>

      <div className="mt-auto flex items-center gap-2">
        <span className="truncate rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
          插件套件
        </span>
        {plugin.enabled && (
          <span className="rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-300">
            已启用
          </span>
        )}
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onInstall()
          }}
          disabled={installing}
          className={cn(
            'ml-auto flex shrink-0 items-center justify-center rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-60',
            plugin.installed
              ? 'h-7 px-2 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/15 dark:text-emerald-300'
              : 'size-7 bg-muted text-muted-foreground hover:bg-primary hover:text-primary-foreground',
          )}
          title={plugin.installed ? '更新' : '安装'}
        >
          {installing ? <Loader2 size={15} className="animate-spin" /> : plugin.installed ? <span className="text-xs font-medium">已安装</span> : <Plus size={15} />}
        </button>
      </div>
    </div>
  )
}
