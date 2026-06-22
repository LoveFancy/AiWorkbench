import * as React from 'react'
import { useSetAtom } from 'jotai'
import { toast } from 'sonner'
import type { AgentExpertGroupInfo } from '@proma/shared'
import { createExpertSessionAtom, loadAgentExpertGroupsAtom } from '@/atoms/agent-atoms'
import { recordRecentExpertGroupAtom } from '@/experts/atoms/expert-follow'
import { useOpenSession } from '@/hooks/useOpenSession'
import { isRemoteSourced, isSummonableLocal } from '@/experts/utils/summon'

interface UseSummonExpertResult {
  /** 召唤专家团：远程未下载先下载；本地已安装则按需升级后召唤 */
  summon: (group: AgentExpertGroupInfo) => Promise<void>
  /** 召唤中的专家团（用于渲染 ExpertSummoningOverlay）；null 表示空闲 */
  summoningGroup: AgentExpertGroupInfo | null
}

/**
 * 召唤专家团的唯一编排入口。
 *
 * 收敛原先分散在 ExpertSummonButton / ExpertPageView 的重复召唤逻辑，
 * 并在「本地已安装」分支接入召唤时版本升级（静默、失败降级本地版、不阻断）。
 */
export function useSummonExpert(): UseSummonExpertResult {
  const createExpertSession = useSetAtom(createExpertSessionAtom)
  const loadGroups = useSetAtom(loadAgentExpertGroupsAtom)
  const recordRecent = useSetAtom(recordRecentExpertGroupAtom)
  const openSession = useOpenSession()
  const [summoningGroup, setSummoningGroup] = React.useState<AgentExpertGroupInfo | null>(null)

  const summon = React.useCallback(async (group: AgentExpertGroupInfo): Promise<void> => {
    // ── 分支一：远程未下载 → 下载后召唤
    if (group.sourcePluginKind === 'remote' && group.status !== 'available') {
      if (group.status === 'remote_downloading') {
        toast('正在下载中，请稍候')
        return
      }
      setSummoningGroup(group)
      try {
        const installed = await window.electronAPI.downloadRemoteExpert(group.id)
        await loadGroups()
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
      } catch (err) {
        console.error('[专家团] 下载远程专家团失败:', err)
        toast.error(`下载 ${group.name} 失败`)
      } finally {
        setSummoningGroup(null)
      }
      return
    }

    // ── 分支二：本地已安装（available / remote_update_available）→ 按需升级后召唤
    //    注意：必须放行 remote_update_available，否则可更新的专家团点击召唤会被拦截
    if (!isSummonableLocal(group)) return

    try {
      // 仅对远程下载来源（user:remote/*）做召唤时自动升级；
      // builtin / 用户上传来源跳过（避免专家团 ID 重复校验冲突），失败均降级本地版、不阻断。
      // 升级检查/下载阶段不显示遮罩，保证 UI 不被阻塞（符合方案 §4「无检查态 overlay」）。
      if (isRemoteSourced(group)) {
        const { updated } = await window.electronAPI.ensureExpertGroupLatest(
          group.id,
          group.sourcePluginVersion,
        )
        if (updated) {
          await loadGroups()
        }
      }
      // 仅在创建会话阶段显示召唤遮罩
      setSummoningGroup(group)
      const session = await createExpertSession(group)
      recordRecent(group.id)
      openSession('agent', session.id, session.title)
      toast.success(`已召唤${group.name}`)
    } catch (error) {
      console.error('[专家团] 召唤失败:', error)
      toast.error('召唤专家团失败')
    } finally {
      setSummoningGroup(null)
    }
  }, [createExpertSession, loadGroups, recordRecent, openSession])

  return { summon, summoningGroup }
}
