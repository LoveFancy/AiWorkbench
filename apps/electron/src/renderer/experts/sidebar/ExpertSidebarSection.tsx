import * as React from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { Clock, Sparkles, Star } from 'lucide-react'
import { cn } from '@/lib/utils'
import { activeViewAtom, type ActiveView } from '@/atoms/active-view'
import { followedExpertGroupsAtom, recentExpertGroupsAtom } from '@/experts/atoms/expert-follow'

export function ExpertSidebarSection(): React.ReactElement {
  const activeView = useAtomValue(activeViewAtom)
  const setActiveView = useSetAtom(activeViewAtom)
  const followed = useAtomValue(followedExpertGroupsAtom)
  const recent = useAtomValue(recentExpertGroupsAtom)

  const items: Array<{
    view: ActiveView
    icon: typeof Sparkles
    label: string
    badge: number
  }> = React.useMemo(() => [
    { view: 'expert-followed', icon: Star, label: '已关注', badge: Object.keys(followed).length },
    { view: 'expert-recent', icon: Clock, label: '最近使用', badge: Object.keys(recent).length },
    { view: 'expert-all', icon: Sparkles, label: '专家/专家团', badge: 0 },
  ], [followed, recent])

  return (
    <div className="border-b px-2 pb-2">
      {items.map(({ view, icon: Icon, label, badge }) => (
        <button
          key={view}
          onClick={() => setActiveView(view)}
          className={cn(
            'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
            activeView === view
              ? 'bg-primary/10 text-primary font-medium'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
        >
          <Icon size={16} className="shrink-0" />
          <span className="flex-1 text-left">{label}</span>
          {badge > 0 && (
            <span className={cn(
              'flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-medium',
              activeView === view ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground',
            )}>
              {badge}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
