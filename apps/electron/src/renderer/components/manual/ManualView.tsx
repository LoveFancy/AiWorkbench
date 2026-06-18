/**
 * ManualView - 使用手册内容渲染组件
 *
 * 获取服务端 Markdown 内容（不含图片）直接渲染。
 * 图文版手册通过「查看图文版」按钮在浏览器中打开。
 *
 * 服务端方案见：docs/客户端/手册/手册管理方案.md
 *   - GET /workmate/manual        → Markdown（纯文本，无图片）
 *   - GET /workmate/manual/html   → HTML 图文（浏览器打开）
 */

import * as React from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import { ExternalLink, Loader2 } from 'lucide-react'
import { CodeBlock } from '@proma/ui'
import type { ManualContent } from '@proma/shared'

/** 目录项 */
interface TocItem {
  id: string
  text: string
  level: number
}

/** 从 markdown 文本中提取标题，生成目录 */
function extractToc(markdown: string): TocItem[] {
  const headingRegex = /^(#{1,3})\s+(.+)$/gm
  const items: TocItem[] = []
  let match: RegExpExecArray | null
  while ((match = headingRegex.exec(markdown)) !== null) {
    const hashes = match[1]
    const title = match[2]
    if (!hashes || !title) continue
    const level = hashes.length
    const text = title.trim()
    const id = slugify(text)
    items.push({ id, text, level })
  }
  return items
}

/** 生成标题的 slug ID */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export function ManualView(): React.ReactElement {
  const [content, setContent] = React.useState<ManualContent | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [activeId, setActiveId] = React.useState<string | null>(null)
  const [htmlManualError, setHtmlManualError] = React.useState<string | null>(null)
  const contentRef = React.useRef<HTMLDivElement>(null)

  // 记录内容设置的时间点，用于测量渲染耗时
  const contentSetAtRef = React.useRef<number>(0)

  React.useEffect(() => {
    const t0 = performance.now()
    console.log('[ManualView] 开始加载手册...')
    window.electronAPI.manual
      .checkAndGet()
      .then((result) => {
        console.log(`[ManualView] IPC 调用耗时: ${(performance.now() - t0).toFixed(0)}ms, 来源: ${result?.source}, 内容大小: ${result ? (result.content.length / 1024).toFixed(1) + 'KB' : 'N/A'}`)
        contentSetAtRef.current = performance.now()
        setContent(result)
      })
      .catch((err: unknown) => {
        console.error('[ManualView] 加载手册失败:', err)
        setError(err instanceof Error ? err.message : '加载失败')
      })
      .finally(() => setLoading(false))
  }, [])

  // 测量 Markdown 渲染耗时
  React.useEffect(() => {
    if (contentSetAtRef.current > 0) {
      const rafId = requestAnimationFrame(() => {
        console.log(`[ManualView] Markdown 渲染完成，渲染耗时: ${(performance.now() - contentSetAtRef.current).toFixed(0)}ms`)
        contentSetAtRef.current = 0
      })
      return () => cancelAnimationFrame(rafId)
    }
  }, [content])

  // 滚动监听：高亮当前可见标题
  React.useEffect(() => {
    if (!content || !contentRef.current) return
    const root = contentRef.current
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id)
          }
        }
      },
      { root, rootMargin: '-10% 0px -75% 0px', threshold: 0 },
    )
    const headings = root.querySelectorAll('h1[id], h2[id], h3[id]')
    headings.forEach((h) => observer.observe(h))
    return () => observer.disconnect()
  }, [content])

  /** 目录项缩进映射 */
  const tocIndent: Record<number, string> = {
    1: 'pl-2',
    2: 'pl-6',
    3: 'pl-10',
  }

  // ===== 所有 hooks 必须在 early return 之前 =====

  const toc = React.useMemo(() => {
    if (!content) return []
    return extractToc(content.content)
  }, [content])

  const versionLabel = React.useMemo(() => {
    if (!content) return ''
    return content.source === 'builtin'
      ? '内置版本'
      : `版本 ${content.version} · 更新于 ${new Date(content.cachedAt).toLocaleString('zh-CN')}`
  }, [content])

  const handleTocClick = React.useCallback((id: string) => {
    const el = contentRef.current?.querySelector(`#${CSS.escape(id)}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const handleOpenHtmlManual = React.useCallback(() => {
    setHtmlManualError(null)
    window.electronAPI.manual
      .openHtmlManual()
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : '未知错误'
        console.error('[ManualView] 打开图文版失败:', msg)
        setHtmlManualError(msg)
      })
  }, [])

  // 缓存 Markdown 渲染结果，避免 activeId 变化时重新解析
  const renderedContent = React.useMemo(() => {
    if (!content) return null
    return (
      <div className="max-w-3xl mx-auto px-8 pt-6 pb-10">
        <div
          className="prose dark:prose-invert max-w-none text-[14px]
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
              h1: ({ children, ...props }) => {
                const text = extractTextContent(children)
                const id = slugify(text)
                return <h1 id={id} {...props}>{children}</h1>
              },
              h2: ({ children, ...props }) => {
                const text = extractTextContent(children)
                const id = slugify(text)
                return <h2 id={id} {...props}>{children}</h2>
              },
              h3: ({ children, ...props }) => {
                const text = extractTextContent(children)
                const id = slugify(text)
                return <h3 id={id} {...props}>{children}</h3>
              },
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
            }}
          >
            {content.content}
          </Markdown>
        </div>
        <div className="flex-shrink-0 pt-3 mt-3 border-t border-border text-xs text-muted-foreground text-center">
          {versionLabel}
        </div>
      </div>
    )
  }, [content, versionLabel])

  // ===== 渲染 =====

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

  return (
    <div className="flex h-full overflow-hidden">
      {/* 左侧目录 */}
      {toc.length > 0 && (
        <nav className="w-56 flex-shrink-0 border-r border-border overflow-y-auto px-3 py-4">
          <p className="text-xs font-semibold text-muted-foreground mb-3 px-2">目录</p>
          <ul className="space-y-0.5">
            {toc.map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => handleTocClick(item.id)}
                  className={`
                    w-full text-left text-[13px] py-1.5 rounded-md transition-colors
                    hover:bg-muted ${tocIndent[item.level]}
                    ${item.level === 1 ? 'font-semibold' : ''}
                    ${activeId === item.id
                      ? 'text-primary bg-primary/8'
                      : 'text-muted-foreground'
                    }
                  `}
                >
                  {item.text}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {/* 右侧内容 */}
      <div ref={contentRef} className="flex-1 overflow-y-auto">
        {/* 图文版链接 */}
        <div className="max-w-3xl mx-auto px-8 pt-4 flex justify-end items-center gap-2">
          {htmlManualError && (
            <span className="text-xs text-red-500 dark:text-red-400">
              {htmlManualError.includes('ECONNREFUSED') || htmlManualError.includes('fetch')
                ? '服务不可达，请确认后端已启动'
                : htmlManualError}
            </span>
          )}
          <button
            onClick={handleOpenHtmlManual}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            查看图文版
          </button>
        </div>
        {renderedContent}
      </div>
    </div>
  )
}

/** 从 React children 中提取纯文本 */
function extractTextContent(children: React.ReactNode): string {
  if (typeof children === 'string') return children
  if (typeof children === 'number') return String(children)
  if (Array.isArray(children)) {
    return children.map(extractTextContent).join('')
  }
  if (React.isValidElement(children)) {
    return extractTextContent((children.props as { children?: React.ReactNode }).children)
  }
  return ''
}
