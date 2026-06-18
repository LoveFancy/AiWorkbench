import * as React from 'react'
import { LogIn, RefreshCw } from 'lucide-react'
import { useAtomValue, useSetAtom } from 'jotai'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { authStateAtom, loginDialogOpenAtom } from '@/auth/renderer'
import { settingsOpenAtom } from '@/atoms/settings-tab'
import type { SkillMarketItem } from './skill-market-types'
import { SkillMarketCard } from './SkillMarketCard'
import { SkillMarketDetailSheet } from './SkillMarketDetailSheet'

interface SkillMarketPanelProps {
  workspaceSlug: string
  query: string
  installedSkillNames: Set<string>
  onInstalled: () => void
}

const MARKET_CATEGORIES = ['推荐', 'SkillHub', '套件']

export function SkillMarketPanel({ workspaceSlug, query, installedSkillNames, onInstalled }: SkillMarketPanelProps): React.ReactElement {
  const authState = useAtomValue(authStateAtom)
  const setLoginDialogOpen = useSetAtom(loginDialogOpenAtom)
  const setSettingsOpen = useSetAtom(settingsOpenAtom)

  const [skills, setSkills] = React.useState<SkillMarketItem[]>([])
  const [category, setCategory] = React.useState(MARKET_CATEGORIES[0] ?? '推荐')
  const [loading, setLoading] = React.useState(false)
  const [authLoading, setAuthLoading] = React.useState(false)
  const [authenticated, setAuthenticated] = React.useState<boolean | null>(null)
  const [installing, setInstalling] = React.useState<string | null>(null)
  const [selectedSkill, setSelectedSkill] = React.useState<SkillMarketItem | null>(null)
  const [detailContent, setDetailContent] = React.useState<string | null>(null)
  const [detailLoading, setDetailLoading] = React.useState(false)

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

  const loadSkills = React.useCallback(async (): Promise<void> => {
    if (!workspaceSlug) return
    setLoading(true)
    try {
      const keyword = query.trim() || undefined
      const remoteCategory = category === '推荐' ? undefined : category
      const list = await window.electronAPI.getHtSkillHubSkills(workspaceSlug, 1, keyword, remoteCategory)
      setSkills(list.filter((skill) => !installedSkillNames.has(skill.name)))
    } catch (error) {
      console.error('[技能市场] 加载失败:', error)
      toast.error('加载技能市场失败', { description: error instanceof Error ? error.message : '未知错误' })
    } finally {
      setLoading(false)
    }
  }, [category, installedSkillNames, query, workspaceSlug])

  React.useEffect(() => {
    void (async () => {
      const ok = await checkAuth()
      if (ok) void loadSkills()
    })()
  }, [checkAuth, loadSkills])

  const handleAuthenticate = React.useCallback(async (): Promise<void> => {
    setAuthLoading(true)
    try {
      await window.electronAPI.skillHubAuthenticate()
      const ok = await checkAuth()
      if (ok) void loadSkills()
    } catch (error) {
      toast.error('SkillHub 认证失败', { description: error instanceof Error ? error.message : '未知错误' })
    } finally {
      setAuthLoading(false)
    }
  }, [checkAuth, loadSkills])

  const handleLogin = React.useCallback((): void => {
    setSettingsOpen(false)
    setTimeout(() => setLoginDialogOpen(true), 200)
  }, [setLoginDialogOpen, setSettingsOpen])

  const handleInstall = React.useCallback(async (skill: SkillMarketItem): Promise<void> => {
    if (installing) return
    setInstalling(skill.name)
    try {
      await window.electronAPI.installHtSkillHubSkill(workspaceSlug, skill.name, false)
      toast.success(`已安装：${skill.displayName || skill.name}`)
      onInstalled()
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

  if (!authState.isLoggedIn) {
    return (
      <div className="rounded-lg border border-dashed border-border/70 bg-content-area px-4 py-8 text-center">
        <div className="text-sm font-medium text-foreground">登录后访问技能市场</div>
        <div className="mt-1 text-xs text-muted-foreground">技能市场需要 OA 登录和 SkillHub 认证。</div>
        <Button size="sm" className="mt-4" onClick={handleLogin}>
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
        <Button size="sm" className="mt-4" onClick={() => void handleAuthenticate()} disabled={authLoading}>
          <RefreshCw size={14} className={authLoading ? 'animate-spin' : undefined} />
          {authLoading ? '认证中' : '认证 SkillHub'}
        </Button>
      </div>
    )
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          {MARKET_CATEGORIES.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setCategory(item)}
              className={`h-8 rounded-md px-3 text-xs font-medium transition-colors ${category === item ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {item}
            </button>
          ))}
          <Button size="sm" variant="ghost" className="ml-auto h-8 px-2" onClick={() => void loadSkills()} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : undefined} />
          </Button>
        </div>

        {loading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">加载中...</div>
        ) : skills.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/70 py-10 text-center text-sm text-muted-foreground">没有匹配的市场技能</div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {skills.slice(0, 12).map((skill) => (
              <SkillMarketCard
                key={skill.name}
                skill={skill}
                installing={installing === skill.name}
                onOpen={() => openDetail(skill)}
                onInstall={() => void handleInstall(skill)}
              />
            ))}
          </div>
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
