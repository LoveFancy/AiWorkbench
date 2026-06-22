import * as React from 'react'
import type { AgentExpertGroupInfo, FeaturedScene } from '@proma/shared'
import { useAtomValue } from 'jotai'
import { featuredScenesAtom } from '@/experts/atoms/expert-remote'
import { cn } from '@/lib/utils'

interface ExpertFeaturedScenesProps {
  allGroups: AgentExpertGroupInfo[]
  activeScene: string | null
  onSceneClick: (sceneId: string | null, expertGroupIds: string[] | null) => void
}

export function ExpertFeaturedScenes({ allGroups, activeScene, onSceneClick }: ExpertFeaturedScenesProps): React.ReactElement {
  const scenes = useAtomValue(featuredScenesAtom)

  if (scenes.length === 0) return <></>

  const allGroupIds = new Set(allGroups.map(g => g.id))

  return (
    <div className="mb-8 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">精选场景</h3>
        {activeScene && (
          <button
            className="text-xs text-primary hover:underline"
            onClick={() => onSceneClick(null, null)}
          >
            清除筛选
          </button>
        )}
      </div>
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
        {scenes.map((scene: FeaturedScene) => {
          const count = allGroupIds.size > 0
            ? scene.expertGroupIds.filter(id => allGroupIds.has(id)).length
            : scene.expertGroupIds.length
          const isActive = activeScene === scene.id
          if (count === 0) {
            return (
              <div
                key={scene.id}
                className="rounded-lg border border-dashed bg-muted/30 px-4 py-3 text-center opacity-50"
              >
                <div className="text-sm font-medium text-muted-foreground">{scene.name}</div>
                <div className="mt-1 text-xs text-muted-foreground">暂无专家</div>
              </div>
            )
          }
          return (
            <button
              key={scene.id}
              className={cn(
                'rounded-lg border px-4 py-3 text-left shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5',
                isActive
                  ? 'border-primary bg-primary/10 ring-1 ring-primary'
                  : 'bg-card',
              )}
              onClick={() => onSceneClick(isActive ? null : scene.id, isActive ? null : scene.expertGroupIds)}
            >
              <div className={cn('text-sm font-medium', isActive && 'text-primary')}>{scene.name}</div>
              <div className="mt-1 text-xs text-muted-foreground">{count} 位专家</div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
