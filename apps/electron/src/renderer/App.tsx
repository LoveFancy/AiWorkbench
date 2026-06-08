import * as React from 'react'
import { useAtom, useAtomValue, useSetAtom, useStore } from 'jotai'
import { AppShell } from './components/app-shell/AppShell'
import { OnboardingView } from './components/onboarding/OnboardingView'
import { TutorialBanner } from './components/tutorial/TutorialBanner'
import { EnvironmentCheckDialog } from './components/environment/EnvironmentCheckDialog'
import { MigrationImportDialog } from './components/migration/MigrationImportDialog'
import { TooltipProvider } from './components/ui/tooltip'
import { SettingsDialog } from './components/settings/SettingsDialog'
import { LoginView } from '@/auth/renderer'
import { loginDialogOpenAtom, authStateAtom } from '@/auth/renderer'
import { conversationsAtom, channelsAtom } from './atoms/chat-atoms'
import { agentChannelIdsAtom } from './atoms/agent-atoms'
import { environmentCheckDialogOpenAtom } from './atoms/environment'
import { tabsAtom, activeTabIdAtom, openTab } from './atoms/tab-atoms'
import { platformModelsAtom, platformApiKeyAtom } from '@/platform-models/renderer'
import type { Channel } from '@proma/shared'
import type { AppShellContextType } from './contexts/AppShellContext'

// useLayoutEffect 同步执行：ModelSelector.listChannels() 覆盖 channelsAtom 后
// 在同一帧内补回 __platform__，避免"暂无可用模型"闪烁。
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? React.useLayoutEffect : React.useEffect

export default function App(): React.ReactElement {
  // [FLASH-DEBUG] 监控 App 组件重渲染（如果看到频繁日志，说明根组件被频繁重渲染）
  const appRenderCountRef = React.useRef(0)
  appRenderCountRef.current++
  if (appRenderCountRef.current > 1) {
    console.warn(`[FLASH-DEBUG] App re-render #${appRenderCountRef.current}, isLoading/showOnboarding may have changed`)
  }

  const store = useStore()
  const [isLoading, setIsLoading] = React.useState(true)
  const [showOnboarding, setShowOnboarding] = React.useState(false)

  // 初始化：检查是否需要显示 Onboarding
  // macOS/Linux 上 SDK 自带 claude native binary 不依赖宿主 Node/Git；
  // Windows 上仍需 Git Bash/WSL，由 Onboarding Step 2 与聊天错误卡片引导用户安装。
  React.useEffect(() => {
    const initialize = async () => {
      try {
        const settings = await window.electronAPI.getSettings()
        if (!settings.onboardingCompleted) {
          setShowOnboarding(true)
        }
      } catch (error) {
        console.error('[App] 初始化失败:', error)
      } finally {
        setIsLoading(false)
      }
    }

    initialize()
  }, [])

  // 完成 onboarding 回调：创建欢迎对话
  const handleOnboardingComplete = async () => {
    setShowOnboarding(false)

    try {
      const meta = await window.electronAPI.createWelcomeConversation()
      if (meta) {
        // 添加到对话列表
        const conversations = store.get(conversationsAtom)
        store.set(conversationsAtom, [meta, ...conversations])

        // 打开对话标签页
        const tabs = store.get(tabsAtom)
        const result = openTab(tabs, {
          type: 'chat',
          sessionId: meta.id,
          title: meta.title,
        })
        store.set(tabsAtom, result.tabs)
        store.set(activeTabIdAtom, result.activeTabId)
      }
    } catch (error) {
      console.error('[App] 创建欢迎对话失败:', error)
    }
  }

  // 加载中状态
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">正在初始化...</p>
        </div>
      </div>
    )
  }

  // 显示 onboarding 界面
  if (showOnboarding) {
    return (
      <TooltipProvider delayDuration={200}>
        <OnboardingView onComplete={handleOnboardingComplete} />
        <MigrationImportDialog />
      </TooltipProvider>
    )
  }

  // Placeholder context value
  const contextValue: AppShellContextType = {}

  // 显示主界面
  return (
    <TooltipProvider delayDuration={200}>
      <AppShell contextValue={contextValue} />
      <SettingsDialog />
      <TutorialBanner />
      <GlobalEnvironmentCheckDialog />
      <MigrationImportDialog />
      <LoginDialog />
      <PlatformChannelSync />
    </TooltipProvider>
  )
}

