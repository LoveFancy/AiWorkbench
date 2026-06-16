import * as React from 'react'
import { Sparkles } from 'lucide-react'

interface ExpertEmptyStateProps {
  type: 'followed' | 'recent' | 'search' | 'all'
  onClear?: () => void
}

const EMPTY_CONFIG: Record<string, { icon: typeof Sparkles; title: string; description: string }> = {
  followed: {
    icon: Sparkles,
    title: '还没有收藏任何专家团',
    description: '点击卡片右上角的 ☆ 即可收藏常用专家',
  },
  recent: {
    icon: Sparkles,
    title: '还没有使用过任何专家团',
    description: '点击卡片上的"召唤"按钮开始使用',
  },
  search: {
    icon: Sparkles,
    title: '没有找到匹配的专家团',
    description: '试试调整搜索词或切换筛选条件',
  },
  all: {
    icon: Sparkles,
    title: '暂无专家团',
    description: '点击右上角"导入 WorkMate 专家团"安装插件',
  },
}

function getEmptyConfig(type: string): { icon: typeof Sparkles; title: string; description: string } {
  return (EMPTY_CONFIG[type] ?? EMPTY_CONFIG.all)!
}

export function ExpertEmptyState({ type, onClear }: ExpertEmptyStateProps): React.ReactElement {
  const config = getEmptyConfig(type)
  const Icon = config.icon
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Icon className="size-12 text-muted-foreground/40" />
      <h3 className="mt-4 text-lg font-medium">{config.title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{config.description}</p>
      {type === 'search' && onClear && (
        <button onClick={onClear} className="mt-4 text-sm text-primary hover:underline">
          清除筛选
        </button>
      )}
    </div>
  )
}
