import * as React from 'react'
import { ChevronDown, Sparkles } from 'lucide-react'
import type { AgentExpertGroupInfo } from '@proma/shared'
import { useAtomValue, useSetAtom } from 'jotai'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  agentExpertGroupsAtom,
  agentSessionsAtom,
  createExpertSessionAtom,
  loadAgentExpertGroupsAtom,
} from '@/atoms/agent-atoms'
import { recordRecentExpertGroupAtom } from '@/experts/atoms/expert-follow'
import { useOpenSession } from '@/hooks/useOpenSession'
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
  const createExpertSession = useSetAtom(createExpertSessionAtom)
  const recordRecent = useSetAtom(recordRecentExpertGroupAtom)
  const openSession = useOpenSession()
  const [open, setOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [summoningGroup, setSummoningGroup] = React.useState<AgentExpertGroupInfo | null>(null)

  const refresh = React.useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      await loadGroups()
    } catch (error) {
      console.error('[专家团] 加载专家团失败:', error)
      toast.error('加载专家团失败')
    } finally {
      setLoading(false)
    }
  }, [loadGroups])

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

  React.useEffect(() => {
    if (currentSession?.expertGroupId && groups.length === 0) {
      void refresh()
    }
  }, [currentSession?.expertGroupId, groups.length, refresh])

  const handleSummon = React.useCallback(async (group: AgentExpertGroupInfo): Promise<void> => {
    if (group.status !== 'available') return
    setSummoningGroup(group)
    try {
      const session = await createExpertSession(group)
      recordRecent(group.id)
      openSession('agent', session.id, session.title)
      setOpen(false)
      toast.success(`已召唤${group.name}`)
    } catch (error) {
      console.error('[专家团] 召唤专家团失败:', error)
      toast.error('召唤专家团失败')
    } finally {
      setSummoningGroup(null)
    }
  }, [createExpertSession, openSession, recordRecent])

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
                ? 'h-[36px] gap-2 rounded-full px-3 text-sm font-medium text-foreground hover:bg-muted'
                : 'h-7 gap-1.5 px-2 text-xs',
            )}
            onClick={() => setOpen(true)}
          >
            {variant === 'composer' ? (
              <>
                <span className="flex size-6 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Sparkles className="size-3.5" />
                </span>
                <span className="max-w-[160px] truncate">{displayName}</span>
                <ChevronDown className="size-4 text-muted-foreground" />
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
        onSummon={(group) => void handleSummon(group)}
      />

      <ExpertSummoningOverlay
        open={summoningGroup !== null}
        groupName={summoningGroup?.name}
      />
    </>
  )
}
