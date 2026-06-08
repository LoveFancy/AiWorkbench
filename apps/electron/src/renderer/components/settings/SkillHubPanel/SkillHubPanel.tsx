import React from 'react'
import { Search, RefreshCw, ShieldCheck, Download, RotateCw, Sparkles, FolderOpen, Play, Pause, Trash2, ArrowUp } from 'lucide-react'
import { toast } from 'sonner'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { HtSkillHubSkill } from '@proma/shared'
import { SettingsSection } from '../primitives'
import { AuthStatusBar, AuthErrorBar } from './AuthStatusBar'
import { SkillCard } from './SkillCard'
import { BatchToolbar } from './SkillCard'

interface SkillHubPanelProps {
  workspaceSlug: string
  workspaceName: string
  refreshKey: number
  onInstalled: () => void
  skillsDir: string
}

type HubFilter = 'all' | 'installed' | 'uninstalled'

interface BatchSelectState {
  selected: Set<string>
  mode: boolean
}

/**
 * SkillHub 面板主组件
 *
 * 认证 → 列表（搜索/筛选/滚动加载/批量） → 预览 → 安装/卸载/启用/禁用/更新
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

  // 批量操作
  const [batch, setBatch] = React.useState<BatchSelectState>({ selected: new Set(), mode: false })

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

  const loadSkills = React.useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      const list = await window.electronAPI.getHtSkillHubSkills(workspaceSlug)
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
    setPage(nextPage)
    try {
      const list = await window.electronAPI.getHtSkillHubSkills(workspaceSlug)
      if (list.length < 20) setHasMore(false)
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

  // ===== 操作处理 =====

  const handleInstall = React.useCallback(async (skill: HtSkillHubSkill): Promise<void> => {
    if (!authStatus?.authenticated) {
      toast.error('请先认证 SkillHub')
      return
    }
    const overwrite = skill.installed
    if (overwrite && !window.confirm(`确认覆盖安装 Skill「${skill.name}」？`)) return

    setInstalling(skill.name)
    try {
      const result = await window.electronAPI.installHtSkillHubSkill(workspaceSlug, skill.name, overwrite)
      toast.success(result.status === 'overwritten' ? `已覆盖安装: ${skill.name}` : `已安装: ${skill.name}`)
      onInstalled()
      await loadSkills()
    } catch (error) {
      toast.error('安装失败', { description: error instanceof Error ? error.message : '未知错误' })
    } finally {
      setInstalling(null)
    }
  }, [workspaceSlug, authStatus, onInstalled, loadSkills])

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
    if (skillsDir) window.electronAPI.openFile(`${skillsDir}/${skillName}`)
  }

  // ===== 过滤 =====
  const selectedSkill = skills.find((s) => s.name === selectedName) ?? null

  const filteredSkills = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    const cat = category.trim().toLowerCase()
    return skills.filter((skill) => {
      if (filter === 'installed' && !skill.installed) return false
      if (filter === 'uninstalled' && skill.installed) return false
      if (q && !skill.name.toLowerCase().includes(q) && !skill.description.toLowerCase().includes(q)) return false
      if (cat && !(skill as any).category?.toLowerCase().includes(cat)) return false
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
                placeholder="搜索 Skill 名称或描述"
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
                  onClick={() => setFilter(item.value as HubFilter)}
                  className={cn(
                    'h-7 rounded text-xs font-medium transition-colors',
                    filter === item.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="text-xs text-muted-foreground">
              共 {filteredSkills.length} 个，已安装 {skills.filter((s) => s.installed).length} 个
            </div>
          </div>

          {/* 批量操作栏 */}
          <BatchToolbar
            selectedCount={batch.selected.size}
            total={filteredSkills.length}
            onBatchInstall={async () => {
              const names = Array.from(batch.selected)
              await window.electronAPI.batchInstallHtSkillHubSkills(workspaceSlug, names, true)
              toast.success(`已开始批量安装 ${names.length} 个 Skill`)
              setBatch({ selected: new Set(), mode: false })
              onInstalled()
              await loadSkills()
            }}
            onBatchUninstall={async () => {
              const names = Array.from(batch.selected)
              if (!window.confirm(`确定要批量卸载 ${names.length} 个 Skill？`)) return
              await window.electronAPI.batchUninstallHtSkillHubSkills(workspaceSlug, names)
              toast.success(`已卸载 ${names.length} 个 Skill`)
              setBatch({ selected: new Set(), mode: false })
              await loadSkills()
            }}
            onSelectAll={() => {
              setBatch((prev) => {
                if (prev.selected.size === filteredSkills.length) return { selected: new Set(), mode: false }
                return { selected: new Set(filteredSkills.map((s) => s.name)), mode: true }
              })
            }}
          />

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
                  selected={selectedName === skill.name}
                  installing={installing === skill.name}
                  hasUpdate={updates.has(skill.name)}
                  onSelect={() => {
                    setSelectedName(skill.name)
                    if (batch.mode) {
                      setBatch((prev) => {
                        const next = new Set(prev.selected)
                        next.has(skill.name) ? next.delete(skill.name) : next.add(skill.name)
                        return { selected: next, mode: next.size > 0 }
                      })
                    }
                  }}
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
                  <div className="shrink-0 flex items-center gap-2">
                    {selectedSkill.installed && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => openInstalledFolder(selectedSkill.name)}>
                          <FolderOpen size={14} />
                          <span>打开目录</span>
                        </Button>
                        <Button
                          size="sm" variant="outline"
                          onClick={() => void handleToggle(selectedSkill.name, selectedSkill.enabled === false)}
                        >
                          {selectedSkill.enabled === false ? <Play size={14} /> : <Pause size={14} />}
                          <span>{selectedSkill.enabled === false ? '启用' : '禁用'}</span>
                        </Button>
                      </>
                    )}
                    {updates.has(selectedSkill.name) ? (
                      <Button size="sm" onClick={() => void handleUpdate(selectedSkill)} disabled={installing !== null}>
                        {installing === selectedSkill.name ? <RefreshCw size={14} className="animate-spin" /> : <ArrowUp size={14} />}
                        <span>更新</span>
                      </Button>
                    ) : (
                      <Button size="sm" onClick={() => void handleInstall(selectedSkill)} disabled={installing !== null}>
                        {installing === selectedSkill.name
                          ? <RefreshCw size={14} className="animate-spin" />
                          : selectedSkill.installed ? <RotateCw size={14} /> : <Download size={14} />}
                        <span>{selectedSkill.installed ? '覆盖安装' : '安装'}</span>
                      </Button>
                    )}
                    {selectedSkill.installed && (
                      <Button variant="ghost" size="sm" className="text-red-600" onClick={() => void handleUninstall(selectedSkill.name)}>
                        <Trash2 size={14} />
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              <div className="p-4 space-y-4 overflow-y-auto">
                <div className="p-4 border rounded-lg">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">SKILL.md</div>
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <Markdown remarkPlugins={[remarkGfm]}>
                      {selectedSkill.description || '从列表缓存获取预览内容，无需额外请求。'}
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
    </SettingsSection>
  )
}
