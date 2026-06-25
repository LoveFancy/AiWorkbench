import * as React from 'react'
import type { AgentExpertGroupStatus } from '@proma/shared'
import { EXPERT_GROUP_STATUS_LABELS } from '@proma/shared'
import { Badge } from '@/components/ui/badge'

export function ExpertStatusBadge({ status }: { status: AgentExpertGroupStatus }): React.ReactElement {
  if (status === 'available') {
    return (
      <Badge className="border-transparent bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300">
        {EXPERT_GROUP_STATUS_LABELS[status]}
      </Badge>
    )
  }
  if (status === 'remote_not_downloaded' || status === 'remote_downloading' || status === 'remote_update_available') {
    return (
      <Badge className="border-transparent bg-blue-100 text-blue-700 hover:bg-blue-100 dark:bg-blue-500/15 dark:text-blue-300">
        {EXPERT_GROUP_STATUS_LABELS[status]}
      </Badge>
    )
  }
  return <Badge variant="destructive">{EXPERT_GROUP_STATUS_LABELS[status]}</Badge>
}
