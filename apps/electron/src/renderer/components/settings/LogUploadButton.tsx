/**
 * 日志上报按钮
 *
 * 提供确认对话框 → 调用 electronAPI.uploadSystemLog() → toast 反馈
 */

import * as React from 'react'
import { Upload, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

export function LogUploadButton(): React.ReactElement {
  const [uploading, setUploading] = React.useState(false)

  const handleUpload = React.useCallback(async () => {
    const confirmed = window.confirm(
      [
        '将打包并上报以下日志文件：',
        '• main.log（主进程）',
        '• renderer.log（页面进程）',
        '',
        '是否继续？',
      ].join('\n'),
    )
    if (!confirmed) return

    setUploading(true)
    try {
      const result = await window.electronAPI.uploadSystemLog()
      if (result.success) {
        toast.success(
          `日志已上报：${result.fileName ?? ''}`,
          { duration: 5000 },
        )
      } else {
        toast.error(`上报失败：${result.error ?? '未知错误'}`, { duration: 5000 })
      }
    } catch (e) {
      toast.error(
        `上报失败：${e instanceof Error ? e.message : '未知错误'}`,
        { duration: 5000 },
      )
    } finally {
      setUploading(false)
    }
  }, [])

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleUpload}
      disabled={uploading}
    >
      {uploading ? (
        <Loader2 size={14} className="animate-spin" />
      ) : (
        <Upload size={14} />
      )}
      {uploading ? '上报中...' : '日志上报'}
    </Button>
  )
}
