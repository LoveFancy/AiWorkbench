import * as React from 'react'
import { ChevronDown, Sparkles } from 'lucide-react'
import { useAtomValue, useSetAtom } from 'jotai'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  agentExpertGroupsAtom,
  agentSessionsAtom,
  loadAgentExpertGroupsAtom,
} from '@/atoms/agent-atoms'
import { loadRemoteExpertDataAtom } from '@/experts/atoms/expert-remote'
import { useSummonExpert } from '@/experts/hooks/useSummonExpert'
import { ExpertPicker } from './ExpertPicker'
import { ExpertSummoningOverlay } from '@/components/agent/ExpertSummoningOverlay'
import { cn } from '@/lib/utils'
import { getExpertSummonDisplayName } from './summon-label'

interface ExpertSummonButtonProps {
  variant?: 'header' | 'composer'
  sessionId?: string
}

export function ExpertSummonButton({ variant = 'header', sessionId }: ExpertSummonButtonProps): React.ReactElement {
  const groups = useAtomValue(agentExpertGroupsAtom)
  const sessions = useAtomValue(agentSessionsAtom)
  const loadGroups = useSetAtom(loadAgentExpertGroupsAtom)
  const loadRemote = useSetAtom(loadRemoteExpertDataAtom)
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

  React.useEffect(() => {
    if (currentSession?.expertGroupId && groups.length === 0) {
      void refresh()
    }
  }, [currentSession?.expertGroupId, groups.length, refresh])

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size={variant === 'composer' ? 'default' : 'sm'}
            className={cn(
              'titlebar-no-drag',
              variant === 'composer'
                ? cn(
                    'h-8 rounded-full text-[13px] font-medium text-foreground hover:bg-muted',
                    showComposerLabel ? 'gap-1.5 px-2' : 'w-8 px-0',
                  )
                : 'h-7 gap-1.5 px-2 text-xs',
            )}
            onClick={() => setOpen(true)}
          >
            {variant === 'composer' ? (
              <>
                <span className="flex size-6 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Sparkles className="size-3.5" />
                </span>
                {showComposerLabel && (
                  <>
                    <span className="max-w-[112px] truncate">{displayName}</span>
                    <ChevronDown className="size-3.5 text-muted-foreground" />
                  </>
                )}
              </>
            ) : (
              <>
                <Sparkles className="size-3.5" />
                召唤专家
              </>
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>{variant === 'composer' ? '召唤专家团并新建会话' : '创建绑定专家团的新 Agent 会话'}</p>
        </TooltipContent>
      </Tooltip>

      <ExpertPicker
        open={open}
        groups={groups}
        loading={loading}
        onOpenChange={setOpen}
        onRefresh={() => void refresh()}
        onSummon={(group) => { setOpen(false); void summon(group) }}
      />

      <ExpertSummoningOverlay
        open={summoningGroup !== null}
        groupName={summoningGroup?.name}
      />
    </>
  )
}
