import * as React from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { toast } from 'sonner'
import { RefreshCw } from 'lucide-react'
import { isExpertGroupFaulted } from '@proma/shared'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { agentExpertGroupsAtom, loadAgentExpertGroupsAtom } from '@/atoms/agent-atoms'
import {
  followedExpertGroupsAtom,
  recentExpertGroupsAtom,
} from '@/experts/atoms/expert-follow'
import { useSummonExpert } from '@/experts/hooks/useSummonExpert'
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
  query?: string
  filterTag?: FilterTag
  onFilterTagChange?: (tag: FilterTag) => void
  category?: string
  onCategoryChange?: (category: string) => void
}

export function ExpertPageView({ embedded = false, query: externalQuery, filterTag: externalFilterTag, onFilterTagChange, category: externalCategory, onCategoryChange }: ExpertPageViewProps): React.ReactElement {
  const allGroups = useAtomValue(agentExpertGroupsAtom)
  const loadGroups = useSetAtom(loadAgentExpertGroupsAtom)
  const loadRemote = useSetAtom(loadRemoteExpertDataAtom)
  const { summon } = useSummonExpert()
  const followed = useAtomValue(followedExpertGroupsAtom)
  const recent = useAtomValue(recentExpertGroupsAtom)

  const [query, setQuery] = React.useState('')
  const [internalFilterTag, setInternalFilterTag] = React.useState<FilterTag>('all')
  const [internalCategory, setInternalCategory] = React.useState('all')
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
  const activeQuery = embedded ? (externalQuery ?? '') : query
  const filterTag = externalFilterTag ?? internalFilterTag
  const setFilterTag = onFilterTagChange ?? setInternalFilterTag
  const category = externalCategory ?? internalCategory
  const setCategory = onCategoryChange ?? setInternalCategory

  const displayGroups = React.useMemo(() => {
    let result = allGroups
    result = filterByTag(result, filterTag, followed, recent)
    if (category !== 'all') {
      result = result.filter(g => g.categories?.includes(category))
    }
    if (sceneFilter) {
      result = result.filter(g => sceneFilter.has(g.id))
    }
    result = searchByName(result, activeQuery)
    return result
  }, [allGroups, filterTag, category, activeQuery, followed, recent, sceneFilter])

  const emptyType: 'followed' | 'recent' | 'search' | 'all' = React.useMemo(() => {
    if (filterTag === 'followed') return 'followed'
    if (filterTag === 'recent') return 'recent'
    if (activeQuery.trim() || sceneFilter || category !== 'all') return 'search'
    return 'all'
  }, [filterTag, activeQuery, sceneFilter, category])

  return (
    <div className="flex h-full flex-col bg-background">
      {/* 顶部控制栏 */}
      <div className={cn('flex-shrink-0 titlebar-no-drag', embedded ? 'pt-4 pb-4' : 'border-b px-6 pt-10 pb-4')}>
        <div className={cn(embedded && 'mx-auto w-full max-w-6xl px-8')}>
          {!embedded && (
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-lg font-semibold">专家/专家团</h2>
              <div className="flex items-center gap-2">
                <ExpertSearchBar value={query} onChange={setQuery} />
                <ExpertImportButton />
                <Button variant="outline" size="sm" className="h-9" onClick={handleRefresh} disabled={refreshing} title="刷新专家团列表">
                  <RefreshCw className={`size-4 ${refreshing ? 'animate-spin' : ''}`} />
                  <span className="ml-1.5">{refreshing ? '刷新中' : '刷新'}</span>
                </Button>
              </div>
            </div>
          )}

          {!embedded && (
            <div className="mt-3">
              <ExpertFilterPills
                value={filterTag}
                onChange={setFilterTag}
                counts={{
                  followed: Object.keys(followed).length,
                  expert: allGroups.filter((g) => g.expertType !== 'team').length,
                  team: allGroups.filter((g) => g.expertType === 'team' || (g.subagents && g.subagents.length > 0)).length,
                  not_downloaded: allGroups.filter((g) => g.sourcePluginKind === 'remote' && g.status !== 'available').length,
                  unavailable: allGroups.filter((g) => isExpertGroupFaulted(g.status)).length,
                }}
              />
            </div>
          )}

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
          {filterTag === 'all' && !activeQuery.trim() && displayGroups.length > 0 && (
            <ExpertFeaturedScenes
              allGroups={allGroups}
              activeScene={activeSceneId}
              onSceneClick={(sceneId, ids) => {
                setActiveSceneId(sceneId)
                setSceneFilter(ids ? new Set(ids) : null)
              }}
            />
          )}

          {/* 卡片网格 */}
          <ExpertCardGrid
            groups={displayGroups}
            onSummon={(group, samplePrompt) => void summon(group, samplePrompt)}
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
