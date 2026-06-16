import * as React from 'react'
import type { AgentExpertGroupInfo } from '@proma/shared'
import { Bot, FolderOpen, Hash, Network, Star, Users, Wrench } from 'lucide-react'
import { useAtomValue, useSetAtom } from 'jotai'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ExpertStatusBadge } from './ExpertStatusBadge'
import {
  followedExpertGroupsAtom,
  toggleFollowExpertGroupAtom,
} from '@/experts/atoms/expert-follow'

interface ExpertCardProps {
  group: AgentExpertGroupInfo
  onOpen: (group: AgentExpertGroupInfo) => void
  onSummon?: (group: AgentExpertGroupInfo) => void
  compact?: boolean
}

export function ExpertCard({ group, onOpen, onSummon, compact = false }: ExpertCardProps): React.ReactElement {
  const followed = useAtomValue(followedExpertGroupsAtom)
  const toggleFollow = useSetAtom(toggleFollowExpertGroupAtom)
  const isFollowed = !!followed[group.id]
  const isTeam = group.expertType === 'team' || (group.subagents && group.subagents.length > 0)

  const capabilityItems = React.useMemo(() => {
    const items: Array<{ icon: typeof Bot; label: string }> = []
    if (isTeam) {
      items.push({ icon: Users, label: `${group.subagents?.length ?? 0} 个子智能体` })
    }
    items.push(
      { icon: Wrench, label: `${group.skills?.length ?? 0} 个技能` },
      { icon: Network, label: `${group.mcpServers?.length ?? 0} 个 MCP` },
    )
    return items
  }, [group.subagents, group.skills, group.mcpServers, isTeam])

  const handleToggleFollow = React.useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    toggleFollow(group.id)
  }, [group.id, toggleFollow])

  const handleOpenPluginDir = React.useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    const pluginPath = group.sourcePluginPath
    if (pluginPath) {
      window.electronAPI.showPluginInFolder(pluginPath).catch((err) => {
        console.error('打开插件目录失败:', err)
      })
    }
  }, [group.sourcePluginPath])

  return (
    <div className={cn('rounded-lg bg-card p-4 shadow-sm', compact && 'p-2.5')}>
      <div className={cn('flex items-start justify-between gap-3', compact && 'gap-2')}>
        <button className="min-w-0 flex-1 text-left" onClick={() => onOpen(group)}>
          <div className={cn('flex items-center gap-3', compact && 'gap-2')}>
            <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted', compact && 'h-8 w-8')}>
              <Users size={compact ? 16 : 20} />
            </div>
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-1.5">
                <h3 className="truncate text-sm font-semibold">{group.name}</h3>
                <ExpertStatusBadge status={group.status} />
                {group.sourcePluginKind === 'builtin' && (
                  <Badge variant="secondary" className="shrink-0 px-1.5 py-0 text-[11px]">
                    内置
                  </Badge>
                )}
              </div>
              <p className="mt-1 truncate text-xs text-muted-foreground">主角色：{group.mainRole.name || '未配置'}</p>
            </div>
          </div>
          {group.description && (
            <p className={cn('mt-3 line-clamp-2 text-sm text-muted-foreground', compact && 'mt-2 text-xs leading-5')}>
              {group.description}
            </p>
          )}
          <div className={cn('mt-3 flex flex-wrap gap-2', compact && 'mt-2 gap-1.5')}>
            {(group.tags ?? []).slice(0, compact ? 3 : 4).map((tag) => (
              <Badge key={tag} variant="outline" className={cn(compact && 'px-2 py-0 text-[11px]')}>
                {tag}
              </Badge>
            ))}
          </div>
          <div className={cn('mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground', compact && 'mt-2 text-[11px]')}>
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              {capabilityItems.map(({ icon: Icon, label }) => (
                <span key={label} className="inline-flex items-center gap-1 whitespace-nowrap">
                  <Icon size={13} className="shrink-0 text-muted-foreground/80" />
                  <span>{label}</span>
                </span>
              ))}
            </div>
            {!compact && (
              <span
                className="inline-flex max-w-[48%] shrink-0 items-center gap-1 rounded-md bg-muted/70 px-2 py-1 font-mono text-[11px]"
                title={`专家团 ID: ${group.id}`}
              >
                <Hash size={12} className="shrink-0" />
                <span className="truncate">{group.id}</span>
              </span>
            )}
          </div>
        </button>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <button
            className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground/40 transition-all duration-200 hover:bg-yellow-50 hover:text-yellow-500 active:scale-90 dark:hover:bg-yellow-500/10"
            onClick={handleToggleFollow}
            title={isFollowed ? '取消关注' : '关注'}
          >
            <Star
              size={18}
              className={cn(
                'transition-transform duration-200',
                isFollowed && 'fill-yellow-500 text-yellow-500',
              )}
            />
          </button>
          {onSummon && (
            <Button size="sm" className={cn(compact && 'h-8 px-3')} disabled={group.status !== 'available'} onClick={() => onSummon(group)}>
              召唤
            </Button>
          )}
        </div>
      </div>
      {!compact && (
        <div className="mt-3 flex items-center gap-2 border-t pt-3 text-xs text-muted-foreground">
          <FolderOpen size={13} className="shrink-0 text-muted-foreground/60" />
          <span className="min-w-0 flex-1 truncate font-mono text-[11px]" title={group.sourcePluginPath}>
            {group.sourcePluginPath}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 shrink-0 px-2 text-[11px]"
            onClick={handleOpenPluginDir}
          >
            打开目录
          </Button>
        </div>
      )}
    </div>
  )
}
