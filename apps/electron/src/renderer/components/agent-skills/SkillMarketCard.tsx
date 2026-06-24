import * as React from 'react'
import { Loader2, Lock, Plus, ShieldCheck, Sparkles } from 'lucide-react'
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
      className="group relative flex h-full cursor-pointer flex-col gap-3 rounded-xl border border-border/60 bg-content-area p-4 text-left transition-all hover:border-border hover:shadow-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
        <span className="flex items-center gap-1 rounded-md bg-blue-500/10 px-1.5 py-0.5 text-[11px] font-medium text-blue-600 dark:text-blue-400">
          <ShieldCheck size={12} /> 华泰 SkillHub
        </span>
        {skill.category && <span className="truncate rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">{skill.category}</span>}
        {skill.installed ? (
          <span className="ml-auto shrink-0 flex items-center rounded-md h-7 px-2 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 text-xs font-medium">
            已安装
          </span>
        ) : skill.canDownload === false ? (
          <span
            className="ml-auto shrink-0 flex items-center gap-1 rounded-md h-7 px-2 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs font-medium"
            title="该 Skill 需要审批授权后才能下载"
          >
            <Lock size={11} />
            需授权
          </span>
        ) : (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onInstall()
            }}
            disabled={installing}
            className="ml-auto flex shrink-0 items-center justify-center size-7 rounded-md bg-muted text-muted-foreground hover:bg-primary hover:text-primary-foreground transition-colors disabled:cursor-not-allowed"
            title="安装"
          >
            {installing ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
          </button>
        )}
      </div>
    </div>
  )
}
