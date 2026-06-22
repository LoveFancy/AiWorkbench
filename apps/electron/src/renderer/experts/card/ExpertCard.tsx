import * as React from 'react'
import type { AgentExpertGroupInfo } from '@proma/shared'
import { Bot, Star, Users } from 'lucide-react'
import { useAtomValue, useSetAtom } from 'jotai'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
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

  const handleToggleFollow = React.useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    toggleFollow(group.id)
  }, [group.id, toggleFollow])

  return (
    <div
      className={cn(
        'group relative flex h-full flex-col gap-3 rounded-xl border border-border/60 bg-content-area p-4 text-left transition-all',
        'hover:border-border hover:shadow-sm focus-within:outline-none focus-within:ring-1 focus-within:ring-ring',
        compact && 'gap-2 p-2.5',
      )}
    >
      <button
        className={cn(
          'absolute right-0 top-0 z-[2] flex size-[26px] shrink-0 items-center justify-center rounded-bl-lg rounded-tr-xl bg-background/90 text-muted-foreground/45 shadow-sm transition-all duration-200 hover:bg-yellow-50 hover:text-yellow-500 active:scale-95 dark:hover:bg-yellow-500/10',
          isFollowed && 'text-yellow-500',
        )}
        onClick={handleToggleFollow}
        title={isFollowed ? '取消关注' : '关注'}
      >
        <Star
          size={13}
          className={cn(
            'transition-transform duration-200',
            isFollowed && 'fill-yellow-500 text-yellow-500',
          )}
        />
      </button>

      <div className={cn('flex items-start justify-between gap-3', compact && 'gap-2')}>
        <button className="min-w-0 flex-1 text-left" onClick={() => onOpen(group)}>
          <div className={cn('flex items-start gap-3', compact && 'gap-2')}>
            <div className={cn('flex shrink-0 items-center justify-center rounded-xl bg-muted p-2 text-foreground/70 shadow-sm', compact && 'rounded-lg p-1.5')}>
              {isTeam ? <Users size={compact ? 16 : 18} /> : <Bot size={compact ? 16 : 18} />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center justify-between gap-2">
                <h3 className="truncate text-sm font-medium text-foreground">{group.name}</h3>
              </div>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">主角色：{group.mainRole.name || '未配置'}</p>
            </div>
          </div>
          {group.description && (
            <p className={cn('mt-3 line-clamp-2 min-h-[40px] text-[13px] leading-6 text-muted-foreground', compact && 'mt-2 min-h-0 text-xs leading-5')}>
              {group.description}
            </p>
          )}
          <div className={cn('mt-3 flex min-h-[24px] flex-wrap gap-1.5', compact && 'mt-2 min-h-0')}>
            {(group.tags ?? []).slice(0, compact ? 3 : 4).map((tag) => (
              <span
                key={tag}
                className={cn(
                  'rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground',
                  compact && 'px-1 py-0',
                )}
              >
                {tag}
              </span>
            ))}
          </div>
        </button>
        <div className="absolute right-4 top-4 flex items-center gap-2 pr-5">
          {onSummon && (
            <Button
              size="sm"
              className={cn(
                'pointer-events-none h-9 px-4 opacity-0 shadow-sm transition-all duration-200 group-hover:pointer-events-auto group-hover:opacity-100',
                compact && 'h-8 px-3',
              )}
              disabled={group.status !== 'available' && group.status !== 'remote_not_downloaded' && group.status !== 'remote_downloading'}
              onClick={() => onSummon(group)}
            >
              {group.status === 'remote_not_downloaded' ? '下载' : group.status === 'remote_downloading' ? '下载中...' : '召唤'}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
