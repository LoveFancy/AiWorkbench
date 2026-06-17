import React from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { RefreshCw, LogIn, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SettingsSection, SettingsCard, SettingsRow } from '@/components/settings/primitives'
import { cn } from '@/lib/utils'
import { authStateAtom, loginDialogOpenAtom } from '@/auth/renderer'
import { settingsOpenAtom } from '@/atoms/settings-tab'
import {
  platformModelsAtom,
  platformApiKeyAtom,
  platformModelsLoadingAtom,
  platformModelsLastFetchAtom,
} from './atoms'
import type { PlatformModelInfo } from './types'

export function PlatformModelsSection(): React.ReactElement {
  const authState = useAtomValue(authStateAtom)
  const setLoginDialogOpen = useSetAtom(loginDialogOpenAtom)
  const setSettingsOpen = useSetAtom(settingsOpenAtom)
  const [models, setModels] = useAtom(platformModelsAtom)
  const [apiKey, setApiKey] = useAtom(platformApiKeyAtom)
  const [loading, setLoading] = useAtom(platformModelsLoadingAtom)
  const [lastFetch, setLastFetch] = useAtom(platformModelsLastFetchAtom)

  const isLoggedIn = authState.isLoggedIn
  // 标记：登录是否从本组件的"登录 OA"按钮触发
  const loginRequestedRef = React.useRef(false)

  const handleFetch = React.useCallback(async () => {
    setLoading(true)
    try {
      const result = await window.electronAPI.platformModels.fetchModels(true)
      setModels(result.models)
      setApiKey(result.apiKey || null)
      setLastFetch(Date.now())
    } catch {
      // 静默
    } finally {
      setLoading(false)
    }
  }, [setModels, setApiKey, setLastFetch, setLoading])

  // 如果从平台模型触发的登录，重新打开设置面板
  React.useEffect(() => {
    if (isLoggedIn && loginRequestedRef.current) {
      loginRequestedRef.current = false
      setSettingsOpen(true)
    }
  }, [isLoggedIn])

  // 退出登录后清空
  React.useEffect(() => {
    if (!isLoggedIn) {
      setModels([])
      setApiKey(null)
      setLastFetch(0)
    }
  }, [isLoggedIn, setModels, setApiKey, setLastFetch])

  const handleLoginClick = React.useCallback(() => {
    loginRequestedRef.current = true
    setSettingsOpen(false)
    // 设置面板关闭的动画结束后再弹出登录对话框
    setTimeout(() => setLoginDialogOpen(true), 200)
  }, [setSettingsOpen, setLoginDialogOpen])

  const lastFetchLabel = lastFetch
    ? `上次更新: ${new Date(lastFetch).toLocaleTimeString()}`
    : ''

  return (
    <SettingsSection
      title="华泰泰为平台"
      description="登录后可使用华泰泰为平台为WorkMate提供的默认模型"
      action={
        isLoggedIn ? (
          <Button size="sm" variant="outline" onClick={handleFetch} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span className="ml-1">刷新</span>
          </Button>
        ) : undefined
      }
    >
      {!isLoggedIn ? (
        <SettingsCard divided={false}>
          <div className="flex flex-col items-center gap-3 py-8">
            <p className="text-sm text-muted-foreground">
              请登录 OA 后获取平台模型
            </p>
            <Button size="sm" onClick={handleLoginClick}>
              <LogIn size={14} />
              <span className="ml-1">登录 OA</span>
            </Button>
          </div>
        </SettingsCard>
      ) : loading ? (
        <SettingsCard divided={false}>
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <RefreshCw size={14} className="animate-spin" />
            正在获取平台模型...
          </div>
        </SettingsCard>
      ) : models.length === 0 ? (
        <SettingsCard divided={false}>
          <div className="flex flex-col items-center gap-3 py-8">
            <p className="text-sm text-muted-foreground">
              暂未获取到平台模型，请确认已在泰为大模型平台申请模型
            </p>
            <Button size="sm" variant="outline" onClick={handleFetch}>
              <RefreshCw size={14} />
              <span className="ml-1">重新获取</span>
            </Button>
          </div>
        </SettingsCard>
      ) : models.length > 5 ? (
        <div className="max-h-[220px] overflow-y-auto rounded-xl border border-border/50 bg-card">
          {models.map((model) => (
            <PlatformModelRow key={model.id} model={model} />
          ))}
        </div>
      ) : (
        <SettingsCard divided={false}>
          {models.map((model) => (
            <PlatformModelRow key={model.id} model={model} />
          ))}
        </SettingsCard>
      )}

      {isLoggedIn && apiKey && (
        <div className="flex items-center gap-2 mt-2 px-1">
          <CheckCircle2 size={12} className="text-green-500" />
          <span className="text-xs text-muted-foreground">
            API Key 已获取 · {lastFetchLabel}
          </span>
        </div>
      )}
    </SettingsSection>
  )
}

function PlatformModelRow({
  model,
}: {
  model: PlatformModelInfo
}): React.ReactElement {
  const isAnthropicCompatible =
    model.provider === 'anthropic' ||
    model.provider?.startsWith('huatai')

  const description = [
    model.provider ? model.provider : undefined,
    model.description || undefined,
    isAnthropicCompatible ? '可用于 Agent' : undefined,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <SettingsRow
      label={model.name}
      description={description || undefined}
    >
      {model.supportsMultimodal !== undefined && (
        <span className={cn(
          'inline-flex h-6 shrink-0 items-center rounded-md px-2 text-xs font-medium',
          model.supportsMultimodal
            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
            : 'bg-muted text-muted-foreground'
        )}>
          {model.supportsMultimodal ? '多模态' : '纯文本'}
        </span>
      )}
    </SettingsRow>
  )
}
