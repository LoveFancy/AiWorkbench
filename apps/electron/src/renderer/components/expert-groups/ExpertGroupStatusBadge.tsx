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

export function ExpertGroupStatusBadge({ status }: { status: AgentExpertGroupStatus }): React.ReactElement {
  if (status === 'available') {
    return <Badge variant="secondary">{STATUS_LABELS[status]}</Badge>
  }
  return <Badge variant="destructive">{STATUS_LABELS[status]}</Badge>
}
