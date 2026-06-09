import React from 'react'
import { Search, RefreshCw, ShieldCheck, Sparkles, FolderOpen, Download, RotateCw, ArrowUp, Power, PowerOff, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { HtSkillHubSkill } from '@proma/shared'
import { SettingsSection } from '../primitives'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { AuthStatusBar, AuthErrorBar } from './AuthStatusBar'
import { SkillCard } from './SkillCard'

interface SkillHubPanelProps {
  workspaceSlug: string
  workspaceName: string
  refreshKey: number
  onInstalled: () => void
  skillsDir: string
}

type HubFilter = 'all' | 'installed' | 'uninstalled'

/**
 * SkillHub 面板主组件
 *
 * 认证 → 列表（搜索/筛选/滚动加载） → 预览 → 安装/卸载/启用/禁用/更新
 */
export function SkillHubPanel({ workspaceSlug, workspaceName, refreshKey, onInstalled, skillsDir }: SkillHubPanelProps): React.ReactElement {
  const [skills, setSkills] = React.useState<HtSkillHubSkill[]>([])
  const [selectedName, setSelectedName] = React.useState<string | null>(null)
  const [query, setQuery] = React.useState('')
  const [category, setCategory] = React.useState('')
  const [filter, setFilter] = React.useState<HubFilter>('all')
  const [loading, setLoading] = React.useState(true)
  const [installing, setInstalling] = React.useState<string | null>(null)

  // 滚动分页
  const [page, setPage] = React.useState(1)
  const [hasMore, setHasMore] = React.useState(true)

  // 更新检测
  const [updates, setUpdates] = React.useState<Map<string, boolean>>(new Map())
  const [, setUpdatesChecked] = React.useState(false)

  // 批量安装（仅"未安装"tab）
  const [batchSelected, setBatchSelected] = React.useState<Set<string>>(new Set())

  // 确认弹窗
  const [confirmOpen, setConfirmOpen] = React.useState(false)
  const confirmSkill = React.useRef<HtSkillHubSkill | null>(null)

  // loadMore 用 ref 读取最新 query/category，避免因键入导致回调重建
  const queryRef = React.useRef(query)
  queryRef.current = query
  const categoryRef = React.useRef(category)
  categoryRef.current = category

  // ===== 认证状态 =====
  const [authStatus, setAuthStatus] = React.useState<{ authenticated: boolean; expiresAt?: number; remainingSeconds?: number } | null>(null)
  const [authLoading, setAuthLoading] = React.useState(false)
  const [authError, setAuthError] = React.useState(false)

  const checkAuth = React.useCallback(async (): Promise<boolean> => {
    try {
      const status = await window.electronAPI.getSkillHubAuthStatus()
      setAuthStatus(status)
      setAuthError(false)
      return status.authenticated
    } catch {
      setAuthError(true)
      return false
    }
  }, [])

  const handleAuthenticate = React.useCallback(async (): Promise<void> => {
    setAuthLoading(true)
    setAuthError(false)
    try {
      await window.electronAPI.skillHubAuthenticate()
      await checkAuth()
    } catch (error) {
      console.error('[SkillHub 认证] 失败:', error)
      if (error instanceof Error && error.message.includes('EIP')) {
        toast.error('请先登录 EIP 网关', { description: '认证 SkillHub 需要 EIP 凭证' })
      } else {
        setAuthError(true)
        toast.error('SkillHub 认证失败', { description: error instanceof Error ? error.message : '未知错误' })
      }
    } finally {
      setAuthLoading(false)
    }
  }, [checkAuth])

  const loadSkills = React.useCallback(async (keyword?: string, category?: string): Promise<void> => {
    setLoading(true)
    setPage(1)
    try {
      const list = await window.electronAPI.getHtSkillHubSkills(workspaceSlug, 1, keyword, category)
      setSkills(list)
      setHasMore(list.length >= 20)
      setSelectedName((current) => current && list.some((s) => s.name === current) ? current : list[0]?.name ?? null)
    } catch (error) {
      console.error('[华泰 SkillHub] 加载清单失败:', error)
      if (error instanceof Error && (error.message.includes('401') || error.message.includes('认证'))) {
        setAuthError(true)
        setAuthStatus({ authenticated: false })
      }
      toast.error('加载华泰 SkillHub 失败', { description: error instanceof Error ? error.message : '未知错误' })
    } finally {
      setLoading(false)
    }
  }, [workspaceSlug])

  const loadMore = React.useCallback(async (): Promise<void> => {
    if (!hasMore || loading) return
    const nextPage = page + 1
    try {
      const list = await window.electronAPI.getHtSkillHubSkills(workspaceSlug, nextPage, queryRef.current || undefined, categoryRef.current || undefined)
      if (list.length === 0 || list.length < 20) setHasMore(false)
      setPage(nextPage)
      setSkills((prev) => [...prev, ...list])
    } catch {
      setHasMore(false)
    }
  }, [workspaceSlug, page, hasMore, loading])

  React.useEffect(() => {
    void (async () => {
      const authed = await checkAuth()
      if (authed) {
        void loadSkills()
        // 认证完成后自动检查更新
        try {
          const result = await window.electronAPI.checkSkillUpdates(workspaceSlug)
          const map = new Map<string, boolean>()
          for (const u of result) {
            if (u.hasUpdate) map.set(u.skillName, true)
          }
          setUpdates(map)
          setUpdatesChecked(true)
        } catch { /* 检查更新失败不阻塞 */ }
      } else {
        setLoading(false)
      }
    })()
  }, [checkAuth, loadSkills, refreshKey])

  React.useEffect(() => {
    if (authStatus?.authenticated) {
      void loadSkills()
    }
  }, [authStatus?.authenticated])

  const handleRetry = React.useCallback((): void => {
    setPage(1)
    void (async () => {
      const authed = await checkAuth()
      if (authed) void loadSkills()
    })()
  }, [checkAuth, loadSkills])

  // ===== 远端搜索（全部/未安装模式下，query 或 category 变化时请求 API）=====
  // 注意：filter 切换由按钮 handler 统一触发 loadSkills，此 effect 仅响应输入变化
  React.useEffect(() => {
    if (filter !== 'all' && filter !== 'uninstalled') return
    if (!authStatus?.authenticated) return

    const q = query.trim()
    const c = category.trim()
    const timer = setTimeout(() => {
      void loadSkills(q || undefined, c || undefined)
    }, 300)
    return () => clearTimeout(timer)
  }, [query, category, authStatus?.authenticated, loadSkills])

  // ===== 操作处理 =====

  const handleInstall = React.useCallback(async (skill: HtSkillHubSkill): Promise<void> => {
    if (!authStatus?.authenticated) { toast.error('请先认证 SkillHub'); return }
    if (skill.installed) {
      confirmSkill.current = skill
      setConfirmOpen(true)
      return
    }
    await doInstall(skill)
  }, [authStatus])

  const doInstall = React.useCallback(async (skill: HtSkillHubSkill): Promise<void> => {
    setInstalling(skill.name)
    try {
      const overwrite = skill.installed
      const result = await window.electronAPI.installHtSkillHubSkill(workspaceSlug, skill.name, overwrite)
      toast.success(result.status === 'overwritten' ? `已覆盖安装: ${skill.name}` : `已安装: ${skill.name}`)
      onInstalled()
      await loadSkills()
    } catch (error) {
      toast.error('安装失败', { description: error instanceof Error ? error.message : '未知错误' })
    } finally {
      setInstalling(null)
    }
  }, [workspaceSlug, onInstalled, loadSkills])

  const handleBatchInstall = React.useCallback(async (): Promise<void> => {
    const names = Array.from(batchSelected)
    if (names.length === 0) return
    setInstalling('__batch__')
    try {
      await window.electronAPI.batchInstallHtSkillHubSkills(workspaceSlug, names, false)
      toast.success(`已安装 ${names.length} 个 Skill`)
      setBatchSelected(new Set())
      onInstalled()
      await loadSkills()
    } catch (error) {
      toast.error('批量安装失败', { description: error instanceof Error ? error.message : '未知错误' })
    } finally {
      setInstalling(null)
    }
  }, [workspaceSlug, batchSelected, onInstalled, loadSkills])

  const handleUninstall = React.useCallback(async (skillName: string): Promise<void> => {
    try {
      await window.electronAPI.uninstallHtSkillHubSkill(workspaceSlug, skillName)
      toast.success(`已卸载: ${skillName}`)
      await loadSkills()
    } catch (error) {
      toast.error('卸载失败', { description: error instanceof Error ? error.message : '未知错误' })
    }
  }, [workspaceSlug, loadSkills])

  const handleToggle = React.useCallback(async (skillName: string, enabled: boolean): Promise<void> => {
    try {
      await window.electronAPI.toggleWorkspaceSkill(workspaceSlug, skillName, enabled)
      toast.success(enabled ? `已启用: ${skillName}` : `已禁用: ${skillName}`)
      await loadSkills()
    } catch (error) {
      toast.error('操作失败', { description: error instanceof Error ? error.message : '未知错误' })
    }
  }, [workspaceSlug, loadSkills])

  const handleCheckUpdates = React.useCallback(async (): Promise<void> => {
    try {
      const result = await window.electronAPI.checkSkillUpdates(workspaceSlug)
      const map = new Map<string, boolean>()
      let count = 0
      for (const u of result) {
        if (u.hasUpdate) {
          map.set(u.skillName, true)
          count++
        }
      }
      setUpdates(map)
      setUpdatesChecked(true)
      toast.success(count > 0 ? `发现 ${count} 个 Skill 有更新` : '所有 Skill 已是最新版本')
    } catch {
      toast.error('检查更新失败')
    }
  }, [workspaceSlug])

  const handleUpdate = React.useCallback(async (skill: HtSkillHubSkill): Promise<void> => {
    setInstalling(skill.name)
    try {
      await window.electronAPI.installHtSkillHubSkill(workspaceSlug, skill.name, true)
      toast.success(`已更新: ${skill.name}`)
      setUpdates((prev) => { const m = new Map(prev); m.delete(skill.name); return m })
      await loadSkills()
    } catch (error) {
      toast.error('更新失败', { description: error instanceof Error ? error.message : '未知错误' })
    } finally {
      setInstalling(null)
    }
  }, [workspaceSlug, loadSkills])

  const openInstalledFolder = (skillName: string): void => {
    // 根据启用状态判断实际目录：禁用 → skills-inactive，启用 → skills
    const enabled = selectedSkill?.enabled !== false
    const dir = enabled ? skillsDir : skillsDir.replace(/skills$/, 'skills-inactive')
    window.electronAPI.openFile(`${dir}/${skillName}`)
  }

  // ===== 过滤 =====
  const selectedSkill = skills.find((s) => s.name === selectedName) ?? null

  const filteredSkills = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    const cat = category.trim().toLowerCase()
    // 全部/未安装模式：API 已按 keyword+category 过滤，客户端仅需按 installed 筛选
    const serverFiltered = filter === 'all' || filter === 'uninstalled'
    return skills.filter((skill) => {
      if (filter === 'installed' && !skill.installed) return false
      if (filter === 'uninstalled' && skill.installed) return false
      if (!serverFiltered) {
        if (q && !skill.name.toLowerCase().includes(q)) return false
        if (cat && !(skill as any).category?.toLowerCase().includes(cat)) return false
      }
      return true
    })
  }, [skills, query, category, filter])

  // ===== 滚动监听 =====
  const listRef = React.useRef<HTMLDivElement>(null)
  const handleScroll = React.useCallback(() => {
    const el = listRef.current
    if (!el) return
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 100) {
      void loadMore()
    }
  }, [loadMore])

  return (
    <SettingsSection
      title="华泰 SkillHub"
      description={`当前工作区: ${workspaceName}`}
      action={
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" onClick={handleCheckUpdates} disabled={loading}>
            <RefreshCw size={14} />
            <span>检查更新</span>
          </Button>
          <Button size="sm" variant="outline" onClick={() => void handleRetry()} disabled={loading || authLoading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : undefined} />
            <span>刷新</span>
          </Button>
        </div>
      }
    >
      {/* 认证状态栏 */}
      <div className="mb-3">
        {authError ? (
          <AuthErrorBar onRetry={handleRetry} />
        ) : (
          <AuthStatusBar
            status={authStatus}
            loading={authLoading}
            onAuthenticate={handleAuthenticate}
            onRetry={handleRetry}
          />
        )}
      </div>

      {/* 未认证 */}
      {!authStatus?.authenticated && !authLoading && (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-sm mb-2">请先登录 EIP 网关后连接 SkillHub</p>
          <Button size="sm" variant="outline" onClick={handleAuthenticate}>
            <ShieldCheck size={14} className="mr-1" />
            前往登录
          </Button>
        </div>
      )}

      {/* 已认证 */}
      {authStatus?.authenticated && (
      <div className="flex border border-border rounded-lg overflow-hidden min-h-[520px] max-h-[calc(100vh-260px)]">
        <div className="w-80 flex-shrink-0 border-r border-border bg-muted/20 flex flex-col min-h-0 max-h-[calc(100vh-260px)]">
          <div className="p-3 border-b border-border space-y-2">
            <div className="relative">
              <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => { setQuery(e.target.value); setPage(1) }}
                placeholder="搜索 Skill 名称"
                className="w-full h-8 rounded-md border border-border bg-background pl-8 pr-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <input
              value={category}
              onChange={(e) => { setCategory(e.target.value); setPage(1) }}
              placeholder="分类筛选（可选）"
              className="w-full h-8 rounded-md border border-border bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <div className="grid grid-cols-3 gap-1 rounded-md bg-background/70 p-1">
              {[
                { value: 'all', label: '全部' },
                { value: 'installed', label: '已安装' },
                { value: 'uninstalled', label: '未安装' },
              ].map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => {
                    const f = item.value as HubFilter
                    setFilter(f)
                    if (f === 'all' || f === 'uninstalled') {
                      void loadSkills(query.trim() || undefined, category.trim() || undefined)
                    } else {
                      void loadSkills()
                    }
                  }}
                  className={cn(
                    'h-7 rounded text-xs font-medium transition-colors',
                    filter === item.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* 批量安装栏（仅"未安装"） */}
          {filter === 'uninstalled' && filteredSkills.length > 0 && (
            <div className="px-3 py-2 border-b border-border bg-background/70 flex items-center gap-2 text-xs">
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => {
                  if (batchSelected.size === filteredSkills.length) setBatchSelected(new Set())
                  else setBatchSelected(new Set(filteredSkills.map(s => s.name)))
                }}
              >
                {batchSelected.size === filteredSkills.length ? '取消全选' : `全选 (${batchSelected.size}/${filteredSkills.length})`}
              </button>
              <div className="flex-1" />
              <Button
                size="sm"
                className="h-6 text-[10px]"
                onClick={handleBatchInstall}
                disabled={batchSelected.size === 0 || installing === '__batch__'}
              >
                {installing === '__batch__' ? <RefreshCw size={10} className="animate-spin" /> : <Download size={10} />}
                <span className="ml-0.5">批量安装 ({batchSelected.size})</span>
              </Button>
            </div>
          )}

          <div ref={listRef} className="flex-1 overflow-y-auto" onScroll={handleScroll}>
            {loading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">加载中...</div>
            ) : filteredSkills.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">没有匹配的 Skill</div>
            ) : (
              filteredSkills.map((skill) => (
                <SkillCard
                  key={skill.name}
                  skill={skill}
                  filter={filter}
                  batchChecked={batchSelected.has(skill.name)}
                  onToggleBatch={() => setBatchSelected(prev => {
                    const next = new Set(prev)
                    next.has(skill.name) ? next.delete(skill.name) : next.add(skill.name)
                    return next
                  })}
                  selected={selectedName === skill.name}
                  installing={installing === skill.name}
                  hasUpdate={updates.has(skill.name)}
                  onSelect={() => setSelectedName(skill.name)}
                  onInstall={() => void handleInstall(skill)}
                  onUninstall={() => void handleUninstall(skill.name)}
                  onToggle={() => void handleToggle(skill.name, skill.enabled === false)}
                  onUpdate={() => void handleUpdate(skill)}
                />
              ))
            )}
          </div>
        </div>

        {/* 右侧预览面板 */}
        <div className="flex-1 min-w-0 flex flex-col">
          {selectedSkill ? (
            <div className="flex flex-col min-h-0">
              <div className="shrink-0 border-b border-border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-semibold truncate">{selectedSkill.name}</h3>
                      {selectedSkill.installed && (
                        <span className={cn(
                          'rounded px-1.5 py-0.5 text-[11px] font-medium',
                          selectedSkill.enabled === false
                            ? 'bg-amber-500/10 text-amber-600'
                            : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
                        )}>
                          {selectedSkill.enabled === false ? '已禁用' : '已安装'}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground line-clamp-3">{selectedSkill.description || '暂无描述'}</p>
                  </div>
                  <div className="shrink-0 flex items-center gap-1">
                    {selectedSkill.installed && (
                      <>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8"
                                onClick={() => void handleToggle(selectedSkill.name, selectedSkill.enabled !== false)}
                              >
                                {selectedSkill.enabled === false ? <Power size={16} /> : <PowerOff size={16} />}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{selectedSkill.enabled === false ? '启用' : '禁用'}</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>

                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openInstalledFolder(selectedSkill.name)}>
                                <FolderOpen size={16} />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>打开目录</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>

                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                onClick={() => {
                                  if (confirm(`确认卸载「${selectedSkill.name}」？`)) {
                                    void handleUninstall(selectedSkill.name)
                                  }
                                }}
                              >
                                <Trash2 size={16} />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>卸载</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </>
                    )}
                    {updates.has(selectedSkill.name) ? (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => void handleUpdate(selectedSkill)} disabled={installing !== null}>
                              {installing === selectedSkill.name ? <RefreshCw size={16} className="animate-spin" /> : <ArrowUp size={16} />}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>更新</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => void handleInstall(selectedSkill)} disabled={installing !== null}>
                              {installing === selectedSkill.name
                                ? <RefreshCw size={16} className="animate-spin" />
                                : selectedSkill.installed ? <RotateCw size={16} /> : <Download size={16} />}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{selectedSkill.installed ? '覆盖安装' : '安装'}</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}

                  </div>
                </div>
              </div>

              <div className="p-4 space-y-4 overflow-y-auto">
                {/* 元数据 */}
                {(selectedSkill.version || selectedSkill.category || selectedSkill.author || selectedSkill.tags?.length) && (
                  <div className="p-4 border rounded-lg">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">元数据</div>
                    <div className="space-y-1.5">
                      {selectedSkill.displayName && (
                        <div className="flex items-start gap-3 text-xs"><span className="text-muted-foreground w-14 shrink-0">名称</span><span className="text-foreground truncate">{selectedSkill.displayName}</span></div>
                      )}
                      {selectedSkill.version && (
                        <div className="flex items-start gap-3 text-xs"><span className="text-muted-foreground w-14 shrink-0">版本</span><span className="text-foreground font-mono">{selectedSkill.version}</span></div>
                      )}
                      {selectedSkill.category && (
                        <div className="flex items-start gap-3 text-xs"><span className="text-muted-foreground w-14 shrink-0">分类</span><span className="text-foreground">{selectedSkill.category}</span></div>
                      )}
                      {selectedSkill.author && (
                        <div className="flex items-start gap-3 text-xs"><span className="text-muted-foreground w-14 shrink-0">作者</span><span className="text-foreground">{selectedSkill.author}</span></div>
                      )}
                      {selectedSkill.downloadCount !== undefined && (
                        <div className="flex items-start gap-3 text-xs"><span className="text-muted-foreground w-14 shrink-0">下载</span><span className="text-foreground">{selectedSkill.downloadCount.toLocaleString()}</span></div>
                      )}
                      {selectedSkill.tags && selectedSkill.tags.length > 0 && (
                        <div className="flex items-start gap-3 text-xs">
                          <span className="text-muted-foreground w-14 shrink-0">标签</span>
                          <span className="text-foreground flex flex-wrap gap-1">
                            {selectedSkill.tags.map((t) => (
                              <span key={t} className="rounded bg-muted px-1.5 py-0.5 text-[10px]">{t}</span>
                            ))}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {/* SKILL.md */}
                <div className="p-4 border rounded-lg">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">SKILL.md</div>
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <Markdown remarkPlugins={[remarkGfm]}>
                      {selectedSkill.description || '暂无描述'}
                    </Markdown>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
              选择一个 Skill 查看详情
            </div>
          )}
        </div>
      </div>
      )}

      {/* 覆盖安装确认弹窗 */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>覆盖安装确认</DialogTitle>
            <DialogDescription>
              当前工作区已安装 Skill「{confirmSkill.current?.name}」，覆盖安装将替换所有文件。是否继续？
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>取消</Button>
            <Button onClick={() => { setConfirmOpen(false); if (confirmSkill.current) void doInstall(confirmSkill.current) }}>
              确认覆盖
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsSection>
  )
}
