/**
 * MentionList — 泛型 Mention 下拉列表
 *
 * 统一键盘导航（上/下/Enter/Tab/Escape）、选中高亮、滚动定位。
 * 通过 renderItem / keyExtractor 适配不同 Mention 类型（Skill、MCP 等）。
 * 通过 React.useImperativeHandle 暴露 onKeyDown 给 TipTap Suggestion。
 */

import * as React from 'react'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export const MENTION_LIST_WIDTH_CLASS = 'w-[560px]'
export const MENTION_LIST_EMPTY_WIDTH_CLASS = 'w-[560px]'
export const MENTION_LIST_TOOLTIP_WIDTH_CLASS = 'max-w-[560px]'

export interface MentionListProps<T> {
  items: T[]
  onSelect: (item: T) => void
  /** 空列表占位文字 */
  emptyText: string
  /** 从 item 提取唯一 key */
  keyExtractor: (item: T) => string
  /** 鼠标悬停时展示的完整说明 */
  titleExtractor?: (item: T) => string | undefined
  /** 自定义每项渲染 */
  renderItem: (item: T) => React.ReactNode
}

export interface MentionListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean
}

export interface MentionListKeyDownInput<T> {
  event: KeyboardEvent
  items: T[]
  selectedIndex: number
  setSelectedIndex: React.Dispatch<React.SetStateAction<number>>
  onSelect: (item: T) => void
}

export function handleMentionListKeyDown<T>({
  event,
  items,
  selectedIndex,
  setSelectedIndex,
  onSelect,
}: MentionListKeyDownInput<T>): boolean {
  if (event.key === 'ArrowUp') {
    if (items.length === 0) return false
    setSelectedIndex((prev) => (prev <= 0 ? items.length - 1 : prev - 1))
    return true
  }

  if (event.key === 'ArrowDown') {
    if (items.length === 0) return false
    setSelectedIndex((prev) => (prev >= items.length - 1 ? 0 : prev + 1))
    return true
  }

  if (event.key === 'Enter' || event.key === 'Tab') {
    if (items.length === 0) return false
    if (event.key === 'Tab') event.preventDefault()

    const item = items[selectedIndex]
    if (item) onSelect(item)
    return true
  }

  if (event.key === 'Escape') {
    return true
  }

  return false
}

export function normalizeMentionTooltipTitle(title: string | undefined): string | undefined {
  const trimmed = title?.trim()
  return trimmed ? trimmed : undefined
}

function renderTooltipContent(title: string): React.ReactElement {
  return (
    <TooltipContent
      side="right"
      align="start"
      sideOffset={8}
      className={cn(
        'z-[10000] whitespace-pre-wrap break-words leading-relaxed',
        MENTION_LIST_TOOLTIP_WIDTH_CLASS,
      )}
    >
      {title}
    </TooltipContent>
  )
}

function MentionListInner<T>(
  { items, onSelect, emptyText, keyExtractor, titleExtractor, renderItem }: MentionListProps<T>,
  ref: React.ForwardedRef<MentionListRef>,
): React.ReactElement {
  const [localIndex, setLocalIndex] = React.useState(0)
  const containerRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    setLocalIndex(0)
  }, [items])

  React.useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const item = container.children[localIndex] as HTMLElement | undefined
    item?.scrollIntoView({ block: 'nearest' })
  }, [localIndex])

  React.useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) =>
      handleMentionListKeyDown({
        event,
        items,
        selectedIndex: localIndex,
        setSelectedIndex: setLocalIndex,
        onSelect,
      }),
  }))

  if (items.length === 0) {
    return (
      <div className={cn('rounded-lg border bg-popover p-2 shadow-lg text-[11px] text-muted-foreground', MENTION_LIST_EMPTY_WIDTH_CLASS)}>
        {emptyText}
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className={cn('rounded-lg border bg-popover shadow-lg overflow-y-auto max-h-[240px]', MENTION_LIST_WIDTH_CLASS)}
    >
      {items.map((item, index) => {
        const title = normalizeMentionTooltipTitle(titleExtractor?.(item))
        const button = (
          <button
            type="button"
            className={cn(
              'w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-accent transition-colors',
              index === localIndex && 'bg-accent text-accent-foreground',
            )}
            // 用 mousedown 而非 click：异步 items 重渲染会替换 button 节点，
            // 导致 mousedown/mouseup 不在同一节点、click 不派发而漏选；
            // preventDefault 阻止按钮抢焦点，避免编辑器 blur 触发弹窗关闭竞态。
            onMouseDown={(e) => {
              e.preventDefault()
              onSelect(item)
            }}
          >
            {renderItem(item)}
          </button>
        )

        return title ? (
          <Tooltip key={keyExtractor(item)} delayDuration={250}>
            <TooltipTrigger asChild>{button}</TooltipTrigger>
            {renderTooltipContent(title)}
          </Tooltip>
        ) : (
          <React.Fragment key={keyExtractor(item)}>{button}</React.Fragment>
        )
      })}
    </div>
  )
}

// 泛型 forwardRef 包装
export const MentionList = React.forwardRef(MentionListInner) as <T>(
  props: MentionListProps<T> & { ref?: React.Ref<MentionListRef> },
) => React.ReactElement
