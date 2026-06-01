import * as React from 'react'
import { RefreshCw, Trash2, Download, FolderPlus, Search, Settings2 } from 'lucide-react'
import type {
  AgentPluginInfo,
  AgentPluginMarketplace,
  AgentPluginMarketplacePlugin,
  AgentPluginMarketplaceType,
  AgentPluginCapability,
} from '@proma/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

type PluginSettingsTab = 'installed' | 'discover' | 'capabilities' | 'marketplaces' | 'errors'

function capabilityLabel(type: AgentPluginCapability['type']): string {
  switch (type) {
    case 'skill':
      return 'Skill'
    case 'command':
      return 'Command'
    case 'agent':
      return 'Agent'
    case 'mcp':
      return 'MCP'
  }
}

function parseEnvText(text: string): Record<string, string> {
  const env: Record<string, string> = {}
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const index = line.indexOf('=')
    if (index <= 0) throw new Error(`环境变量格式错误: ${rawLine}`)
    const key = line.slice(0, index).trim()
    const value = line.slice(index + 1).trim()
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) throw new Error(`环境变量名非法: ${key}`)
    env[key] = value
  }
  return env
}

function formatEnvText(env?: Record<string, string>): string {
  return Object.entries(env ?? {})
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')
}

export function PluginSettings(): React.ReactElement {
  const [activeTab, setActiveTab] = React.useState<PluginSettingsTab>('installed')
  const [plugins, setPlugins] = React.useState<AgentPluginInfo[]>([])
  const [marketplaces, setMarketplaces] = React.useState<AgentPluginMarketplace[]>([])
  const [discover, setDiscover] = React.useState<AgentPluginMarketplacePlugin[]>([])
  const [loading, setLoading] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const [editingMcp, setEditingMcp] = React.useState<AgentPluginCapability | null>(null)
  const [mcpEnvText, setMcpEnvText] = React.useState('')
  const [marketForm, setMarketForm] = React.useState({
    id: '',
    name: '',
    source: '',
    type: 'local' as AgentPluginMarketplaceType,
  })

  const capabilities = React.useMemo(() => {
    const items = plugins.flatMap((plugin) => plugin.capabilities)
    const conflictMap = new Map<string, string[]>()
    for (const capability of items.filter((item) => item.enabled && ['command', 'agent', 'mcp'].includes(item.type))) {
      const key = `${capability.type}:${capability.name}`
      conflictMap.set(key, [...(conflictMap.get(key) ?? []), capability.sourcePluginId])
    }
    return items.map((capability) => {
      const key = `${capability.type}:${capability.name}`
      const conflicts = (conflictMap.get(key) ?? []).filter((pluginId) => pluginId !== capability.sourcePluginId)
      return conflicts.length > 0
        ? { ...capability, conflict: true, conflictWith: conflicts }
        : capability
    })
  }, [plugins])
  const errors = React.useMemo(
    () => [
      ...plugins.flatMap((plugin) => plugin.issues.map((issue) => ({ plugin, issue }))),
      ...capabilities
        .filter((capability) => capability.conflict)
        .map((capability) => ({
          plugin: plugins.find((plugin) => plugin.id === capability.sourcePluginId) ?? plugins[0],
          issue: {
            level: 'warning' as const,
            message: `${capabilityLabel(capability.type)} ${capability.name} 与 ${capability.conflictWith?.join(', ')} 冲突`,
          },
        }))
        .filter((item): item is { plugin: AgentPluginInfo; issue: { level: 'warning'; message: string } } => Boolean(item.plugin)),
    ],
    [capabilities, plugins],
  )

  const loadAll = React.useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      const [nextPlugins, nextMarketplaces, nextDiscover] = await Promise.all([
        window.electronAPI.listAgentPlugins(),
        window.electronAPI.listAgentPluginMarketplaces(),
        window.electronAPI.searchAgentPluginMarketplace(query),
      ])
      setPlugins(nextPlugins)
      setMarketplaces(nextMarketplaces)
      setDiscover(nextDiscover)
    } catch (error) {
      toast.error('加载插件信息失败', { description: error instanceof Error ? error.message : '未知错误' })
    } finally {
      setLoading(false)
    }
  }, [query])

  React.useEffect(() => {
    void loadAll()
  }, [loadAll])

  const handleTogglePlugin = async (plugin: AgentPluginInfo, enabled: boolean): Promise<void> => {
    await window.electronAPI.setAgentPluginEnabled(plugin.id, enabled)
    await loadAll()
  }

  const handleUninstall = async (plugin: AgentPluginInfo): Promise<void> => {
    try {
      await window.electronAPI.uninstallAgentPlugin(plugin.id)
      toast.success('插件已卸载')
      await loadAll()
    } catch (error) {
      toast.error('卸载插件失败', { description: error instanceof Error ? error.message : '未知错误' })
    }
  }

  const handleAddMarketplace = async (): Promise<void> => {
    try {
      await window.electronAPI.addAgentPluginMarketplace(marketForm)
      await window.electronAPI.refreshAgentPluginMarketplace(marketForm.id)
      setMarketForm({ id: '', name: '', source: '', type: 'local' })
      toast.success('插件市场已添加')
      await loadAll()
    } catch (error) {
      toast.error('添加插件市场失败', { description: error instanceof Error ? error.message : '未知错误' })
    }
  }

  const handleRefreshMarketplace = async (id: string): Promise<void> => {
    try {
      await window.electronAPI.refreshAgentPluginMarketplace(id)
      toast.success('插件市场已刷新')
      await loadAll()
    } catch (error) {
      toast.error('刷新插件市场失败', { description: error instanceof Error ? error.message : '未知错误' })
    }
  }

  const handleRemoveMarketplace = async (id: string): Promise<void> => {
    try {
      await window.electronAPI.removeAgentPluginMarketplace(id)
      toast.success('插件市场已删除')
      await loadAll()
    } catch (error) {
      toast.error('删除插件市场失败', { description: error instanceof Error ? error.message : '未知错误' })
    }
  }

  const handleToggleMarketplace = async (marketplace: AgentPluginMarketplace, enabled: boolean): Promise<void> => {
    try {
      await window.electronAPI.updateAgentPluginMarketplace(marketplace.id, { enabled })
      await loadAll()
    } catch (error) {
      toast.error('更新插件市场失败', { description: error instanceof Error ? error.message : '未知错误' })
    }
  }

  const handleInstall = async (plugin: AgentPluginMarketplacePlugin): Promise<void> => {
    try {
      await window.electronAPI.installAgentMarketplacePlugin({
        marketplaceId: plugin.marketplaceId,
        pluginName: plugin.name,
        enable: true,
        overwrite: plugin.installed,
      })
      toast.success(plugin.installed ? '插件已更新' : '插件已安装')
      await loadAll()
    } catch (error) {
      toast.error('安装插件失败', { description: error instanceof Error ? error.message : '未知错误' })
    }
  }

  const openMcpEditor = (capability: AgentPluginCapability): void => {
    setEditingMcp(capability)
    setMcpEnvText(formatEnvText(capability.configuredEnv))
  }

  const handleSaveMcpEnv = async (): Promise<void> => {
    if (!editingMcp?.mcpServerId) return
    try {
      await window.electronAPI.configureAgentPluginMcpEnv(editingMcp.mcpServerId, parseEnvText(mcpEnvText))
      toast.success('插件 MCP 环境变量已保存')
      setEditingMcp(null)
      await loadAll()
    } catch (error) {
      toast.error('保存 MCP 环境变量失败', { description: error instanceof Error ? error.message : '未知错误' })
    }
  }

  const handleTestMcp = async (capability: AgentPluginCapability): Promise<void> => {
    if (!capability.mcpServerId) return
    try {
      const result = await window.electronAPI.testAgentPluginMcp(capability.mcpServerId)
      if (result.success) {
        toast.success('插件 MCP 检查通过', { description: result.message })
      } else {
        toast.error('插件 MCP 检查失败', { description: result.message })
      }
      await loadAll()
    } catch (error) {
      toast.error('测试插件 MCP 失败', { description: error instanceof Error ? error.message : '未知错误' })
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">插件管理</h2>
        <p className="mt-1 text-sm text-muted-foreground">管理全局插件、插件市场和 Agent 最终可用能力。</p>
      </div>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as PluginSettingsTab)}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="installed">已安装</TabsTrigger>
          <TabsTrigger value="discover">发现</TabsTrigger>
          <TabsTrigger value="capabilities">能力</TabsTrigger>
          <TabsTrigger value="marketplaces">市场</TabsTrigger>
          <TabsTrigger value="errors">错误</TabsTrigger>
        </TabsList>

        <TabsContent value="installed" className="space-y-3">
          {plugins.map((plugin) => (
            <div key={plugin.id} className="rounded-lg bg-card p-4 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium">{plugin.name}</h3>
                    <Badge variant={plugin.kind === 'builtin' ? 'secondary' : 'outline'}>{plugin.kind === 'builtin' ? '内置' : '用户'}</Badge>
                    <span className="text-xs text-muted-foreground">{plugin.version}</span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{plugin.description ?? '暂无描述'}</p>
                  <p className="mt-2 truncate text-xs text-muted-foreground">{plugin.path}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={plugin.enabled} onCheckedChange={(checked) => void handleTogglePlugin(plugin, checked)} />
                  {plugin.kind === 'user' && (
                    <Button variant="ghost" size="icon" onClick={() => void handleUninstall(plugin)} title="卸载插件">
                      <Trash2 size={16} />
                    </Button>
                  )}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {plugin.capabilities.map((capability) => (
                  <Badge key={`${capability.type}:${capability.name}`} variant="outline">
                    {capabilityLabel(capability.type)} · {capability.name}
                  </Badge>
                ))}
              </div>
            </div>
          ))}
          {!loading && plugins.length === 0 && <EmptyState text="暂无已安装插件" />}
        </TabsContent>

        <TabsContent value="discover" className="space-y-3">
          <div className="flex gap-2">
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索插件" />
            <Button onClick={() => void loadAll()}>
              <Search size={16} className="mr-2" />
              搜索
            </Button>
          </div>
          {discover.map((plugin) => (
            <div key={`${plugin.marketplaceId}:${plugin.name}`} className="flex items-center justify-between rounded-lg bg-card p-4 shadow-sm">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-medium">{plugin.name}</h3>
                  <Badge variant="secondary">{plugin.marketplaceName}</Badge>
                  {plugin.version && <span className="text-xs text-muted-foreground">{plugin.version}</span>}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{plugin.description ?? '暂无描述'}</p>
              </div>
              <Button onClick={() => void handleInstall(plugin)}>
                <Download size={16} className="mr-2" />
                {plugin.installed ? '更新' : '安装'}
              </Button>
            </div>
          ))}
          {!loading && discover.length === 0 && <EmptyState text="暂无可安装插件，请先添加并刷新插件市场" />}
        </TabsContent>

        <TabsContent value="capabilities" className="space-y-2">
          {capabilities.map((capability) => (
            <div key={`${capability.sourcePluginId}:${capability.type}:${capability.name}`} className="flex items-center justify-between rounded-md bg-card px-3 py-2 shadow-sm">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{capabilityLabel(capability.type)}</Badge>
                  <span className="font-medium">{capability.name}</span>
                  {capability.lastTestSuccess != null && (
                    <Badge variant={capability.lastTestSuccess ? 'secondary' : 'destructive'}>
                      {capability.lastTestSuccess ? '检查通过' : '检查失败'}
                    </Badge>
                  )}
                  {capability.conflict && <Badge variant="destructive">冲突</Badge>}
                </div>
                {capability.lastTestMessage && <p className="mt-1 text-xs text-muted-foreground">{capability.lastTestMessage}</p>}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{capability.sourcePluginId}</span>
                {capability.type === 'mcp' && capability.mcpServerId && (
                  <>
                    <Button variant="outline" size="sm" onClick={() => openMcpEditor(capability)}>
                      <Settings2 size={14} className="mr-1" />
                      配置
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => void handleTestMcp(capability)}>
                      测试
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
          {!loading && capabilities.length === 0 && <EmptyState text="暂无插件能力" />}
        </TabsContent>

        <TabsContent value="marketplaces" className="space-y-3">
          <div className="grid grid-cols-[120px_1fr_110px_1.5fr_auto] gap-2">
            <Input value={marketForm.id} onChange={(event) => setMarketForm((prev) => ({ ...prev, id: event.target.value }))} placeholder="ID" />
            <Input value={marketForm.name} onChange={(event) => setMarketForm((prev) => ({ ...prev, name: event.target.value }))} placeholder="名称" />
            <Select value={marketForm.type} onValueChange={(value) => setMarketForm((prev) => ({ ...prev, type: value as AgentPluginMarketplaceType }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="local">本地</SelectItem>
                <SelectItem value="raw">Raw URL</SelectItem>
                <SelectItem value="github">GitHub</SelectItem>
              </SelectContent>
            </Select>
            <Input value={marketForm.source} onChange={(event) => setMarketForm((prev) => ({ ...prev, source: event.target.value }))} placeholder="marketplace.json 路径或 URL" />
            <Button onClick={() => void handleAddMarketplace()}>
              <FolderPlus size={16} className="mr-2" />
              添加
            </Button>
          </div>
          {marketplaces.map((marketplace) => (
            <div key={marketplace.id} className="flex items-center justify-between rounded-lg bg-card p-4 shadow-sm">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium">{marketplace.name}</h3>
                  <Badge variant={marketplace.enabled ? 'secondary' : 'outline'}>{marketplace.type}</Badge>
                  {!marketplace.enabled && <Badge variant="outline">已禁用</Badge>}
                </div>
                <p className="mt-1 truncate text-sm text-muted-foreground">{marketplace.source}</p>
                {marketplace.lastError && <p className="mt-1 text-xs text-destructive">{marketplace.lastError}</p>}
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={marketplace.enabled} onCheckedChange={(checked) => void handleToggleMarketplace(marketplace, checked)} />
                <Button variant="outline" onClick={() => void handleRefreshMarketplace(marketplace.id)}>
                  <RefreshCw size={16} className={cn('mr-2', loading && 'animate-spin')} />
                  刷新
                </Button>
                <Button variant="ghost" size="icon" onClick={() => void handleRemoveMarketplace(marketplace.id)} title="删除市场">
                  <Trash2 size={16} />
                </Button>
              </div>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="errors" className="space-y-2">
          {errors.map(({ plugin, issue }, index) => (
            <div key={`${plugin.id}:${index}`} className="rounded-md bg-card px-3 py-2 shadow-sm">
              <div className="text-sm font-medium">{plugin.name}</div>
              <div className="text-sm text-destructive">{issue.message}</div>
            </div>
          ))}
          {!loading && errors.length === 0 && <EmptyState text="暂无插件错误" />}
        </TabsContent>
      </Tabs>

      <Dialog open={editingMcp !== null} onOpenChange={(open) => { if (!open) setEditingMcp(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>配置插件 MCP</DialogTitle>
            <DialogDescription>
              {editingMcp?.mcpServerId ?? '插件 MCP'} 的环境变量会保存到 Proma 配置，不写入插件目录。
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={mcpEnvText}
            onChange={(event) => setMcpEnvText(event.target.value)}
            placeholder={'TOKEN=...\nBASE_URL=https://...'}
            className="min-h-40 font-mono text-xs"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingMcp(null)}>取消</Button>
            <Button onClick={() => void handleSaveMcpEnv()}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function EmptyState({ text }: { text: string }): React.ReactElement {
  return (
    <div className="rounded-lg bg-muted/40 px-4 py-8 text-center text-sm text-muted-foreground">
      {text}
    </div>
  )
}
