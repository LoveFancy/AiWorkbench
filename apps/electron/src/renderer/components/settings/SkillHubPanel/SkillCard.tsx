import React from 'react'
import { Sparkles, Download, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import type { HtSkillHubSkill } from '@proma/shared'

interface SkillCardProps {
  skill: HtSkillHubSkill
  selected: boolean
  /** 当前筛选模式 */
  filter: 'all' | 'installed' | 'uninstalled'
  /** 批量勾选状态（仅 uninstalled 模式） */
  batchChecked?: boolean
  /** 批量勾选切换回调 */
  onToggleBatch?: () => void
  installing: boolean
  onSelect: () => void
  onInstall: () => void
  onUninstall: () => void
  onToggle: () => void
  onUpdate: () => void
  hasUpdate?: boolean
}

/**
 * Skill 卡片组件
 * - all（全部）               → 无操作按钮，仅预览
 * - uninstalled（未安装）       → 复选框 + hover [安装]
 * - installed（已安装）         → 状态标签 + 点击查看详情（操作在右侧面板）
 */
export function SkillCard({
  skill, selected, filter, batchChecked, onToggleBatch, installing, onSelect, onInstall, onUpdate, hasUpdate,
}: SkillCardProps): React.ReactElement {
  const isEnabled = skill.enabled !== false
  const showButtons = filter !== 'all'
  const showBatch = filter === 'uninstalled'

  const onCardClick = () => {
    onSelect()
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onCardClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onCardClick() }}
      className={cn(
        'w-full px-3 py-3 text-left border-b border-border/60 hover:bg-muted/40 transition-colors group',
        selected && 'bg-accent text-accent-foreground',
      )}
    >
      <div className="flex items-center gap-2">
        {showBatch && (
          <span onClick={(e) => { e.stopPropagation(); onToggleBatch?.() }} className={cn(
            'shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center text-[10px] cursor-pointer',
            batchChecked ? 'bg-primary border-primary text-primary-foreground' : 'border-muted-foreground/40 bg-transparent',
          )}>
            {batchChecked && '✓'}
          </span>
        )}
        <Sparkles size={14} className="text-amber-500 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{skill.name}</span>
        {filter === 'installed' && hasUpdate ? (
          <span
            className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium bg-amber-500/10 text-amber-600 cursor-pointer hover:bg-amber-500/20"
            onClick={(e) => { e.stopPropagation(); onUpdate() }}
            title="点击更新"
          >
            有更新
          </span>
        ) : (
          <span className={cn(
            'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium',
            skill.installed
              ? isEnabled
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'bg-amber-500/10 text-amber-600'
              : 'bg-muted text-muted-foreground',
          )}>
            {skill.installed
              ? (!isEnabled ? '已禁用' : '已安装')
              : '未安装'}
          </span>
        )}
      </div>
      <div className="mt-1 line-clamp-2 text-xs text-muted-foreground min-h-[2rem]">
        {skill.description || '暂无描述'}
      </div>
      <div className="mt-0.5 text-[11px] text-muted-foreground/70 font-mono min-h-[1rem]">
        {skill.version ? `v${skill.version}` : ''}
      </div>

      {/* 操作按钮 — uninstalled 模式下 hover 显示安装按钮；installed 模式不需要（右侧详情已提供） */}
      {showButtons && !showBatch && filter === 'uninstalled' && (
      <div className="mt-1.5 flex items-center gap-1 invisible group-hover:visible">
        <Button size="sm" variant="outline" className="h-6 text-[10px] px-1.5" onClick={(e) => { e.stopPropagation(); onInstall() }}>
          <Download size={10} />
          <span className="ml-0.5">安装</span>
        </Button>
      </div>
      )}
    </div>
  )
}
