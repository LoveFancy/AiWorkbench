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
      className="group relative flex h-full min-h-[158px] cursor-pointer flex-col gap-3 rounded-xl border border-border/60 bg-content-area p-4 text-left transition-all hover:border-border hover:shadow-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      <div className="flex items-start gap-3">
        <div className="shrink-0 rounded-xl bg-amber-500/12 p-2 text-amber-500 shadow-sm">
          <Sparkles size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-medium text-foreground">{skill.displayName || skill.name}</span>
            {skill.version && (
              <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                v{skill.version}
              </span>
            )}
          </div>
          <div className="mt-0.5 truncate text-xs text-muted-foreground">{skill.name}</div>
        </div>
      </div>

      <p className="line-clamp-2 min-h-[40px] text-[13px] leading-6 text-muted-foreground">
        {skill.description || '暂无描述'}
      </p>

      <div className="mt-auto flex items-center gap-2">
        {skill.category && (
          <span className="truncate rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
            {skill.category}
          </span>
        )}
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onInstall()
          }}
          disabled={installing || skill.installed}
          className={cn(
            'ml-auto flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground transition-colors',
            skill.installed
              ? 'cursor-default opacity-45'
              : 'hover:bg-primary hover:text-primary-foreground',
          )}
          title={skill.installed ? '已安装' : '安装'}
        >
          <Plus size={15} className={cn(installing && 'animate-spin')} />
        </button>
      </div>
    </div>
  )
}
