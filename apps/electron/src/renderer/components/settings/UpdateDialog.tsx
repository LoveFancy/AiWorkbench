/**
 * UpdateDialog - 自动更新弹窗
 *
 * WorkMate Server 升级链路 UI：
 * 1. 发现新版本 / 下载中 → 显示版本信息和进度
 * 2. 下载完成 → 提供「立即重启」按钮
 * 3. 强制更新 → 不允许关闭弹窗
 */

import * as React from 'react'
import { useAtomValue } from 'jotai'
import { RotateCw } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog'
import { updateStatusAtom } from '@/atoms/updater'

export function UpdateDialog(): React.ReactElement | null {
  const updateStatus = useAtomValue(updateStatusAtom)
  const [open, setOpen] = React.useState(false)
  const [dialogVersion, setDialogVersion] = React.useState<string | null>(null)
  const shownVersionRef = React.useRef<string | null>(null)
  const postponedDownloadedVersionRef = React.useRef<string | null>(null)

  React.useEffect(() => {
    if (
      updateStatus.status === 'available' &&
      updateStatus.version &&
      shownVersionRef.current !== updateStatus.version
    ) {
      const version = updateStatus.version
      shownVersionRef.current = version
      postponedDownloadedVersionRef.current = null
      setDialogVersion(version)

      setOpen(true)
    }

    // 下载完成时如果弹窗已关闭，重新弹出提醒用户
    if (
      updateStatus.status === 'downloaded' &&
      updateStatus.version &&
      !open &&
      postponedDownloadedVersionRef.current !== updateStatus.version
    ) {
      if (dialogVersion !== updateStatus.version) {
        setDialogVersion(updateStatus.version)
      }
      setOpen(true)
    }
  }, [updateStatus.status, updateStatus.version, open, dialogVersion])

  const handleOpenChange = (nextOpen: boolean): void => {
    // 强制更新不允许关闭
    if (!nextOpen && updateStatus.forceUpdate && updateStatus.status === 'downloaded') {
      return
    }
    if (!nextOpen && updateStatus.status === 'downloaded' && dialogVersion) {
      postponedDownloadedVersionRef.current = dialogVersion
    }
    setOpen(nextOpen)
  }

  const handleQuitAndInstall = (): void => {
    window.electronAPI.updater?.quitAndInstall()
  }

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }

  if (!dialogVersion) return null

  const isDownloading = updateStatus.status === 'downloading'
  const isDownloaded = updateStatus.status === 'downloaded'
  const isRollback = updateStatus.releaseType === 'ROLLBACK'
  const isForce = updateStatus.forceUpdate

  const title = isDownloaded
    ? (isRollback ? '回退安装已就绪' : '更新已就绪')
    : isDownloading
      ? (isRollback ? '正在下载回退版本' : '正在下载更新')
      : (isRollback ? '发现回退版本' : '发现新版本')

  const desc = isDownloaded
    ? (isRollback ? `v${dialogVersion} 已下载完成，重启应用完成回退。` : `v${dialogVersion} 已下载完成，重启应用即可完成更新。`)
    : isDownloading
      ? (isRollback ? `正在下载 v${dialogVersion}...` : `正在下载 v${dialogVersion}...`)
      : (isRollback ? `v${dialogVersion} 已发布，正在后台下载。` : `v${dialogVersion} 已发布，正在后台下载更新。`)

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{desc}</AlertDialogDescription>
        </AlertDialogHeader>

        {/* 下载进度 */}
        {isDownloading && updateStatus.progress && (
          <div className="space-y-2">
            <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${updateStatus.progress.total <= 0 ? 0 : updateStatus.progress.percent}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>
                {formatBytes(updateStatus.progress.transferred)}
                {updateStatus.progress.total > 0 ? ` / ${formatBytes(updateStatus.progress.total)}` : ' / 未知大小'}
              </span>
              <span>{formatBytes(updateStatus.progress.bytesPerSecond)}/s</span>
            </div>
          </div>
        )}

        {/* Release Notes（直接从 status 获取，不调 GitHub API） */}
        {!isDownloading && updateStatus.releaseNotes && (
          <div className="max-h-64 overflow-y-auto rounded-md border p-3 text-xs whitespace-pre-wrap text-muted-foreground">
            {updateStatus.releaseNotes}
          </div>
        )}

        <AlertDialogFooter>
          {isDownloaded ? (
            <>
              {!isForce && <AlertDialogCancel>稍后重启</AlertDialogCancel>}
              <AlertDialogAction onClick={handleQuitAndInstall}>
                <RotateCw className="h-4 w-4 mr-1.5" />
                {isRollback ? '立即回退' : '立即重启更新'}
              </AlertDialogAction>
            </>
          ) : (
            <AlertDialogCancel>
              {isDownloading ? '后台下载' : '知道了'}
            </AlertDialogCancel>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
