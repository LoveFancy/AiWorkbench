import * as React from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Download, RefreshCw, Sparkles, X } from 'lucide-react'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { SkillMarketItem } from './skill-market-types'

interface SkillMarketDetailSheetProps {
  skill: SkillMarketItem | null
  content: string | null
  loadingContent: boolean
  installing: boolean
  onOpenChange: (open: boolean) => void
  onInstall: (skill: SkillMarketItem) => void
}

export function SkillMarketDetailSheet({
  skill,
  content,
  loadingContent,
  installing,
  onOpenChange,
  onInstall,
}: SkillMarketDetailSheetProps): React.ReactElement {
  return (
    <Sheet open={!!skill} onOpenChange={onOpenChange}>
      <SheetContent hideClose side="right" className="flex w-[560px] flex-col gap-0 overflow-hidden p-0 sm:max-w-[560px]" aria-describedby={undefined}>
        <SheetTitle className="sr-only">技能市场详情</SheetTitle>
        {skill && (
          <>
            <div className="shrink-0 border-b border-border/60 px-5 py-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
                    <Sparkles size={20} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <h3 className="truncate text-lg font-semibold text-foreground">{skill.displayName || skill.name}</h3>
                      {skill.version && (
                        <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                          v{skill.version}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{skill.description || '暂无描述'}</p>
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="size-8 shrink-0" onClick={() => onOpenChange(false)}>
                  <X size={16} />
                </Button>
              </div>
              <div className="mt-4 flex items-center gap-2">
                <Button
                  size="sm"
                  disabled={installing || skill.installed}
                  onClick={() => onInstall(skill)}
                >
                  {installing ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}
                  {skill.installed ? '已安装' : installing ? '安装中' : '安装'}
                </Button>
                {skill.category && <span className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">{skill.category}</span>}
                {skill.author && <span className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">{skill.author}</span>}
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {loadingContent ? (
                <div className="py-12 text-center text-sm text-muted-foreground">加载中...</div>
              ) : (
                <div className={cn('prose prose-sm max-w-none dark:prose-invert')}>
                  <Markdown remarkPlugins={[remarkGfm]}>
                    {content || skill.description || '暂无详情'}
                  </Markdown>
                </div>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
