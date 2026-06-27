import * as React from 'react'
import type { AgentExpertGroupInfo } from '@proma/shared'
import { ExpertCard } from '@/experts/card/ExpertCard'
import { ExpertDetailDialog } from '@/experts/detail/ExpertDetailDialog'

interface ExpertCardGridProps {
  groups: AgentExpertGroupInfo[]
  emptyState?: React.ReactNode
  onSummon?: (group: AgentExpertGroupInfo, samplePrompt?: string) => void
}

export function ExpertCardGrid({ groups, emptyState, onSummon }: ExpertCardGridProps): React.ReactElement {
  const [selected, setSelected] = React.useState<AgentExpertGroupInfo | null>(null)

  if (groups.length === 0 && emptyState) {
    return <>{emptyState}</>
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {groups.map((group) => (
          <ExpertCard
            key={`${group.sourcePluginId}:${group.id}`}
            group={group}
            onOpen={setSelected}
            onSummon={onSummon}
          />
        ))}
      </div>
      <ExpertDetailDialog
        group={selected}
        open={selected !== null}
        onOpenChange={(next) => { if (!next) setSelected(null) }}
        onSummon={onSummon}
      />
    </>
  )
}
