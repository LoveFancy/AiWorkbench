/**
 * ModeSwitcher - Chat/Agent 模式切换（带滑动指示器）
 *
 * 切换模式时自动恢复上一次在该模式下查看的对话/会话：
 * 1. 优先恢复上次选中的对话 ID
 * 2. 其次查找已打开的同类型 Tab
 * 3. 兜底打开最近的对话/会话（列表首项）
 * 4. 都没有则仅切换模式
 */

import * as React from 'react'
import { useAtomValue } from 'jotai'
import { appModeAtom, type AppMode } from '@/atoms/app-mode'
import { useSwitchModeWithSession } from '@/hooks/useSwitchModeWithSession'
import { Bot, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'

const modes: { value: AppMode; label: string; icon: React.ReactNode }[] = [
  { value: 'agent', label: 'Agent', icon: <Bot size={15} /> },
  { value: 'chat', label: 'Chat', icon: <MessageSquare size={15} /> },
]

export function ModeSwitcher(): React.ReactElement {
  const mode = useAtomValue(appModeAtom)
  const switchModeWithSession = useSwitchModeWithSession()

  const handleModeSwitch = React.useCallback((targetMode: AppMode) => {
    if (targetMode === mode) return
    if (targetMode === 'scratch') return
    void switchModeWithSession(targetMode)
  }, [mode, switchModeWithSession])

  return (
    <div className="pt-2 titlebar-drag-region select-none">
      <div className="relative flex rounded-xl bg-muted p-1 titlebar-drag-region">
        {/* 滑动背景指示器 */}
        <div
          className={cn(
            'mode-slider pointer-events-none absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-lg bg-background shadow-sm transition-transform duration-300 ease-in-out',
            mode === 'agent' ? 'translate-x-0' : 'translate-x-full'
          )}
        />
        {modes.map(({ value, label, icon }) => (
          <button
            key={value}
            type="button"
            onClick={() => handleModeSwitch(value)}
            className={cn(
              'mode-btn titlebar-no-drag relative z-[1] h-8 flex-1 flex items-center justify-center gap-1.5 rounded-lg px-3 py-0 text-sm font-medium transition-colors duration-200 select-none',
              mode === value
                ? 'mode-btn-selected text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
