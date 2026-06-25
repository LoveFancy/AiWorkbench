import * as React from 'react'
import { Check, ChevronDown, Sparkles, Users } from 'lucide-react'
import { useAtomValue, useSetAtom } from 'jotai'
import { toast } from 'sonner'
import type { AgentExpertGroupInfo } from '@proma/shared'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  agentExpertGroupsAtom,
  agentSessionsAtom,
  loadAgentExpertGroupsAtom,
} from '@/atoms/agent-atoms'
import { activeViewAtom, agentSkillsInitialTabAtom } from '@/atoms/active-view'
import { loadRemoteExpertDataAtom } from '@/experts/atoms/expert-remote'
import { recentExpertGroupsAtom } from '@/experts/atoms/expert-follow'
import { useSummonExpert } from '@/experts/hooks/useSummonExpert'
import { isCardSummonActionable } from '@/experts/utils/summon'
import { ExpertPicker } from './ExpertPicker'
import { ExpertSummoningOverlay } from '@/components/agent/ExpertSummoningOverlay'
import { cn } from '@/lib/utils'
import { getExpertSummonDisplayName } from './summon-label'

interface ExpertSummonButtonProps {
  variant?: 'header' | 'composer'
  sessionId?: string
}

export function getRecentExpertGroups(
  groups: AgentExpertGroupInfo[],
  recent: Record<string, number>,
  limit = 3,
): AgentExpertGroupInfo[] {
  return groups
    .filter((group) => recent[group.id] && isCardSummonActionable(group.status))
    .sort((a, b) => (recent[b.id] ?? 0) - (recent[a.id] ?? 0))
    .slice(0, limit)
}

export function ExpertSummonButton({ variant = 'header', sessionId }: ExpertSummonButtonProps): React.ReactElement {
  const groups = useAtomValue(agentExpertGroupsAtom)
  const sessions = useAtomValue(agentSessionsAtom)
  const recent = useAtomValue(recentExpertGroupsAtom)
  const loadGroups = useSetAtom(loadAgentExpertGroupsAtom)
  const loadRemote = useSetAtom(loadRemoteExpertDataAtom)
  const setActiveView = useSetAtom(activeViewAtom)
  const setAgentSkillsInitialTab = useSetAtom(agentSkillsInitialTabAtom)
  const { summon, summoningGroup } = useSummonExpert()
  const [open, setOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(false)

  const refresh = React.useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      await Promise.all([loadGroups(), loadRemote()])
    } catch (error) {
      console.error('[专家团] 加载专家团失败:', error)
      toast.error('加载专家团失败')
    } finally {
      setLoading(false)
    }
  }, [loadGroups, loadRemote])

  React.useEffect(() => {
    if (open && groups.length === 0) {
      void refresh()
    }
  }, [groups.length, open, refresh])

  const currentSession = React.useMemo(
    () => sessionId ? sessions.find((session) => session.id === sessionId) : undefined,
    [sessionId, sessions],
  )
  const displayName = getExpertSummonDisplayName(currentSession, groups)
  const showComposerLabel = variant === 'composer' && displayName !== null
  const recentGroups = React.useMemo(
    () => getRecentExpertGroups(groups, recent),
    [groups, recent],
  )

  React.useEffect(() => {
    if (currentSession?.expertGroupId && groups.length === 0) {
      void refresh()
    }
  }, [currentSession?.expertGroupId, groups.length, refresh])

  const handleSummon = React.useCallback((group: AgentExpertGroupInfo): void => {
    setOpen(false)
    void summon(group)
  }, [summon])

  const handleOpenExpertsPage = React.useCallback((): void => {
    setOpen(false)
    setAgentSkillsInitialTab('experts')
    setActiveView('agent-skills')
  }, [setActiveView, setAgentSkillsInitialTab])

  const renderComposerTrigger = (): React.ReactElement => (
    <Button
      type="button"
      variant="ghost"
      size="default"
      className={cn(
        'titlebar-no-drag h-8 rounded-full text-[13px] font-medium text-foreground hover:bg-muted',
        showComposerLabel ? 'gap-1.5 px-2' : 'w-8 px-0',
      )}
    >
      <span className="flex size-6 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Sparkles className="size-3.5" />
      </span>
      {showComposerLabel && (
        <>
          <span className="max-w-[112px] truncate">{displayName}</span>
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </>
      )}
    </Button>
  )

  const renderComposerPicker = (): React.ReactElement => (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              {renderComposerTrigger()}
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>选择最近召唤的专家团</p>
          </TooltipContent>
        </Tooltip>

        <PopoverContent
          side="top"
          align="start"
          sideOffset={10}
          className="w-[280px] overflow-hidden rounded-[14px] border border-border/60 bg-popover/95 p-2 shadow-xl backdrop-blur"
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <div className="px-2 pb-2 pt-1 text-xs font-medium text-muted-foreground">最近召唤专家</div>
          <div className="space-y-1">
            {recentGroups.length > 0 ? (
              recentGroups.map((group) => {
                const selected = currentSession?.expertGroupId === group.id &&
                  (!currentSession.expertPluginId || currentSession.expertPluginId === group.sourcePluginId)
                return (
                  <button
                    key={`${group.sourcePluginId}:${group.id}`}
                    type="button"
                    className="flex h-11 w-full items-center gap-2.5 rounded-lg px-2 text-left transition-colors hover:bg-muted"
                    onClick={() => handleSummon(group)}
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Users className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">{group.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{group.mainRole.name || '专家团'}</span>
                    </span>
                    {selected ? <Check className="size-4 shrink-0 text-primary" /> : null}
                  </button>
                )
              })
            ) : (
              <div className="rounded-lg bg-muted/45 px-3 py-4 text-center text-xs text-muted-foreground">
                暂无最近召唤记录
              </div>
            )}
          </div>

          <div className="mt-2 border-t border-border/60 pt-2">
            <button
              type="button"
              className="flex h-10 w-full items-center gap-2.5 rounded-lg px-2 text-left text-sm font-medium text-primary transition-colors hover:bg-primary/10"
              onClick={handleOpenExpertsPage}
            >
              <Sparkles className="size-4" />
              <span>召唤其它专家</span>
            </button>
          </div>
        </PopoverContent>
      </Popover>

      <ExpertSummoningOverlay
        open={summoningGroup !== null}
        groupName={summoningGroup?.name}
      />
    </>
  )

  if (variant === 'composer') {
    return renderComposerPicker()
  }

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn(
              'titlebar-no-drag',
              'h-7 gap-1.5 px-2 text-xs',
            )}
            onClick={() => setOpen(true)}
          >
            <Sparkles className="size-3.5" />
            召唤专家
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>创建绑定专家团的新 Agent 会话</p>
        </TooltipContent>
      </Tooltip>

      <ExpertPicker
        open={open}
        groups={groups}
        loading={loading}
        onOpenChange={setOpen}
        onRefresh={() => void refresh()}
        onSummon={handleSummon}
      />

      <ExpertSummoningOverlay
        open={summoningGroup !== null}
        groupName={summoningGroup?.name}
      />
    </>
  )
}
