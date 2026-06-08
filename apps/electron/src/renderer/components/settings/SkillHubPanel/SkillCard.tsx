import React from 'react'
import { Sparkles, Download, RefreshCw, Trash2, Play, Pause, ArrowUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import type { HtSkillHubSkill } from '@proma/shared'

interface SkillCardProps {
  skill: HtSkillHubSkill
  selected: boolean
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
 *
 * 根据安装状态显示不同的操作按钮：
 * 未安装 → [预览] [安装]
 * 已启用 → [预览] [卸载] [禁用]
 * 已禁用 → [预览] [卸载] [启用]
 * 有更新 → [预览] [更新] [卸载]
 */
export function SkillCard({
  skill, selected, installing, onSelect, onInstall, onUninstall, onToggle, onUpdate, hasUpdate,
}: SkillCardProps): React.ReactElement {
  const isInstalling = installing
  const isEnabled = skill.enabled !== false

  const handleInstall = (e: React.MouseEvent) => {
    e.stopPropagation()
    onInstall()
  }

  const handleUninstall = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (window.confirm(`确定要卸载 Skill「${skill.name}」？`)) {
      onUninstall()
    }
  }

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    onToggle()
  }

  const handleUpdate = (e: React.MouseEvent) => {
    e.stopPropagation()
    onUpdate()
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full px-3 py-3 text-left border-b border-border/60 hover:bg-muted/40 transition-colors group',
        selected && 'bg-accent text-accent-foreground',
      )}
    >
      <div className="flex items-center gap-2">
        <Sparkles size={14} className="text-amber-500 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{skill.name}</span>
        <span className={cn(
          'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium',
          skill.installed
            ? isEnabled && !hasUpdate
              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              : 'bg-amber-500/10 text-amber-600'
            : 'bg-muted text-muted-foreground',
        )}>
          {skill.installed
            ? (!isEnabled ? '已禁用' : hasUpdate ? '有更新' : '已安装')
            : '未安装'}
        </span>
      </div>
      <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
        {skill.description || '暂无描述'}
      </div>

      {/* 操作按钮（hover 时显示） */}
      <div className="mt-1.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {!skill.installed ? (
          <Button
            size="sm" variant="outline"
            className="h-6 text-[10px] px-1.5"
            onClick={handleInstall}
            disabled={isInstalling}
          >
            {isInstalling ? <RefreshCw size={10} className="animate-spin" /> : <Download size={10} />}
            <span className="ml-0.5">安装</span>
          </Button>
        ) : hasUpdate ? (
          <Button size="sm" variant="outline" className="h-6 text-[10px] px-1.5" onClick={handleUpdate}>
            <ArrowUp size={10} />
            <span className="ml-0.5">更新</span>
          </Button>
        ) : null}

        {skill.installed && (
          <>
            <Button
              size="sm" variant="outline" className="h-6 text-[10px] px-1.5"
              onClick={handleToggle}
            >
              {isEnabled ? <Pause size={10} /> : <Play size={10} />}
              <span className="ml-0.5">{isEnabled ? '禁用' : '启用'}</span>
            </Button>
            <Button
              size="sm" variant="outline"
              className="h-6 text-[10px] px-1.5 text-red-600 hover:text-red-700"
              onClick={handleUninstall}
            >
              <Trash2 size={10} />
              <span className="ml-0.5">卸载</span>
            </Button>
          </>
        )}
      </div>
    </button>
  )
}

/**
 * 批量操作栏
 */
export function BatchToolbar({
  selectedCount, total, onBatchInstall, onBatchUninstall, onSelectAll,
}: {
  selectedCount: number; total: number
  onBatchInstall: () => void
  onBatchUninstall: () => void
  onSelectAll: () => void
}): React.ReactElement {
  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-background/70 text-xs">
      <button
        type="button"
        onClick={onSelectAll}
        className="text-muted-foreground hover:text-foreground"
      >
        ☐ 全选 ({selectedCount}/{total})
      </button>
      <div className="flex-1" />
      <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={onBatchInstall} disabled={selectedCount === 0}>
        <Download size={10} />
        <span className="ml-0.5">批量安装</span>
      </Button>
      <Button size="sm" variant="outline" className="h-6 text-[10px] text-red-600" onClick={onBatchUninstall} disabled={selectedCount === 0}>
        <Trash2 size={10} />
        <span className="ml-0.5">批量卸载</span>
      </Button>
    </div>
  )
}
