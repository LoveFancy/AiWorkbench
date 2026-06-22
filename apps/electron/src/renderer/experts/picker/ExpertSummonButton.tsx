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
import { loadRemoteExpertDataAtom } from '@/experts/atoms/expert-remote'
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
  const loadRemote = useSetAtom(loadRemoteExpertDataAtom)
  const createExpertSession = useSetAtom(createExpertSessionAtom)
  const recordRecent = useSetAtom(recordRecentExpertGroupAtom)
  const openSession = useOpenSession()
  const [open, setOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [summoningGroup, setSummoningGroup] = React.useState<AgentExpertGroupInfo | null>(null)

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

  const handleSummon = React.useCallback(async (group: AgentExpertGroupInfo): Promise<void> => {
    // 远程专家团需先下载
    if (group.sourcePluginKind === 'remote' && group.status !== 'available') {
      if (group.status === 'remote_downloading') {
        toast('正在下载中，请稍候')
        return
      }
      setSummoningGroup(group)
      try {
        const installed = await window.electronAPI.downloadRemoteExpert(group.id)
        // 重新加载本地列表使合并 atom 识别新下载的专家团
        await loadGroups()
        // 更新 group 为已安装版本用于召唤
        toast.success(`已下载 ${group.name}，正在召唤...`)
        const session = await createExpertSession({
          ...group,
          status: 'available',
          sourcePluginKind: 'user',
          sourcePluginId: installed.name,
          sourcePluginVersion: installed.version,
        })
        recordRecent(group.id)
        openSession('agent', session.id, session.title)
        setOpen(false)
      } catch (err) {
        console.error('[专家团] 下载远程专家团失败:', err)
        toast.error(`下载 ${group.name} 失败`)
      } finally {
        setSummoningGroup(null)
      }
      return
    }

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
  }, [createExpertSession, openSession, recordRecent, loadGroups])

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
        onSummon={(group) => void handleSummon(group)}
      />

      <ExpertSummoningOverlay
        open={summoningGroup !== null}
        groupName={summoningGroup?.name}
      />
    </>
  )
}
