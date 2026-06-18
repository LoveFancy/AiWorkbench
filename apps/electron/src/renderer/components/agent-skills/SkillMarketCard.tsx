import * as React from 'react'
import { Plus, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SkillMarketItem } from './skill-market-types'

interface SkillMarketCardProps {
  skill: SkillMarketItem
  installing: boolean
  onOpen: () => void
  onInstall: () => void
}

export function SkillMarketCard({ skill, installing, onOpen, onInstall }: SkillMarketCardProps): React.ReactElement {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen()
        }
      }}
      className="group flex min-h-[86px] cursor-pointer items-center gap-3 rounded-lg border border-border/55 bg-content-area px-4 py-3 text-left transition-all hover:border-border hover:bg-foreground/[0.02] hover:shadow-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
        <Sparkles size={17} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-semibold text-foreground">{skill.displayName || skill.name}</span>
          {skill.version && (
            <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              v{skill.version}
            </span>
          )}
        </div>
        <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{skill.description || '暂无描述'}</p>
      </div>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          onInstall()
        }}
        disabled={installing || skill.installed}
        className={cn(
          'flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground transition-colors',
          skill.installed
            ? 'cursor-default opacity-45'
            : 'hover:bg-primary hover:text-primary-foreground',
        )}
        title={skill.installed ? '已安装' : '安装'}
      >
        <Plus size={15} className={cn(installing && 'animate-spin')} />
      </button>
    </div>
  )
}
