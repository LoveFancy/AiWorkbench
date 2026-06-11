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
import { markdownToHtml } from '@/lib/markdown-rich-text'

export function UpdateDialog(): React.ReactElement | null {
  const updateStatus = useAtomValue(updateStatusAtom)
  const [open, setOpen] = React.useState(false)
  const [dialogVersion, setDialogVersion] = React.useState<string | null>(null)
  const shownVersionRef = React.useRef<string | null>(null)
  const userDismissedVersionRef = React.useRef<string | null>(null)

  React.useEffect(() => {
    console.log('[UpdateDialog] useEffect status=%s version=%s open=%s dialogVersion=%s',
      updateStatus.status, updateStatus.version, open, dialogVersion)

    // 有可用更新 / 正在下载 → 打开弹窗（首次发现该版本时）
    if (
      (updateStatus.status === 'available' || updateStatus.status === 'downloading') &&
      updateStatus.version &&
      shownVersionRef.current !== updateStatus.version
    ) {
      const version = updateStatus.version
      shownVersionRef.current = version
      userDismissedVersionRef.current = null
      setDialogVersion(version)
      console.log('[UpdateDialog] %s: 打开弹窗 version=%s', updateStatus.status, version)
      setOpen(true)
      return
    }

    // 下载完成，弹窗内容自动切换（标题/按钮由 isDownloaded 驱动）
    // 如果弹窗已被关闭则重新弹出
    if (
      updateStatus.status === 'downloaded' &&
      updateStatus.version
    ) {
      console.log('[UpdateDialog] downloaded: open=%s dismissedRef=%s',
        open, userDismissedVersionRef.current)
      if (dialogVersion !== updateStatus.version) {
        setDialogVersion(updateStatus.version)
      }
      if (!open && userDismissedVersionRef.current !== updateStatus.version) {
        console.log('[UpdateDialog] downloaded: 重新打开弹窗 version=%s', updateStatus.version)
        setOpen(true)
      }
      return
    }

    // 检查失败不做弹窗，由 AboutSettings 页面内联展示
  }, [updateStatus.status, updateStatus.version, open, dialogVersion])

  const handleOpenChange = (nextOpen: boolean): void => {
    // 强制更新不允许关闭
    if (!nextOpen && updateStatus.forceUpdate && updateStatus.status === 'downloaded') {
      return
    }
    // 用户关闭已下载弹窗 → 记录为已忽略
    if (!nextOpen && updateStatus.status === 'downloaded' && dialogVersion) {
      userDismissedVersionRef.current = dialogVersion
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

        {/* Release Notes（Markdown 渲染） */}
        {!isDownloading && updateStatus.releaseNotes && (
          <div
            className="max-h-64 overflow-y-auto rounded-md border p-3 text-xs prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
            dangerouslySetInnerHTML={{ __html: markdownToHtml(updateStatus.releaseNotes) }}
          />
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
