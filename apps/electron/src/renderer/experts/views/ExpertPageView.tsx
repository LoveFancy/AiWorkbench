import * as React from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import type { AgentExpertGroupInfo } from '@proma/shared'
import { toast } from 'sonner'
import { RefreshCw } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { agentExpertGroupsAtom, createExpertSessionAtom, loadAgentExpertGroupsAtom } from '@/atoms/agent-atoms'
import { useOpenSession } from '@/hooks/useOpenSession'
import {
  followedExpertGroupsAtom,
  recentExpertGroupsAtom,
  recordRecentExpertGroupAtom,
} from '@/experts/atoms/expert-follow'
import { loadRemoteExpertDataAtom, expertCategoriesAtom } from '@/experts/atoms/expert-remote'
import { ExpertSearchBar } from '@/experts/shared/ExpertSearchBar'
import { ExpertFilterPills, type FilterTag } from '@/experts/shared/ExpertFilterPills'
import { ExpertCategoryFilter } from '@/experts/shared/ExpertCategoryFilter'
import { ExpertCardGrid } from '@/experts/shared/ExpertCardGrid'
import { ExpertEmptyState } from '@/experts/shared/ExpertEmptyState'
import { ExpertImportButton } from '@/experts/shared/ExpertImportDropdown'
import { ExpertFeaturedScenes } from '@/experts/shared/ExpertFeaturedScenes'
import { filterByTag, searchByName } from '@/experts/utils/filter'
import { cn } from '@/lib/utils'

interface ExpertPageViewProps {
  embedded?: boolean
}

export function ExpertPageView({ embedded = false }: ExpertPageViewProps): React.ReactElement {
  const allGroups = useAtomValue(agentExpertGroupsAtom)
  const loadGroups = useSetAtom(loadAgentExpertGroupsAtom)
  const loadRemote = useSetAtom(loadRemoteExpertDataAtom)
  const createExpertSession = useSetAtom(createExpertSessionAtom)
  const openSession = useOpenSession()
  const followed = useAtomValue(followedExpertGroupsAtom)
  const recent = useAtomValue(recentExpertGroupsAtom)
  const recordRecent = useSetAtom(recordRecentExpertGroupAtom)

  const [query, setQuery] = React.useState('')
  const [filterTag, setFilterTag] = React.useState<FilterTag>('all')
  const [category, setCategory] = React.useState('all')
  const [sceneFilter, setSceneFilter] = React.useState<Set<string> | null>(null)
  const [activeSceneId, setActiveSceneId] = React.useState<string | null>(null)
  const [refreshing, setRefreshing] = React.useState(false)

  const categories = useAtomValue(expertCategoriesAtom)

  // 首次加载
  React.useEffect(() => {
    if (allGroups.length === 0) {
      void loadGroups()
    }
    void loadRemote()
  }, [allGroups.length, loadGroups, loadRemote])

  const handleRefresh = React.useCallback(async () => {
    setRefreshing(true)
    try {
      await Promise.all([loadGroups(), loadRemote()])
      toast.success('专家团列表已刷新')
    } catch (err) {
      console.error('[专家团] 刷新失败:', err)
      toast.error('刷新失败')
    } finally {
      setRefreshing(false)
    }
  }, [loadGroups, loadRemote])

  // 数据管道：筛选 → 分类 → 场景 → 搜索
  const displayGroups = React.useMemo(() => {
    let result = allGroups
    result = filterByTag(result, filterTag, followed, recent)
    if (category !== 'all') {
      result = result.filter(g => g.categories?.includes(category))
    }
    if (sceneFilter) {
      result = result.filter(g => sceneFilter.has(g.id))
    }
    result = searchByName(result, query)
    return result
  }, [allGroups, filterTag, category, query, followed, recent, sceneFilter])

  const handleSummon = React.useCallback(async (group: AgentExpertGroupInfo) => {
    // 远程专家团需先下载
    if (group.sourcePluginKind === 'remote' && group.status !== 'available') {
      if (group.status === 'remote_downloading') {
        toast('正在下载中，请稍候')
        return
      }
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
      }
      return
    }

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
  }, [createExpertSession, openSession, recordRecent, loadGroups])

  const emptyType: 'followed' | 'recent' | 'search' | 'all' = React.useMemo(() => {
    if (filterTag === 'followed') return 'followed'
    if (filterTag === 'recent') return 'recent'
    if (query.trim() || sceneFilter || category !== 'all') return 'search'
    return 'all'
  }, [filterTag, query, sceneFilter, category])

  return (
    <div className="flex h-full flex-col bg-background">
      {/* 顶部控制栏 */}
      <div className={cn('flex-shrink-0 titlebar-no-drag', embedded ? 'pt-4 pb-4' : 'border-b px-6 pt-10 pb-4')}>
        <div className={cn(embedded && 'mx-auto w-full max-w-6xl px-8')}>
          <div className="flex items-center justify-between gap-4">
            {!embedded && <h2 className="text-lg font-semibold">专家/专家团</h2>}
            <div className="flex items-center gap-3">
              <ExpertSearchBar value={query} onChange={setQuery} />
              <ExpertImportButton />
              <Button variant="outline" size="sm" className="h-9" onClick={handleRefresh} disabled={refreshing} title="刷新专家团列表">
                <RefreshCw className={`size-4 ${refreshing ? 'animate-spin' : ''}`} />
                <span className="ml-1.5">{refreshing ? '刷新中' : '刷新'}</span>
              </Button>
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
                not_downloaded: allGroups.filter((g) => g.sourcePluginKind === 'remote' && g.status !== 'available').length,
              }}
            />
          </div>

          {/* 分类筛选 */}
          {categories.length > 0 && (
            <div className="mt-2">
              <ExpertCategoryFilter
                categories={categories}
                value={category}
                onChange={setCategory}
              />
            </div>
          )}
        </div>
      </div>

      {/* 内容区 */}
      <ScrollArea className="flex-1">
        <div className={cn(embedded ? 'mx-auto w-full max-w-6xl px-8 pb-10' : 'p-6')}>
          {/* 精选场景 */}
          {filterTag === 'all' && !query.trim() && displayGroups.length > 0 && (
            <div className="mb-8">
              <ExpertFeaturedScenes
                allGroups={allGroups}
                activeScene={activeSceneId}
                onSceneClick={(sceneId, ids) => {
                  setActiveSceneId(sceneId)
                  setSceneFilter(ids ? new Set(ids) : null)
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
                onClear={() => { setQuery(''); setFilterTag('all'); setCategory('all'); setSceneFilter(null); setActiveSceneId(null) }}
              />
            }
          />
        </div>
      </ScrollArea>
    </div>
  )
}