/** 登录对话框：由 LeftSidebar 底部用户菜单触发 */
function LoginDialog(): React.ReactElement {
  const [open, setOpen] = useAtom(loginDialogOpenAtom)
  const [, setAuthState] = useAtom(authStateAtom)

  if (!open) return <></>

  const handleLoginSuccess = async () => {
    setOpen(false)
    try {
      const state = await window.electronAPI.auth.getAuthState()
      setAuthState(state)
    } catch {
      // 静默
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center" onClick={() => setOpen(false)}>
      <div onClick={(e) => e.stopPropagation()}>
        <LoginView
          onLoginSuccess={handleLoginSuccess}
          onClose={() => setOpen(false)}
          allowSkip={false}
        />
      </div>
    </div>
  )
}

/**
 * 全局环境检测 Dialog，由错误卡片的 recovery action 按钮打开。
 */
function GlobalEnvironmentCheckDialog(): React.ReactElement {
  const [open, setOpen] = useAtom(environmentCheckDialogOpenAtom)
  return <EnvironmentCheckDialog open={open} onOpenChange={setOpen} />
}

/**
 * 平台模型同步组件（无 UI）。
 *
 * 职责：
 * 1. 登录后自动拉取平台模型
 * 2. 将结果同步为虚拟渠道 __platform__ 到 channelsAtom / agentChannelIds
 * 3. 监听 channels 变化，抵抗 ModelSelector.listChannels() 的覆盖写入
 * 4. 退出登录后清除
 */
function PlatformChannelSync(): React.ReactElement {
  const authState = useAtomValue(authStateAtom)
  const [platformModels, setPlatformModels] = useAtom(platformModelsAtom)
  const [platformApiKey, setPlatformApiKey] = useAtom(platformApiKeyAtom)
  const channels = useAtomValue(channelsAtom)
  const setGlobalChannels = useSetAtom(channelsAtom)
  const [, setAgentChannelIds] = useAtom(agentChannelIdsAtom)
  const hasFetchedRef = React.useRef(false)
  const restoringRef = React.useRef(false)

  // 登录后自动拉取
  React.useEffect(() => {
    if (authState.isLoggedIn && !hasFetchedRef.current) {
      hasFetchedRef.current = true
      window.electronAPI.platformModels.fetchModels(true).then((result: any) => {
        setPlatformModels(result.models ?? [])
        setPlatformApiKey(result.apiKey || null)
      }).catch(() => {})
    }
    if (!authState.isLoggedIn) {
      hasFetchedRef.current = false
      setPlatformModels([])
      setPlatformApiKey(null)
    }
  }, [authState.isLoggedIn])

  // 同步虚拟渠道。
  // 监听 channels：当 ModelSelector.listChannels() 覆盖掉 __platform__ 时自动补回。
  // restoringRef 阻断自身 setGlobalChannels 触发的回流，避免无限循环。
  useIsomorphicLayoutEffect(() => {
    if (restoringRef.current) {
      restoringRef.current = false
      return
    }

    const allEnabled = platformModels.filter((m) => m.enabled)
    const hasPlatform = channels.some((c) => c.id === '__platform__')

    // 无平台数据：移除虚拟渠道（如果存在）
    if (allEnabled.length === 0 || !platformApiKey) {
      if (hasPlatform) {
        restoringRef.current = true
        setGlobalChannels((prev) => prev.filter((c) => c.id !== '__platform__'))
        setAgentChannelIds((ids) => ids.filter((id) => id !== '__platform__'))
      }
      return
    }

    // 有平台数据：确保虚拟渠道存在且内容最新
    const platformChannel: Channel = {
      id: '__platform__',
      name: '泰为平台模型',
      provider: 'anthropic',
      baseUrl: allEnabled.find((m) => m.baseUrl)?.baseUrl ?? '',
      apiKey: platformApiKey,
      apiKeyConfigured: true,
      models: allEnabled.map((m) => ({
        id: m.id,
        name: m.name,
        enabled: true,
        supportsMultimodal: m.supportsMultimodal,
      })),
      enabled: true,
    } as Channel

    restoringRef.current = true
    setGlobalChannels((prev) => {
      const others = prev.filter((c) => c.id !== '__platform__')
      return [...others, platformChannel]
    })
    setAgentChannelIds((ids) => {
      if (ids.includes('__platform__')) return ids
      return [...ids, '__platform__']
    })
  }, [platformModels, platformApiKey, channels, setGlobalChannels, setAgentChannelIds])

  return <></>
}
