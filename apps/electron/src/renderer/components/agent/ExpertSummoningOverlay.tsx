import * as React from 'react'
import { Loader2, Users } from 'lucide-react'

interface ExpertSummoningOverlayProps {
  open: boolean
  groupName?: string
}

export function ExpertSummoningOverlay({ open, groupName }: ExpertSummoningOverlayProps): React.ReactElement | null {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-background/60 backdrop-blur-sm titlebar-no-drag">
      <div className="flex min-w-[240px] items-center gap-3 rounded-lg bg-card px-4 py-3 shadow-lg">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Users className="size-5" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Loader2 className="size-4 animate-spin" />
            正在召唤专家团
          </div>
          {groupName && (
            <p className="mt-1 truncate text-xs text-muted-foreground">{groupName}</p>
          )}
        </div>
      </div>
    </div>
  )
}
