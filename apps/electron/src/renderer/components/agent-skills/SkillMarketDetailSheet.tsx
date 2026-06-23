import * as React from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ArrowLeft, Download, RefreshCw, Sparkles } from 'lucide-react'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { SettingsCard } from '@/components/settings/primitives'
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
  const displayTitle = skill?.displayName || skill?.name || ''
  const shouldRenderContent = Boolean(content && content.trim() && content.trim() !== skill?.description?.trim())
  const metadataRows = skill ? buildMetadataRows(skill) : []

  return (
    <Sheet open={!!skill} onOpenChange={onOpenChange}>
      <SheetContent hideClose side="right" className="flex w-full sm:w-[46vw] sm:min-w-[520px] sm:max-w-[760px] flex-col gap-0 overflow-hidden p-0" aria-describedby={undefined}>
        <SheetTitle className="sr-only">技能市场详情</SheetTitle>
        {skill && (
          <>
            <div className="shrink-0 border-b border-border/60 px-5 pb-4 pt-5">
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="icon" className="h-8 w-8" type="button" onClick={() => onOpenChange(false)}>
                  <ArrowLeft size={18} />
                </Button>
                <h3 className="text-lg font-medium text-foreground">Skill 详情</h3>
              </div>

              <div className="mt-4 flex items-start gap-3">
                <div className="shrink-0 rounded-xl bg-amber-500/12 p-2 text-amber-500 shadow-sm">
                  <Sparkles size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <h3 className="truncate text-base font-semibold text-foreground">{displayTitle}</h3>
                    {skill.version && (
                      <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                        v{skill.version}
                      </span>
                    )}
                    {skill.installed && (
                      <span className="shrink-0 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-300">
                        已安装
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">{skill.name}</div>
                </div>
              </div>

              <div className="mt-3 flex items-center gap-2">
                <div className="mr-auto flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{skill.installed ? '已安装到当前工作区' : '可从技能市场安装'}</span>
                </div>
                <Button
                  size="sm"
                  disabled={installing || skill.installed}
                  onClick={() => onInstall(skill)}
                >
                  {installing ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}
                  {skill.installed ? '已安装' : installing ? '安装中' : '安装'}
                </Button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
              <div className="flex flex-col gap-4 p-5">
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">元数据</h4>
                  <SettingsCard divided>
                    {metadataRows.map((row) => (
                      <MetaRow key={row.label} label={row.label} value={row.value} />
                    ))}
                    {skill.tags && skill.tags.length > 0 && (
                      <div className="flex items-start gap-4 px-4 py-2.5">
                        <span className="w-16 shrink-0 pt-0.5 text-xs text-muted-foreground">标签</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap gap-1.5">
                            {skill.tags.slice(0, 8).map((tag) => (
                              <span key={tag} className="rounded-md border border-border/60 bg-background px-2 py-0.5 text-[11px] text-muted-foreground">
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </SettingsCard>
                </div>

                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">说明</h4>
                  <div className="font-mono text-xs text-muted-foreground">SKILL.md</div>
                  <SettingsCard divided={false}>
                    <div className="p-4">
                      {loadingContent ? (
                        <div className="py-12 text-center text-sm text-muted-foreground">加载中...</div>
                      ) : !shouldRenderContent ? (
                        <div className="rounded-lg border border-dashed border-border/70 bg-content-area px-4 py-8 text-center text-sm text-muted-foreground">
                          暂无更多详情
                        </div>
                      ) : (
                        <div className={cn(
                          'prose prose-sm max-w-none dark:prose-invert',
                          'prose-p:my-2 prose-p:leading-7 prose-li:leading-7 prose-headings:mt-3 prose-headings:mb-2 prose-pre:my-2',
                          '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
                        )}>
                          <Markdown remarkPlugins={[remarkGfm]}>
                            {content}
                          </Markdown>
                        </div>
                      )}
                    </div>
                  </SettingsCard>
                </div>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

function buildMetadataRows(skill: SkillMarketItem): Array<{ label: string; value: string }> {
  const rows = [
    { label: '名称', value: skill.displayName || skill.name },
    { label: '描述', value: skill.description || '暂无描述' },
    { label: '数据源', value: '华泰 SkillHub' },
    { label: '位置', value: `skills/${skill.name}` },
  ]

  if (skill.category) rows.push({ label: '分类', value: skill.category })
  if (skill.author) rows.push({ label: '维护者', value: skill.author })
  if (skill.version) rows.push({ label: '版本', value: `v${skill.version}` })
  if (typeof skill.downloadCount === 'number') rows.push({ label: '安装次数', value: `${skill.downloadCount}` })

  return rows
}

function MetaRow({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="flex items-start gap-4 px-4 py-2.5">
      <span className="w-16 shrink-0 pt-0.5 text-xs text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 break-words text-sm text-foreground">{value}</span>
    </div>
  )
}
