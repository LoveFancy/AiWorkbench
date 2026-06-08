import * as React from 'react'
import type { AgentExpertGroupInfo } from '@proma/shared'
import { Bot, Hash, Users } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ExpertGroupStatusBadge } from './ExpertGroupStatusBadge'
import { getExpertGroupIdentifierLabel } from './expert-group-card-labels'

interface ExpertGroupCardProps {
  group: AgentExpertGroupInfo
  onOpen: (group: AgentExpertGroupInfo) => void
  onSummon?: (group: AgentExpertGroupInfo) => void
  compact?: boolean
}

export function ExpertGroupCard({ group, onOpen, onSummon, compact = false }: ExpertGroupCardProps): React.ReactElement {
  const capabilityText = `${group.subagents?.length ?? 0} SubAgents · ${group.skills?.length ?? 0} Skills · ${group.mcpServers?.length ?? 0} MCP`
  const identifierLabel = getExpertGroupIdentifierLabel(group)
  return (
    <div className={cn('rounded-lg bg-card p-4 shadow-sm', compact && 'p-3')}>
      <div className="flex items-start justify-between gap-3">
        <button className="min-w-0 flex-1 text-left" onClick={() => onOpen(group)}>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
              <Users size={20} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="truncate text-sm font-semibold">{group.name}</h3>
                <ExpertGroupStatusBadge status={group.status} />
              </div>
              <p className="mt-1 truncate text-xs text-muted-foreground">主角色：{group.mainRole.name || '未配置'}</p>
            </div>
          </div>
          {group.description && <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{group.description}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            {(group.tags ?? []).slice(0, 4).map((tag) => <Badge key={tag} variant="outline">{tag}</Badge>)}
          </div>
          <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span className="inline-flex min-w-0 items-center gap-1">
              <Bot size={13} className="shrink-0" />
              <span className="truncate">{capabilityText}</span>
            </span>
            <span
              className="inline-flex max-w-[48%] shrink-0 items-center gap-1 rounded-md bg-muted/70 px-2 py-1 font-mono text-[11px]"
              title={`专家团 ID: ${identifierLabel}`}
            >
              <Hash size={12} className="shrink-0" />
              <span className="truncate">{identifierLabel}</span>
            </span>
          </div>
        </button>
        {onSummon && (
          <Button size="sm" disabled={group.status !== 'available'} onClick={() => onSummon(group)}>
            召唤
          </Button>
        )}
      </div>
    </div>
  )
}
