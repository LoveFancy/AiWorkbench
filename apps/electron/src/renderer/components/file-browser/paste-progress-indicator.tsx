import * as React from 'react'
import { useAtomValue } from 'jotai'
import { pasteProgressAtom, type PasteProgressEntry } from './paste-progress-atom'
import { cn } from '@/lib/utils'

interface PasteProgressIndicatorProps {
  sourcePath: string
}

export function PasteProgressIndicator({ sourcePath }: PasteProgressIndicatorProps): React.ReactElement | null {
  const progressMap = useAtomValue(pasteProgressAtom)
  const entry = progressMap.get(sourcePath)
  // 单一状态：记录当前展示的条目；条目从 map 移除后，保留最后状态 2s 做淡出
  const [displayEntry, setDisplayEntry] = React.useState<PasteProgressEntry | null>(null)

  React.useEffect(() => {
    if (entry) {
      setDisplayEntry(entry)
      return
    }
    if (displayEntry) {
      const t = setTimeout(() => setDisplayEntry(null), 2000)
      return () => clearTimeout(t)
    }
  }, [entry, displayEntry])

  if (!displayEntry) return null

  const isPending = displayEntry.status === 'pending'
  const isDone = displayEntry.status === 'done'
  const isError = displayEntry.status === 'error'

  return (
    <span
      className={cn(
        'flex items-center gap-1 flex-shrink-0 text-[10px] animate-in fade-in duration-200',
        isPending && 'text-muted-foreground',
        isDone && 'text-emerald-500',
        isError && 'text-destructive',
      )}
      title={displayEntry.errorMessage ?? (isDone ? '完成' : '处理中...')}
    >
      {isPending && (
        <>
          <span className="size-2.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
          <span className="hidden sm:inline">复制中...</span>
        </>
      )}
      {isDone && (
        <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
          <path d="M5 13l4 4L19 7" />
        </svg>
      )}
      {isError && (
        <>
          <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
          <span className="hidden sm:inline">{displayEntry.errorMessage ?? '失败'}</span>
        </>
      )}
    </span>
  )
}
