import * as React from 'react'
import { Bot, Check, Clock, Download, ListFilter, Star, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

/** 筛选标签类型：PILLS 数组仅控制展示哪些按钮 */
export type FilterTag = 'all' | 'followed' | 'recent' | 'available' | 'unavailable' | 'expert' | 'team' | 'not_downloaded'

interface ExpertFilterPillsProps {
  value: FilterTag
  onChange: (tag: FilterTag) => void
  counts: Partial<Record<FilterTag, number>>
}

const FILTERS: Array<{ tag: FilterTag; label: string; icon: typeof Bot; group: 'common' | 'type' | 'status' }> = [
  { tag: 'followed', label: '已关注', icon: Star, group: 'common' },
  { tag: 'recent', label: '最近使用', icon: Clock, group: 'common' },
  { tag: 'expert', label: '专家', icon: Bot, group: 'type' },
  { tag: 'team', label: '专家团', icon: Users, group: 'type' },
  { tag: 'not_downloaded', label: '未下载', icon: Download, group: 'status' },
  // 故障状态筛选按钮暂时屏蔽，底层逻辑、类型和计数保留。
]

const FILTER_GROUPS: Array<{ key: 'common' | 'type' | 'status'; label: string }> = [
  { key: 'common', label: '常用' },
  { key: 'type', label: '类型' },
  { key: 'status', label: '状态' },
]

export function ExpertFilterPills({ value, onChange }: ExpertFilterPillsProps): React.ReactElement {
  const activeFilter = FILTERS.find((item) => item.tag === value)

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/60 bg-content-area px-3 text-[13px] font-medium text-foreground/80 shadow-sm transition-colors hover:bg-foreground/[0.04]',
            value !== 'all' && 'border-primary/30 text-foreground',
          )}
          title="筛选"
        >
          <ListFilter size={14} />
          <span>{activeFilter?.label ?? '筛选'}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={6} className="w-44 p-2">
        <button
          type="button"
          onClick={() => onChange('all')}
          className={cn(
            'flex h-8 w-full items-center justify-between rounded-md px-2 text-sm font-medium transition-colors hover:bg-muted',
            value === 'all' ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          <span>全部</span>
          {value === 'all' && <Check size={14} />}
        </button>

        {FILTER_GROUPS.map((group) => (
          <div key={group.key} className="mt-2 border-t border-border/60 pt-2 first:mt-1 first:border-t-0 first:pt-0">
            <div className="mb-1 px-2 text-[11px] font-medium text-muted-foreground">{group.label}</div>
            {FILTERS.filter((item) => item.group === group.key).map(({ tag, label, icon: Icon }) => {
              const active = value === tag
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => onChange(active ? 'all' : tag)}
                  className={cn(
                    'flex h-8 w-full items-center justify-between gap-2 rounded-md px-2 text-sm transition-colors hover:bg-muted',
                    active ? 'font-medium text-foreground' : 'text-muted-foreground',
                  )}
                >
                  <span className="inline-flex min-w-0 items-center gap-2">
                    <Icon size={14} className="shrink-0" />
                    <span className="truncate">{label}</span>
                  </span>
                  {active && <Check size={14} className="shrink-0" />}
                </button>
              )
            })}
          </div>
        ))}
      </PopoverContent>
    </Popover>
  )
}
