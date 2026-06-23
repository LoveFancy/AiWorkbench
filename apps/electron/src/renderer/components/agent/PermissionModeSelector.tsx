/**
 * PermissionModeSelector — Agent 权限模式切换器
 *
 * 集成在 Agent 输入工具栏中，紧凑展示当前权限模式。
 * 支持下拉选择和工作区级别的持久化。
 * 每个会话独立维护自己的权限模式。
 */

import * as React from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { Zap, Compass, Map as MapIcon, ChevronDown, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { agentPermissionModeMapAtom, agentDefaultPermissionModeAtom, sessionPersistedPermissionModeAtom, sessionExistsAtom, agentPlanModeSessionsAtom } from '@/atoms/agent-atoms'
import type { PromaPermissionMode } from '@proma/shared'
import { isPromaPermissionMode, PROMA_PERMISSION_MODE_CONFIG, PROMA_PERMISSION_MODE_ORDER } from '@proma/shared'
import { updatePlanModeSessionSet } from '@/lib/agent-plan-mode'

const MODE_ICONS: Record<PromaPermissionMode, React.ComponentType<{ className?: string }>> = {
  auto: Compass,
  bypassPermissions: Zap,
  plan: MapIcon,
}

interface PermissionModeSelectorProps {
  sessionId: string
}

export function PermissionModeSelector({ sessionId }: PermissionModeSelectorProps): React.ReactElement | null {
  const [modeMap, setModeMap] = useAtom(agentPermissionModeMapAtom)
  const setPlanModeSessions = useSetAtom(agentPlanModeSessionsAtom)
  const defaultMode = useAtomValue(agentDefaultPermissionModeAtom)
  const persistedSessionMode = useAtomValue(sessionPersistedPermissionModeAtom(sessionId))
  const mode = modeMap.get(sessionId) ?? persistedSessionMode ?? defaultMode
  const sessionExistsInList = useAtomValue(sessionExistsAtom(sessionId))
  const [menuOpen, setMenuOpen] = React.useState(false)

  // 初始化：如果当前 session 不在 Map 中，按以下优先级读回：
  // 1. session meta.permissionMode（每个 tab 独立持久化，重启恢复各自的值）
  // 2. 默认完全自动模式
  // 注意：只写入当前 session，不回写到 agentDefaultPermissionModeAtom，避免跨会话污染。
  React.useEffect(() => {
    if (!sessionExistsInList) return

    setModeMap((prev: Map<string, PromaPermissionMode>) => {
      if (prev.has(sessionId)) return prev
      const next = new Map(prev)
      next.set(sessionId, persistedSessionMode ?? defaultMode)
      return next
    })
  }, [sessionId, persistedSessionMode, sessionExistsInList, defaultMode, setModeMap])

  const selectMode = React.useCallback(async (nextMode: PromaPermissionMode) => {
    if (nextMode === mode) return
    const prevMode = mode

    // 乐观更新当前 session 的模式
    setModeMap((prev: Map<string, PromaPermissionMode>) => {
      const next = new Map(prev)
      next.set(sessionId, nextMode)
      return next
    })
    setPlanModeSessions((prev: Set<string>) =>
      updatePlanModeSessionSet(prev, sessionId, nextMode === 'plan')
    )

    // 热切换运行中的当前 session；失败时回滚 modeMap 保持 UI/后端一致
    try {
      await window.electronAPI.updateSessionPermissionMode(sessionId, nextMode)
    } catch (error) {
      console.error('[PermissionModeSelector] 运行中切换权限模式失败，回滚 UI:', error)
      setModeMap((prev: Map<string, PromaPermissionMode>) => {
        const next = new Map(prev)
        next.set(sessionId, prevMode)
        return next
      })
      setPlanModeSessions((prev: Set<string>) =>
        updatePlanModeSessionSet(prev, sessionId, prevMode === 'plan')
      )
    }
  }, [mode, sessionId, setModeMap, setPlanModeSessions])

  const handleModeChange = React.useCallback((nextMode: PromaPermissionMode): void => {
    if (!isPromaPermissionMode(nextMode)) return
    void selectMode(nextMode)
    requestAnimationFrame(() => document.querySelector<HTMLElement>('.ProseMirror')?.focus())
  }, [selectMode])

  const handleMenuOpenChange = React.useCallback((open: boolean): void => {
    setMenuOpen(open)
  }, [])

  const config = PROMA_PERMISSION_MODE_CONFIG[mode]
  const Icon = MODE_ICONS[mode]

  return (
    <DropdownMenu open={menuOpen} onOpenChange={handleMenuOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          aria-label={`权限模式：${config.label}`}
          className="h-8 shrink-0 rounded-full px-2.5 text-[13px] font-medium text-foreground/70 hover:text-foreground"
        >
          <Icon className="size-4" />
          <span>{config.label}</span>
          <ChevronDown className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent side="top" align="center" sideOffset={10} className="z-[10060] w-60 p-1.5">
        {PROMA_PERMISSION_MODE_ORDER.map((permissionMode) => {
          const itemConfig = PROMA_PERMISSION_MODE_CONFIG[permissionMode]
          const ItemIcon = MODE_ICONS[permissionMode]
          const isSelected = permissionMode === mode

          return (
            <DropdownMenuItem
              key={permissionMode}
              onSelect={() => handleModeChange(permissionMode)}
              className="items-start gap-2 rounded-md px-2 py-2 data-[highlighted]:bg-accent"
            >
              <ItemIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium leading-5 text-foreground">
                  {itemConfig.label}
                </span>
                <span className="block text-xs leading-5 text-muted-foreground">
                  {itemConfig.description}
                </span>
              </span>
              <span className="flex size-4 shrink-0 items-center justify-center">
                {isSelected && <Check className="size-3.5 text-primary" />}
              </span>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
