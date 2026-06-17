import * as React from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { activeViewAtom } from '@/atoms/active-view'

export function ExpertSidebarSection(): React.ReactElement {
  const activeView = useAtomValue(activeViewAtom)
  const setActiveView = useSetAtom(activeViewAtom)
  const isActive = activeView === 'expert-all'

  return (
    <div className="border-b px-2 pb-2">
      <button
        onClick={() => setActiveView('expert-all')}
        className={cn(
          'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
          isActive
            ? 'bg-primary/10 text-primary font-medium'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        )}
      >
        <Sparkles size={16} className="shrink-0" />
        <span className="flex-1 text-left">专家/专家团</span>
      </button>
    </div>
  )
}
