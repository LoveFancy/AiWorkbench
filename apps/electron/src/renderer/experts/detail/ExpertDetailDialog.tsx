import * as React from 'react'
import type { AgentExpertGroupInfo } from '@proma/shared'
import { isExpertGroupFaulted, EXPERT_GROUP_STATUS_REASONS } from '@proma/shared'
import { ArrowLeft, Bot, Plug, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { ExpertStatusBadge } from '@/experts/card/ExpertStatusBadge'
import { getExpertSubagentLabel } from '@/experts/card/subagents'
import { isCardSummonActionable } from '@/experts/utils/summon'

interface ExpertDetailDialogProps {
  group: AgentExpertGroupInfo | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSummon?: (group: AgentExpertGroupInfo) => void
}

export function ExpertDetailDialog({ group, open, onOpenChange, onSummon }: ExpertDetailDialogProps): React.ReactElement {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent hideClose side="right" className="flex w-full sm:w-[46vw] sm:min-w-[520px] sm:max-w-[760px] flex-col gap-0 overflow-hidden p-0" aria-describedby={undefined}>
        {group && (
          <div className="flex h-full min-h-0 flex-col">
            <div className="shrink-0 border-b border-border/60 px-5 pb-4 pt-5">
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="icon" className="h-8 w-8" type="button" onClick={() => onOpenChange(false)}>
                  <ArrowLeft size={18} />
                </Button>
                <SheetTitle className="text-lg font-medium text-foreground">专家详情</SheetTitle>
                <div className="ml-auto flex shrink-0 items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>关闭</Button>
                  {onSummon && (
                    <Button
                      size="sm"
                      disabled={group.status !== 'available' && group.status !== 'remote_not_downloaded' && group.status !== 'remote_downloading'}
                      onClick={() => onSummon(group)}
                    >
                      {group.sourcePluginKind === 'remote' && group.status !== 'available'
                        ? group.status === 'remote_downloading' ? '下载中...' : '下载并召唤'
                        : `召唤${group.name}`}
                    </Button>
                  )}
                </div>
              </div>

              <div className="mt-4 flex items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground/70 shadow-sm">
                  <Sparkles size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-base font-semibold text-foreground">{group.name}</h3>
                  <SheetDescription className="mt-1 truncate">
                    主角色：{group.mainRole.name} · 来源：{group.sourceLabel} · 版本：{group.sourcePluginVersion}
                  </SheetDescription>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <ExpertStatusBadge status={group.status} />
                    <Badge variant="outline">{group.sourcePluginKind === 'builtin' ? '内置' : '用户插件'}</Badge>
                    <Badge variant="outline">v{group.sourcePluginVersion}</Badge>
                    {(group.tags ?? []).map((tag) => <Badge key={tag} variant="secondary">{tag}</Badge>)}
                  </div>
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
              <div className="space-y-6 p-5">
              {group.description && (
                <section>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">能力介绍</h4>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{group.description}</p>
                </section>
              )}

              <section>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">专家成员</h4>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge variant="outline">{group.mainRole.name}</Badge>
                  {(group.subagents ?? []).map((agent) => (
                    <Badge key={agent} variant="outline" title={`调用名: ${agent}`}>
                      <Bot size={12} className="mr-1" />
                      {getExpertSubagentLabel(group, agent)}
                    </Badge>
                  ))}
                </div>
              </section>

              <section>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">依赖能力</h4>
                <div className="mt-2 space-y-2 text-sm text-muted-foreground">
                  <div>Skills: {(group.skills ?? []).join('、') || '无'}</div>
                  <div className="flex items-center gap-1"><Plug size={14} />MCP: {(group.mcpServers ?? []).join('、') || '无'}</div>
                </div>
              </section>

              {(group.samplePrompts ?? []).length > 0 && (
                <section>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">试试这样问</h4>
                  <div className="mt-2 space-y-2">
                    {group.samplePrompts?.map((prompt) => (
                      <div key={prompt} className="rounded-md bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
                        {prompt}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {(group.issues.length > 0 || isExpertGroupFaulted(group.status)) && (
                <section>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-destructive">配置问题</h4>
                  <div className="mt-2 space-y-2">
                    {group.issues.length > 0
                      ? group.issues.map((issue, index) => (
                          <div key={`${issue.message}-${index}`} className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                            {issue.message}
                          </div>
                        ))
                      : (
                          <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                            {EXPERT_GROUP_STATUS_REASONS[group.status] ?? '当前专家团不可用'}
                          </div>
                        )}
                  </div>
                </section>
              )}
              </div>
            </div>

          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
