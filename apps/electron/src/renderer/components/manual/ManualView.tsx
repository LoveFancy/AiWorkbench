/**
 * ManualView - 使用手册内容渲染组件
 *
 * 改造自 TutorialViewer.tsx，通过 IPC 从主进程获取手册内容并渲染。
 * 复用 react-markdown + remarkGfm + rehypeRaw 渲染栈。
 * 支持外部图片、代码块高亮、链接跳转、内嵌视频。
 */

import * as React from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import { Loader2 } from 'lucide-react'
import { CodeBlock } from '@proma/ui'
import type { ManualContent } from '@proma/shared'

/** 视频块信息 */
interface VideoBlock {
  id: string
  src: string
}

/** 占位符前缀 */
const VIDEO_PLACEHOLDER_PREFIX = '$$VIDEO_BLOCK_'

/**
 * 提取 markdown 中的 <video> 标签，替换为占位符。
 */
function extractVideoBlocks(markdown: string): { processed: string; videos: VideoBlock[] } {
  const videos: VideoBlock[] = []
  const processed = markdown.replace(
    /<video[^>]*\bsrc=["']([^"']+)["'][^>]*>[\s\S]*?<\/video>/gi,
    (_match, src: string) => {
      const id = `${VIDEO_PLACEHOLDER_PREFIX}${videos.length}`
      videos.push({ id, src })
      return `\n\n${id}\n\n`
    },
  )
  return { processed, videos }
}

export function ManualView(): React.ReactElement {
  const [content, setContent] = React.useState<ManualContent | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    window.electronAPI.manual
      .checkAndGet()
      .then((result) => {
        setContent(result)
      })
      .catch((err: unknown) => {
        console.error('[ManualView] 加载手册失败:', err)
        setError(err instanceof Error ? err.message : '加载失败')
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">加载手册中...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        <p className="text-sm">手册加载失败</p>
        <p className="text-xs mt-1 text-muted-foreground/60">{error}</p>
      </div>
    )
  }

  if (!content) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        <p className="text-sm">暂未找到手册内容</p>
      </div>
    )
  }

  const { processed, videos } = extractVideoBlocks(content.content)

  const versionLabel =
    content.source === 'builtin'
      ? '内置版本'
      : `版本 ${content.version} · 更新于 ${new Date(content.cachedAt).toLocaleString('zh-CN')}`

  return (
    <div className="flex flex-col h-full">
      <div
        className="flex-1 overflow-y-auto prose dark:prose-invert max-w-none text-[14px]
          prose-p:my-2 prose-p:leading-[1.75] prose-li:leading-[1.75]
          prose-headings:my-3 prose-pre:my-0
          prose-img:rounded-xl prose-img:shadow-md prose-img:max-w-full
          prose-blockquote:border-primary/30 prose-blockquote:text-muted-foreground
          [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
      >
        <Markdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeRaw]}
          components={{
            a: ({ href, children: linkChildren, ...linkProps }) => (
              <a
                {...linkProps}
                href={href}
                onClick={(e) => {
                  e.preventDefault()
                  if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
                    window.electronAPI.openExternal(href)
                  }
                }}
                title={href}
                className="text-primary hover:underline cursor-pointer"
              >
                {linkChildren}
              </a>
            ),
            pre: ({ children: preChildren }) => {
              return <CodeBlock>{preChildren}</CodeBlock>
            },
            img: ({ src, alt }) => (
              <img
                src={src}
                alt={alt || ''}
                className="rounded-xl shadow-md max-w-full"
                loading="lazy"
              />
            ),
            p: ({ children, ...pProps }) => {
              if (typeof children === 'string' && children.startsWith(VIDEO_PLACEHOLDER_PREFIX)) {
                const video = videos.find((v) => v.id === children)
                if (video) {
                  return (
                    <video
                      src={video.src}
                      controls
                      playsInline
                      className="rounded-xl shadow-md max-w-full h-auto my-2"
                    />
                  )
                }
              }
              if (Array.isArray(children) && children.length === 1 && typeof children[0] === 'string' && (children[0] as string).startsWith(VIDEO_PLACEHOLDER_PREFIX)) {
                const video = videos.find((v) => v.id === children[0])
                if (video) {
                  return (
                    <video
                      src={video.src}
                      controls
                      playsInline
                      className="rounded-xl shadow-md max-w-full h-auto my-2"
                    />
                  )
                }
              }
              return <p {...pProps}>{children}</p>
            },
          }}
        >
          {processed}
        </Markdown>
      </div>
      <div className="flex-shrink-0 pt-3 mt-3 border-t border-border text-xs text-muted-foreground text-center">
        {versionLabel}
      </div>
    </div>
  )
}
