import * as React from 'react'
import { Star, Clock, CheckCircle, AlertTriangle, Bot, Users } from 'lucide-react'
import { cn } from '@/lib/utils'

export type FilterTag = 'all' | 'followed' | 'recent' | 'available' | 'unavailable' | 'expert' | 'team'

interface ExpertFilterPillsProps {
  value: FilterTag
  onChange: (tag: FilterTag) => void
  counts: Partial<Record<FilterTag, number>>
}

const PILLS: Array<{ tag: FilterTag; label: string; icon: typeof Star }> = [
  { tag: 'followed', label: '收藏', icon: Star },
  { tag: 'recent', label: '最近使用', icon: Clock },
  { tag: 'expert', label: '专家', icon: Bot },
  { tag: 'team', label: '专家团', icon: Users },
  { tag: 'available', label: '可用', icon: CheckCircle },
  { tag: 'unavailable', label: '不可用', icon: AlertTriangle },
]

export function ExpertFilterPills({ value, onChange, counts }: ExpertFilterPillsProps): React.ReactElement {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {PILLS.map(({ tag, label, icon: Icon }) => {
        const active = value === tag
        const count = counts[tag]
        return (
          <button
            key={tag}
            onClick={() => onChange(active ? 'all' : tag)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
              active
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground',
            )}
          >
            <Icon size={14} />
            <span>{label}</span>
            {count !== undefined && (
              <span className={cn('ml-0.5 rounded-full px-1.5 py-0 text-xs', active ? 'bg-primary-foreground/20' : 'bg-secondary')}>
                {count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
