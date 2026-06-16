import * as React from 'react'
import type { AgentExpertGroupInfo } from '@proma/shared'
import { Bot, Plug, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ExpertStatusBadge } from '@/experts/card/ExpertStatusBadge'
import { getExpertSubagentLabel } from '@/experts/card/subagents'

interface ExpertDetailDialogProps {
  group: AgentExpertGroupInfo | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSummon?: (group: AgentExpertGroupInfo) => void
}

export function ExpertDetailDialog({ group, open, onOpenChange, onSummon }: ExpertDetailDialogProps): React.ReactElement {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        {group && (
          <>
            <DialogHeader>
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <Sparkles size={24} />
                </div>
                <div className="min-w-0 flex-1">
                  <DialogTitle className="text-xl">{group.name}</DialogTitle>
                  <DialogDescription className="mt-2">
                    主角色：{group.mainRole.name} · 来源：{group.sourceLabel} · 版本：{group.sourcePluginVersion}
                  </DialogDescription>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <ExpertStatusBadge status={group.status} />
                    <Badge variant="outline">{group.sourcePluginKind === 'builtin' ? '内置' : '用户插件'}</Badge>
                    <Badge variant="outline">v{group.sourcePluginVersion}</Badge>
                    {(group.tags ?? []).map((tag) => <Badge key={tag} variant="secondary">{tag}</Badge>)}
                  </div>
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-5 py-2">
              {group.description && (
                <section>
                  <h4 className="text-sm font-medium">能力介绍</h4>
                  <p className="mt-2 text-sm text-muted-foreground">{group.description}</p>
                </section>
              )}

              <section>
                <h4 className="text-sm font-medium">专家成员</h4>
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
                <h4 className="text-sm font-medium">依赖能力</h4>
                <div className="mt-2 space-y-2 text-sm text-muted-foreground">
                  <div>Skills: {(group.skills ?? []).join('、') || '无'}</div>
                  <div className="flex items-center gap-1"><Plug size={14} />MCP: {(group.mcpServers ?? []).join('、') || '无'}</div>
                </div>
              </section>

              {(group.samplePrompts ?? []).length > 0 && (
                <section>
                  <h4 className="text-sm font-medium">试试这样问</h4>
                  <div className="mt-2 space-y-2">
                    {group.samplePrompts?.map((prompt) => (
                      <div key={prompt} className="rounded-md bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
                        {prompt}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {group.issues.length > 0 && (
                <section>
                  <h4 className="text-sm font-medium text-destructive">配置问题</h4>
                  <div className="mt-2 space-y-2">
                    {group.issues.map((issue, index) => (
                      <div key={`${issue.message}-${index}`} className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                        {issue.message}
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>关闭</Button>
              {onSummon && (
                <Button disabled={group.status !== 'available'} onClick={() => onSummon(group)}>
                  召唤{group.name}
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
