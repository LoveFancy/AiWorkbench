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
  remote_not_downloaded: '未下载',
  remote_downloading: '下载中...',
  remote_download_failed: '下载失败',
  remote_update_available: '可更新',
}

export function ExpertStatusBadge({ status }: { status: AgentExpertGroupStatus }): React.ReactElement {
  if (status === 'available') {
    return (
      <Badge className="border-transparent bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300">
        {STATUS_LABELS[status]}
      </Badge>
    )
  }
  if (status === 'remote_not_downloaded' || status === 'remote_downloading' || status === 'remote_update_available') {
    return (
      <Badge className="border-transparent bg-blue-100 text-blue-700 hover:bg-blue-100 dark:bg-blue-500/15 dark:text-blue-300">
        {STATUS_LABELS[status]}
      </Badge>
    )
  }
  return <Badge variant="destructive">{STATUS_LABELS[status]}</Badge>
}
