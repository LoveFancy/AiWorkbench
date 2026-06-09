import * as React from 'react'
import { Loader2, Search, Sparkles, Upload } from 'lucide-react'
import type { AgentExpertGroupInfo } from '@proma/shared'
import { useAtomValue, useSetAtom } from 'jotai'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  agentExpertGroupsAtom,
  createExpertSessionAtom,
  loadAgentExpertGroupsAtom,
} from '@/atoms/agent-atoms'
import { settingsOpenAtom } from '@/atoms/settings-tab'
import { ExpertGroupCard } from '@/components/expert-groups/ExpertGroupCard'
import { ExpertGroupDetailDialog } from '@/components/expert-groups/ExpertGroupDetailDialog'
import { getExpertGroupSearchTerms } from '@/components/expert-groups/expert-group-subagents'
import { useOpenSession } from '@/hooks/useOpenSession'

function matchesGroup(group: AgentExpertGroupInfo, query: string): boolean {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return true
  return getExpertGroupSearchTerms(group).some((item) => item.toLowerCase().includes(normalized))
}

interface GroupSectionProps {
  title: string
  groups: AgentExpertGroupInfo[]
  onOpen: (group: AgentExpertGroupInfo) => void
  onSummon: (group: AgentExpertGroupInfo) => void
}

function GroupSection({ title, groups, onOpen, onSummon }: GroupSectionProps): React.ReactElement | null {
  if (groups.length === 0) return null
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">{title}</h3>
        <span className="text-xs text-muted-foreground">{groups.length}</span>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {groups.map((group) => (
          <ExpertGroupCard
            key={`${group.sourcePluginId}:${group.id}`}
            group={group}
            onOpen={onOpen}
            onSummon={onSummon}
          />
        ))}
      </div>
    </section>
  )
}

export function ExpertGroupSettings(): React.ReactElement {
  const groups = useAtomValue(agentExpertGroupsAtom)
  const loadGroups = useSetAtom(loadAgentExpertGroupsAtom)
  const createExpertSession = useSetAtom(createExpertSessionAtom)
  const setSettingsOpen = useSetAtom(settingsOpenAtom)
  const openSession = useOpenSession()
  const [query, setQuery] = React.useState('')
  const [selected, setSelected] = React.useState<AgentExpertGroupInfo | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [uploadingExpertGroupZip, setUploadingExpertGroupZip] = React.useState(false)

  const refresh = React.useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      await loadGroups()
    } finally {
      setLoading(false)
    }
  }, [loadGroups])

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  const handleSummon = React.useCallback(async (group: AgentExpertGroupInfo): Promise<void> => {
    if (group.status !== 'available') return
    const session = await createExpertSession(group)
    openSession('agent', session.id, session.title)
    setSettingsOpen(false)
    toast.success(`已召唤${group.name}`)
    setSelected(null)
  }, [createExpertSession, openSession, setSettingsOpen])

  const handleInstallExpertGroupZip = React.useCallback(async (): Promise<void> => {
    if (uploadingExpertGroupZip) return
    setUploadingExpertGroupZip(true)
    try {
      const installed = await window.electronAPI.installAgentPluginZip()
      if (!installed) return
      await loadGroups()
      const hasExpertGroup = installed.capabilities.some((capability) => capability.type === 'expert-group')
      if (hasExpertGroup) {
        toast.success(`专家团插件已安装: ${installed.name}`)
      } else {
        toast.warning(`插件已安装，但未发现专家团: ${installed.name}`)
      }
    } catch (error) {
      toast.error('安装专家团失败', { description: error instanceof Error ? error.message : '未知错误' })
    } finally {
      setUploadingExpertGroupZip(false)
    }
  }, [loadGroups, uploadingExpertGroupZip])

  const visible = React.useMemo(
    () => groups.filter((group) => matchesGroup(group, query)),
    [groups, query],
  )
  const builtin = visible.filter((group) => group.sourcePluginKind === 'builtin' && group.status === 'available')
  const user = visible.filter((group) => group.sourcePluginKind === 'user' && group.status === 'available')
  const issues = visible.filter((group) => group.status !== 'available')

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">专家团</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            查看内置和插件提供的专家团，诊断依赖状态，并创建专家会话。
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void handleInstallExpertGroupZip()} disabled={uploadingExpertGroupZip}>
            {uploadingExpertGroupZip ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Upload size={14} className="mr-1" />}
            {uploadingExpertGroupZip ? '安装中' : '上传专家团 Zip'}
          </Button>
          <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
            刷新
          </Button>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索专家团、角色或描述"
          className="pl-9"
        />
      </div>

      {visible.length === 0 ? (
        <div className="rounded-lg bg-card p-8 text-center shadow-sm">
          <Sparkles className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">暂无匹配的专家团</p>
        </div>
      ) : (
        <div className="space-y-6">
          <GroupSection title="内置专家团" groups={builtin} onOpen={setSelected} onSummon={(group) => void handleSummon(group)} />
          <GroupSection title="插件专家团" groups={user} onOpen={setSelected} onSummon={(group) => void handleSummon(group)} />
          <GroupSection title="异常" groups={issues} onOpen={setSelected} onSummon={(group) => void handleSummon(group)} />
        </div>
      )}

      <ExpertGroupDetailDialog
        group={selected}
        open={selected !== null}
        onOpenChange={(open) => { if (!open) setSelected(null) }}
        onSummon={(group) => void handleSummon(group)}
      />
    </div>
  )
}
