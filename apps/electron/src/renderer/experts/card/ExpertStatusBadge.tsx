import * as React from 'react'
import type { AgentExpertGroupStatus } from '@proma/shared'
import { Badge } from '@/components/ui/badge'

const STATUS_LABELS: Record<AgentExpertGroupStatus, string> = {
  available: '可用',
  plugin_disabled: '插件已禁用',
  plugin_uninstalled: '来源已卸载',
  invalid_manifest: '配置错误',
  missing_subagent: '缺少子专家',
  missing_skill: '缺少技能',
  mcp_conflict: '连接器冲突',
}

export function ExpertStatusBadge({ status }: { status: AgentExpertGroupStatus }): React.ReactElement {
  if (status === 'available') {
    return (
      <Badge className="border-transparent bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300">
        {STATUS_LABELS[status]}
      </Badge>
    )
  }
  return <Badge variant="destructive">{STATUS_LABELS[status]}</Badge>
}
