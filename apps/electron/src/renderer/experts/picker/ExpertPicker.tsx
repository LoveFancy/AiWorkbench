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
import { ExpertCard } from '@/experts/card/ExpertCard'
import { ExpertDetailDialog } from '@/experts/detail/ExpertDetailDialog'
import { getExpertGroupSearchTerms } from '@/experts/card/subagents'

interface ExpertPickerProps {
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
  return getExpertGroupSearchTerms(group).some((item) => item.toLowerCase().includes(normalized))
}

export function ExpertPicker({
  open,
  groups,
  loading,
  onOpenChange,
  onRefresh,
  onSummon,
}: ExpertPickerProps): React.ReactElement {
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

  // 可召唤：状态正常，或远程条目（支持下载后召唤）
  const availableGroups = visibleGroups.filter(
    (group) => group.status === 'available' || group.sourcePluginKind === 'remote'
  )
  const issueGroups = visibleGroups.filter(
    (group) => group.status !== 'available' && group.sourcePluginKind !== 'remote'
  )

  const handleSummon = React.useCallback((group: AgentExpertGroupInfo): void => {
    setSelected(null)
    onSummon(group)
  }, [onSummon])

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[min(92vw,760px)] max-w-3xl gap-3 p-0">
          <DialogHeader className="px-5 pt-5">
            <div className="flex items-start justify-between gap-3 pr-8">
              <div>
                <DialogTitle className="flex items-center gap-2">
                  <Sparkles className="size-5 text-primary" />
                  召唤专家
                </DialogTitle>
                <DialogDescription className="mt-2">
                  选择一个专家团，创建带专属主角色和协作能力的新 Agent 会话。
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
            <div className="relative max-w-xl">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索专家团、角色、技能"
                className="pl-9"
              />
            </div>
          </div>

          <ScrollArea className="max-h-[68vh] px-5 pb-5">
            {visibleGroups.length === 0 ? (
              <div className="rounded-lg bg-muted/50 px-4 py-10 text-center">
                <Sparkles className="mx-auto size-8 text-muted-foreground" />
                <p className="mt-3 text-sm text-muted-foreground">暂无匹配的专家团</p>
              </div>
            ) : (
              <div className="space-y-4">
                {availableGroups.length > 0 && (
                  <section className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-medium">可召唤</h3>
                      <span className="text-xs text-muted-foreground">{availableGroups.length}</span>
                    </div>
                    <div className="grid gap-2 md:grid-cols-2">
                      {availableGroups.map((group) => (
                        <ExpertCard
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
                  <section className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-medium">不可召唤</h3>
                      <span className="text-xs text-muted-foreground">{issueGroups.length}</span>
                    </div>
                    <div className="grid gap-2 md:grid-cols-2">
                      {issueGroups.map((group) => (
                        <ExpertCard
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

      <ExpertDetailDialog
        group={selected}
        open={selected !== null}
        onOpenChange={(nextOpen) => { if (!nextOpen) setSelected(null) }}
        onSummon={handleSummon}
      />
    </>
  )
}
