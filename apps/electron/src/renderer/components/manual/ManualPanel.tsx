/**
 * ManualPanel - 使用手册面板容器
 *
 * 覆盖在主内容区上方的面板，标题栏固定，内容区可滚动，ESC 关闭。
 */

import * as React from 'react'
import { useAtom } from 'jotai'
import { X } from 'lucide-react'
import { manualPanelOpenAtom } from '@/atoms/manual-atoms'
import { ManualView } from './ManualView'

export function ManualPanel(): React.ReactElement | null {
  const [open, setOpen] = useAtom(manualPanelOpenAtom)

  React.useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, setOpen])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="relative w-full max-w-3xl h-[85vh] bg-background rounded-xl shadow-2xl border border-border flex flex-col overflow-hidden">
        {/* 标题栏 */}
        <div className="flex-shrink-0 flex items-center justify-between px-5 py-3 border-b border-border">
          <h2 className="text-base font-semibold">使用手册</h2>
          <button
            onClick={() => setOpen(false)}
            className="p-1 rounded-md hover:bg-muted transition-colors"
            aria-label="关闭"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* 内容区 */}
        <div className="flex-1 overflow-hidden px-5 py-4">
          <ManualView />
        </div>
      </div>
    </div>
  )
}
