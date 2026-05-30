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

export interface MentionListProps<T> {
  items: T[]
  selectedIndex: number
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
    <TooltipContent side="right" align="start" sideOffset={8} className="z-[10000] max-w-[360px] whitespace-pre-wrap break-words leading-relaxed">
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
      <div className="rounded-lg border bg-popover p-2 shadow-lg text-[11px] text-muted-foreground w-[280px]">
        {emptyText}
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="rounded-lg border bg-popover shadow-lg overflow-y-auto max-h-[240px] w-[280px]"
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
            onClick={() => onSelect(item)}
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
