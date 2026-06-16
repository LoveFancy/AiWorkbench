import * as React from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import type { AgentExpertGroupInfo } from '@proma/shared'
import { toast } from 'sonner'
import { ScrollArea } from '@/components/ui/scroll-area'
import { agentExpertGroupsAtom, createExpertSessionAtom, loadAgentExpertGroupsAtom } from '@/atoms/agent-atoms'
import { useOpenSession } from '@/hooks/useOpenSession'
import {
  followedExpertGroupsAtom,
  recentExpertGroupsAtom,
  recordRecentExpertGroupAtom,
} from '@/experts/atoms/expert-follow'
import { ExpertSearchBar } from '@/experts/shared/ExpertSearchBar'
import { ExpertFilterPills, type FilterTag } from '@/experts/shared/ExpertFilterPills'
import { ExpertCardGrid } from '@/experts/shared/ExpertCardGrid'
import { ExpertEmptyState } from '@/experts/shared/ExpertEmptyState'
import { ExpertImportButton } from '@/experts/shared/ExpertImportDropdown'
import { ExpertFeaturedScenes } from '@/experts/shared/ExpertFeaturedScenes'
import { filterByTag, searchByName, filterByScene } from '@/experts/utils/filter'

interface ExpertPageViewProps {
  /** 是否显示精选场景区（仅"专家/专家团"页面） */
  showFeaturedScenes?: boolean
  /** 初始筛选状态 */
  initialFilter: 'all' | 'followed' | 'recent'
}

export function ExpertPageView({ showFeaturedScenes = false, initialFilter }: ExpertPageViewProps): React.ReactElement {
  const allGroups = useAtomValue(agentExpertGroupsAtom)
  const loadGroups = useSetAtom(loadAgentExpertGroupsAtom)
  const createExpertSession = useSetAtom(createExpertSessionAtom)
  const openSession = useOpenSession()
  const followed = useAtomValue(followedExpertGroupsAtom)
  const recent = useAtomValue(recentExpertGroupsAtom)
  const recordRecent = useSetAtom(recordRecentExpertGroupAtom)

  const [query, setQuery] = React.useState('')
  const [filterTag, setFilterTag] = React.useState<FilterTag>(initialFilter)
  const [sceneFilter, setSceneFilter] = React.useState<string[] | null>(null)
  const [activeSceneId, setActiveSceneId] = React.useState<string | null>(null)

  // 首次加载
  React.useEffect(() => {
    if (allGroups.length === 0) {
      void loadGroups()
    }
  }, [allGroups.length, loadGroups])

  // 初始筛选变化时重置
  React.useEffect(() => {
    setFilterTag(initialFilter)
    setQuery('')
  }, [initialFilter])

  // 数据管道：筛选 → 场景 → 搜索
  const displayGroups = React.useMemo(() => {
    let result = allGroups
    result = filterByTag(result, filterTag, followed, recent)
    result = filterByScene(result, sceneFilter ?? [])
    result = searchByName(result, query)
    return result
  }, [allGroups, filterTag, query, followed, recent, sceneFilter])

  const handleSummon = React.useCallback(async (group: AgentExpertGroupInfo) => {
    if (group.status !== 'available') return
    try {
      const session = await createExpertSession(group)
      recordRecent(group.id)
      openSession('agent', session.id, session.title)
      toast.success(`已召唤${group.name}`)
    } catch (error) {
      console.error('[专家团] 召唤失败:', error)
      toast.error('召唤专家团失败')
    }
  }, [createExpertSession, openSession, recordRecent])

  const emptyType: 'followed' | 'recent' | 'search' | 'all' = React.useMemo(() => {
    if (filterTag === 'followed') return 'followed'
    if (filterTag === 'recent') return 'recent'
    if (query.trim() || sceneFilter) return 'search'
    return 'all'
  }, [filterTag, query, sceneFilter])

  return (
    <div className="flex h-full flex-col bg-background">
      {/* 顶部控制栏 — pt-10 留出窗口按钮空间，titlebar-no-drag 确保点击不被拖拽区域拦截 */}
      <div className="flex-shrink-0 border-b px-6 pt-10 pb-4 titlebar-no-drag">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">
            {initialFilter === 'all' ? '专家/专家团' : initialFilter === 'followed' ? '已关注' : '最近使用'}
          </h2>
          <div className="flex items-center gap-2">
            <ExpertSearchBar value={query} onChange={setQuery} />
            {initialFilter === 'all' && <ExpertImportButton />}
          </div>
        </div>

        {/* 筛选按钮 */}
        <div className="mt-3">
          <ExpertFilterPills
            value={filterTag}
            onChange={setFilterTag}
            counts={{
              followed: Object.keys(followed).length,
              expert: allGroups.filter((g) => g.expertType !== 'team').length,
              team: allGroups.filter((g) => g.expertType === 'team' || (g.subagents && g.subagents.length > 0)).length,
              available: allGroups.filter((g) => g.status === 'available').length,
              unavailable: allGroups.filter((g) => g.status !== 'available').length,
            }}
          />
        </div>
      </div>

      {/* 内容区 */}
      <ScrollArea className="flex-1">
        <div className="p-6">
          {/* 精选场景 */}
          {showFeaturedScenes && filterTag === 'all' && !query.trim() && displayGroups.length > 0 && (
            <div className="mb-8">
              <ExpertFeaturedScenes
                allGroups={allGroups}
                activeScene={activeSceneId}
                onSceneClick={(sceneId, tags) => {
                  setSceneFilter(tags)
                  setActiveSceneId(sceneId)
                }}
              />
            </div>
          )}

          {/* 卡片网格 */}
          <ExpertCardGrid
            groups={displayGroups}
            onSummon={handleSummon}
            emptyState={
              <ExpertEmptyState
                type={emptyType}
                onClear={() => { setQuery(''); setFilterTag('all'); setSceneFilter(null); setActiveSceneId(null) }}
              />
            }
          />
        </div>
      </ScrollArea>
    </div>
  )
}
