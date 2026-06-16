import * as React from 'react'
import type { AgentExpertGroupInfo } from '@proma/shared'
import { countByScene } from '@/experts/utils/filter'
import { cn } from '@/lib/utils'

interface SceneCategory {
  id: string
  name: string
  filterTags: string[]
}

const SCENE_CATEGORIES: SceneCategory[] = [
  { id: 'content', name: '内容创作', filterTags: ['写作', '文案', '翻译'] },
  { id: 'office', name: '办公场景', filterTags: ['文档', '邮件', '日程'] },
  { id: 'legal', name: '法律咨询', filterTags: ['法律', '合同', '合规'] },
  { id: 'research', name: '科研学术', filterTags: ['研究', '论文', '数据分析'] },
  { id: 'uiux', name: 'UI/UX', filterTags: ['设计', '前端', '交互'] },
  { id: 'data', name: '数据分析', filterTags: ['数据', '可视化', '统计'] },
  { id: 'devops', name: 'DevOps', filterTags: ['部署', 'CI/CD', '运维'] },
  { id: 'edu', name: '教育培训', filterTags: ['教学', '课程', '培训'] },
]

interface ExpertFeaturedScenesProps {
  allGroups: AgentExpertGroupInfo[]
  activeScene: string | null
  onSceneClick: (sceneId: string | null, tags: string[] | null) => void
}

export function ExpertFeaturedScenes({ allGroups, activeScene, onSceneClick }: ExpertFeaturedScenesProps): React.ReactElement {
  return (
    <div className="space-y-3">
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
        {SCENE_CATEGORIES.map((scene) => {
          const count = countByScene(allGroups, scene.filterTags)
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
              onClick={() => onSceneClick(isActive ? null : scene.id, isActive ? null : scene.filterTags)}
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
