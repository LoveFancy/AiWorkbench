import * as React from 'react'
import { RefreshCw, Search, Sparkles } from 'lucide-react'
import type { AgentExpertGroupInfo } from '@proma/shared'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ExpertGroupCard } from '@/components/expert-groups/ExpertGroupCard'
import { ExpertGroupDetailDialog } from '@/components/expert-groups/ExpertGroupDetailDialog'

interface ExpertGroupPickerProps {
  open: boolean
  groups: AgentExpertGroupInfo[]
  loading: boolean
  onOpenChange: (open: boolean) => void
  onRefresh: () => void
  onSummon: (group: AgentExpertGroupInfo) => void
}

function matchesGroup(group: AgentExpertGroupInfo, query: string): boolean {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return true

  return [
    group.name,
    group.description,
    group.mainRole.name,
    group.sourceLabel,
    ...(group.tags ?? []),
    ...(group.subagents ?? []),
    ...(group.skills ?? []),
  ].filter((item): item is string => typeof item === 'string')
    .some((item) => item.toLowerCase().includes(normalized))
}

export function ExpertGroupPicker({
  open,
  groups,
  loading,
  onOpenChange,
  onRefresh,
  onSummon,
}: ExpertGroupPickerProps): React.ReactElement {
  const [query, setQuery] = React.useState('')
  const [selected, setSelected] = React.useState<AgentExpertGroupInfo | null>(null)

  React.useEffect(() => {
    if (!open) {
      setQuery('')
      setSelected(null)
    }
  }, [open])

  const visibleGroups = React.useMemo(
    () => groups.filter((group) => matchesGroup(group, query)),
    [groups, query],
  )

  const availableGroups = visibleGroups.filter((group) => group.status === 'available')
  const issueGroups = visibleGroups.filter((group) => group.status !== 'available')

  const handleSummon = React.useCallback((group: AgentExpertGroupInfo): void => {
    setSelected(null)
    onSummon(group)
  }, [onSummon])

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl gap-4 p-0">
          <DialogHeader className="px-5 pt-5">
            <div className="flex items-start justify-between gap-3 pr-8">
              <div>
                <DialogTitle className="flex items-center gap-2">
                  <Sparkles className="size-5 text-primary" />
                  召唤专家
                </DialogTitle>
                <DialogDescription className="mt-2">
                  选择专家团后会创建一个新的 Agent 会话，并绑定对应的主角色、SubAgents 和插件能力。
                </DialogDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onRefresh}
                disabled={loading}
              >
                <RefreshCw className={loading ? 'mr-1.5 size-3.5 animate-spin' : 'mr-1.5 size-3.5'} />
                刷新
              </Button>
            </div>
          </DialogHeader>

          <div className="px-5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索专家团、角色、技能"
                className="pl-9"
              />
            </div>
          </div>

          <ScrollArea className="max-h-[560px] px-5 pb-5">
            {visibleGroups.length === 0 ? (
              <div className="rounded-lg bg-muted/50 px-4 py-10 text-center">
                <Sparkles className="mx-auto size-8 text-muted-foreground" />
                <p className="mt-3 text-sm text-muted-foreground">暂无匹配的专家团</p>
              </div>
            ) : (
              <div className="space-y-5">
                {availableGroups.length > 0 && (
                  <section className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-medium">可召唤</h3>
                      <span className="text-xs text-muted-foreground">{availableGroups.length}</span>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      {availableGroups.map((group) => (
                        <ExpertGroupCard
                          key={`${group.sourcePluginId}:${group.id}`}
                          group={group}
                          compact
                          onOpen={setSelected}
                          onSummon={handleSummon}
                        />
                      ))}
                    </div>
                  </section>
                )}

                {issueGroups.length > 0 && (
                  <section className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-medium">不可召唤</h3>
                      <span className="text-xs text-muted-foreground">{issueGroups.length}</span>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      {issueGroups.map((group) => (
                        <ExpertGroupCard
                          key={`${group.sourcePluginId}:${group.id}`}
                          group={group}
                          compact
                          onOpen={setSelected}
                          onSummon={handleSummon}
                        />
                      ))}
                    </div>
                  </section>
                )}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <ExpertGroupDetailDialog
        group={selected}
        open={selected !== null}
        onOpenChange={(nextOpen) => { if (!nextOpen) setSelected(null) }}
        onSummon={handleSummon}
      />
    </>
  )
}
