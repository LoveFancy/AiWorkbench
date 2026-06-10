/**
 * SystemLogSettings - 系统日志页
 *
 * 展示 Electron 主进程和渲染进程日志，便于排查 Chat / Agent 运行问题。
 */

import * as React from 'react'
import { ArrowUp, FolderOpen, RefreshCw, Search } from 'lucide-react'
import type { SystemLogReadResult } from '@proma/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { LogUploadButton } from './LogUploadButton'
import { cn } from '@/lib/utils'
import {
  buildLogSegments,
  getDisplayedLogEntries,
  parseLogEntries,
  type LogEntry,
  type LogLevelFilter,
} from './system-log-utils'

type ActiveLogFile = 'main' | 'renderer'

const MAX_LOG_BYTES = 2 * 1024 * 1024
const MAX_RENDERED_LOG_ENTRIES = 400

const LOG_OPTIONS: Array<{ value: ActiveLogFile; label: string }> = [
  { value: 'main', label: '主进程' },
  { value: 'renderer', label: '页面进程' },
]

const LOG_LEVEL_OPTIONS: Array<{ value: LogLevelFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'INFO', label: 'INFO' },
  { value: 'WARN', label: 'WARN' },
  { value: 'ERROR', label: 'ERROR' },
]

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatUpdatedAt(updatedAt: number | null): string {
  if (!updatedAt) return '未生成'
  return new Date(updatedAt).toLocaleString()
}

function LogContent({ content, searchQuery }: { content: string; searchQuery: string }): React.ReactElement {
  const segments = React.useMemo(() => buildLogSegments(content, searchQuery), [content, searchQuery])

  return (
    <>
      {segments.map((segment, index) => (
        <React.Fragment key={index}>
          {segment.matched ? (
            <mark className="rounded-sm bg-amber-300/70 px-0.5 text-foreground dark:bg-amber-500/50">
              {segment.text}
            </mark>
          ) : (
            segment.text
          )}
        </React.Fragment>
      ))}
    </>
  )
}

function LogEntryContent({ entry, searchQuery }: { entry: LogEntry; searchQuery: string }): React.ReactElement {
  return (
    <span className="block border-b border-border/30 py-1 last:border-b-0">
      <LogContent content={entry.text} searchQuery={searchQuery} />
    </span>
  )
}

export function SystemLogSettings(): React.ReactElement {
  const [activeFile, setActiveFile] = React.useState<ActiveLogFile>('main')
  const [logResult, setLogResult] = React.useState<SystemLogReadResult | null>(null)
  const [searchQuery, setSearchQuery] = React.useState('')
  const [activeLevel, setActiveLevel] = React.useState<LogLevelFilter>('all')
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const logViewportRef = React.useRef<HTMLDivElement | null>(null)
  const deferredSearchQuery = React.useDeferredValue(searchQuery)
  const searchPending = searchQuery !== deferredSearchQuery

  const scrollToTop = React.useCallback(() => {
    const viewport = logViewportRef.current
    if (!viewport) return
    viewport.scrollTop = 0
  }, [])

  const handleRefresh = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await window.electronAPI.readSystemLog({
        file: activeFile,
        maxBytes: MAX_LOG_BYTES,
      })
      setLogResult(result)
      window.requestAnimationFrame(scrollToTop)
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : '读取系统日志失败'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [activeFile, scrollToTop])

  React.useEffect(() => {
    void handleRefresh()
  }, [handleRefresh])

  const logEntries = React.useMemo(
    () => parseLogEntries(logResult?.content ?? ''),
    [logResult?.content],
  )
  const displayedLogEntries = React.useMemo(
    () => getDisplayedLogEntries(logEntries, activeLevel, deferredSearchQuery, MAX_RENDERED_LOG_ENTRIES),
    [activeLevel, deferredSearchQuery, logEntries],
  )
  const activeMeta = LOG_OPTIONS.find((option) => option.value === activeFile)!
  const activeLabel = activeMeta.label
  const activeSearchQuery = deferredSearchQuery.trim().length >= 2 ? deferredSearchQuery : ''

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-base font-semibold text-foreground">系统日志</h4>
          <p className="mt-1 text-sm text-muted-foreground">
            查看主进程和页面进程的最近日志，用于排查模型连接、Agent 和界面问题
          </p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void window.electronAPI.openSystemLogDir()}>
            <FolderOpen size={14} />
            打开目录
          </Button>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading}>
            <RefreshCw size={14} className={cn(loading && 'animate-spin')} />
            刷新
          </Button>
          <LogUploadButton />
        </div>
      </div>

      <div className="settings-card flex-shrink-0 rounded-xl p-3">
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[auto_auto_minmax(260px,1fr)_auto]">
          <div className="inline-flex w-fit rounded-lg bg-muted p-1">
            {LOG_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setActiveFile(option.value)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-left text-sm transition-colors',
                  activeFile === option.value
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <span className="font-medium">{option.label}</span>
              </button>
            ))}
          </div>

          <div className="inline-flex w-fit rounded-lg bg-muted p-1">
            {LOG_LEVEL_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setActiveLevel(option.value)}
                className={cn(
                  'rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors',
                  activeLevel === option.value
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="relative min-w-0">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="搜索日志"
              className="h-9 pl-8"
            />
          </div>

          <Button variant="ghost" size="icon" onClick={scrollToTop} title="滚动到最新日志" className="justify-self-start xl:justify-self-end">
            <ArrowUp size={16} />
          </Button>
        </div>

        <div className="mt-3 grid gap-2 text-xs text-muted-foreground lg:grid-cols-[1fr_auto]">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Badge variant="secondary">{activeLabel}</Badge>
            <span>级别 {LOG_LEVEL_OPTIONS.find((option) => option.value === activeLevel)?.label}</span>
            <span>大小 {formatBytes(logResult?.sizeBytes ?? 0)}</span>
            <span>读取最近 {formatBytes(logResult?.readBytes ?? 0)}</span>
            {logResult?.truncated && <span>已截断，仅展示最近日志</span>}
            <span>更新 {formatUpdatedAt(logResult?.updatedAt ?? null)}</span>
            {searchQuery.trim() && displayedLogEntries.searchSkipped && <span>输入至少 2 个字符开始搜索</span>}
            {activeSearchQuery && (
              <span>
                匹配 {displayedLogEntries.totalMatches} 处
                {displayedLogEntries.hasMoreEntries ? `，仅显示前 ${MAX_RENDERED_LOG_ENTRIES} 条日志` : ''}
                {searchPending ? '，正在更新' : ''}
              </span>
            )}
            {!activeSearchQuery && displayedLogEntries.hasMoreEntries && (
              <span>仅显示最近 {MAX_RENDERED_LOG_ENTRIES} 条日志</span>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="flex-shrink-0 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div
        ref={logViewportRef}
        className="settings-card min-h-[280px] flex-1 overflow-auto rounded-xl border border-border/40 bg-background/70 p-4 text-foreground shadow-inner"
      >
        <pre className="min-w-full whitespace-pre-wrap break-words font-mono text-[11px] leading-5">
          {loading && !logResult ? (
            <span className="text-muted-foreground">正在读取日志...</span>
          ) : logResult?.exists === false ? (
            <span className="text-muted-foreground">日志文件尚未生成。</span>
          ) : displayedLogEntries.entries.length > 0 ? (
            displayedLogEntries.entries.map((entry) => (
              <LogEntryContent key={entry.id} entry={entry} searchQuery={activeSearchQuery} />
            ))
          ) : (
            <span className="text-muted-foreground">暂无日志内容。</span>
          )}
        </pre>
      </div>
    </div>
  )
}
