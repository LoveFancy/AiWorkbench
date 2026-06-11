import * as React from 'react'
import { AlertCircle, RefreshCw } from 'lucide-react'
import type { FileAccessOptions } from '@proma/shared'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface HtmlPreviewFrameProps {
  filePath: string
  fileAccess: FileAccessOptions
  refreshVersion: number
}

const HTML_RELOAD_DEBOUNCE_MS = 150

export function HtmlPreviewFrame({ filePath, fileAccess, refreshVersion }: HtmlPreviewFrameProps): React.ReactElement {
  const [src, setSrc] = React.useState('')
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [reloadNonce, setReloadNonce] = React.useState(0)

  const loadPreview = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await window.electronAPI.prepareHtmlPreview(filePath, fileAccess)
      if (!result) {
        setSrc('')
        setError('无法准备 HTML 预览，请确认文件存在且位于授权范围内。')
        return
      }
      const separator = result.url.includes('?') ? '&' : '?'
      setSrc(`${result.url}${separator}v=${Date.now()}`)
    } catch (err) {
      console.error('[HtmlPreviewFrame] 准备 HTML 预览失败:', err)
      setSrc('')
      setError('HTML 预览加载失败。')
    } finally {
      setLoading(false)
    }
  }, [fileAccess, filePath])

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadPreview()
    }, HTML_RELOAD_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [loadPreview, refreshVersion, reloadNonce])

  const handleReload = React.useCallback(() => {
    setReloadNonce((value) => value + 1)
  }, [])

  if (error) {
    return (
      <div className="flex h-full items-center justify-center bg-content-area px-6 text-center">
        <div className="flex max-w-sm flex-col items-center gap-3 text-sm text-muted-foreground">
          <AlertCircle className="size-5 text-destructive/70" />
          <div>{error}</div>
          <Button type="button" variant="outline" size="sm" onClick={handleReload}>
            <RefreshCw className="size-3.5" />
            重新加载
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-white">
      {loading && (
        <div className="absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden bg-muted">
          <div className="h-full w-1/3 animate-pulse bg-primary/60" />
        </div>
      )}
      {src ? (
        <iframe
          key={src}
          src={src}
          title={filePath.split(/[\\/]/).pop() || 'HTML 预览'}
          sandbox="allow-scripts allow-same-origin allow-forms"
          className={cn('h-full w-full border-0 bg-white', loading && 'opacity-90')}
          onLoad={() => setLoading(false)}
          onError={() => {
            setLoading(false)
            setError('HTML 页面加载失败。')
          }}
        />
      ) : (
        <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
          正在加载 HTML 预览...
        </div>
      )}
    </div>
  )
}
