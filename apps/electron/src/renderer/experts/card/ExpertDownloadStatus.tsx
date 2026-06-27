import * as React from 'react'
import type { AgentExpertGroupInfo, RemoteDownloadProgress } from '@proma/shared'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { describeDownloadStatus } from './download-status'

interface ExpertDownloadStatusProps {
  group: AgentExpertGroupInfo
  progress: RemoteDownloadProgress
}

/** 卡片底部下载/安装状态区：只前进的确定态进度条 + 阶段文案 + 取消/重试/下载动作 */
export function ExpertDownloadStatus({ group, progress }: ExpertDownloadStatusProps): React.ReactElement {
  const view = describeDownloadStatus(progress)

  const handleCancel = React.useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    void window.electronAPI.cancelRemoteDownload(group.id)
  }, [group.id])

  const handleDownload = React.useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    void window.electronAPI.downloadRemoteExpert(group.id)
  }, [group.id])

  return (
    <div className="mt-3 border-t border-border/60 pt-3" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-2">
        <span className="flex flex-1 items-center gap-1.5 text-xs">
          <span className={cn('inline-block size-1.5 rounded-full', view.dotClass)} />
          <span
            className={cn(
              view.tone === 'error' && 'text-red-600 dark:text-red-400',
              view.tone === 'cancelled' && 'text-muted-foreground',
            )}
          >
            {view.label}
          </span>
        </span>
        {view.percentText && (
          <span className="text-xs tabular-nums text-muted-foreground">{view.percentText}</span>
        )}
        {(view.action === 'retry' || view.action === 'download') && (
          <button
            type="button"
            onClick={handleDownload}
            className="rounded-md border border-border/60 px-2.5 py-0.5 text-xs font-medium transition-colors hover:bg-foreground/[0.06]"
          >
            {view.action === 'retry' ? '重试' : '下载'}
          </button>
        )}
        {view.action === 'cancel' && (
          <button
            type="button"
            onClick={handleCancel}
            title="取消下载"
            className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
          >
            <X size={13} />
          </button>
        )}
      </div>
      {view.showBar && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-200',
              view.tone === 'installing' ? 'bg-violet-500' : 'bg-primary',
            )}
            style={{ width: `${view.barPercent}%` }}
          />
        </div>
      )}
    </div>
  )
}
