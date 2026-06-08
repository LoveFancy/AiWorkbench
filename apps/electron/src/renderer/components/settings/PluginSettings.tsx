import * as React from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Copy,
  Download,
  ExternalLink,
  FolderPlus,
  Info,
  List,
  Loader2,
  Package,
  RefreshCw,
  Search,
  Settings2,
  Trash2,
} from 'lucide-react'
import type {
  AgentPluginInfo,
  AgentPluginMarketplace,
  AgentPluginMarketplacePlugin,
  AgentPluginMarketplaceType,
  AgentPluginCapability,
  AgentPluginIssueLevel,
} from '@proma/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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

type PluginSettingsTab = 'discover' | 'installed' | 'marketplaces' | 'errors'

interface PluginErrorItem {
  id: string
  title: string
  message: string
  level: AgentPluginIssueLevel
}

interface PluginInstallTarget {
  marketplaceId: string
  pluginName: string
}

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
    case 'expert-group':
      return '专家团'
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

function formatDateTime(value?: string | null): string {
  if (!value) return '未刷新'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function summarizeCapabilities(plugin: AgentPluginInfo): string {
  const counts = plugin.capabilities.reduce<Record<AgentPluginCapability['type'], number>>(
    (acc, capability) => {
      acc[capability.type] += 1
      return acc
    },
    { skill: 0, command: 0, agent: 0, mcp: 0, 'expert-group': 0 },
  )
  return [
    counts.skill > 0 ? `${counts.skill} Skills` : null,
    counts.command > 0 ? `${counts.command} Commands` : null,
    counts.agent > 0 ? `${counts.agent} Agents` : null,
    counts.mcp > 0 ? `${counts.mcp} MCP` : null,
    counts['expert-group'] > 0 ? `${counts['expert-group']} 专家团` : null,
  ].filter(Boolean).join(' · ') || '暂无能力'
}

function groupCapabilities(capabilities: AgentPluginCapability[]): Record<AgentPluginCapability['type'], AgentPluginCapability[]> {
  return capabilities.reduce<Record<AgentPluginCapability['type'], AgentPluginCapability[]>>(
    (acc, capability) => {
      acc[capability.type].push(capability)
      return acc
    },
    { skill: [], command: [], agent: [], mcp: [], 'expert-group': [] },
  )
}

function getPluginInstallTarget(plugin: AgentPluginInfo): PluginInstallTarget | null {
  if (!plugin.id.startsWith('user:')) return null
  const raw = plugin.id.slice('user:'.length)
  const separator = raw.indexOf('/')
  if (separator <= 0 || separator === raw.length - 1) return null
  return {
    marketplaceId: raw.slice(0, separator),
    pluginName: raw.slice(separator + 1),
  }
}

function getMarketplacePluginOperationKey(target: PluginInstallTarget): string {
  return `${target.marketplaceId}:${target.pluginName}`
}

function getMarketplaceCatalogOperationKey(plugin: AgentPluginMarketplacePlugin): string {
  return getMarketplacePluginOperationKey({
    marketplaceId: plugin.marketplaceId,
    pluginName: plugin.name,
  })
}

function getPluginSourceLabel(plugin: AgentPluginInfo, marketplaces: AgentPluginMarketplace[]): string {
  if (plugin.kind === 'builtin') return 'builtin'
  if (!plugin.sourceMarketplaceId) return 'user'
  return marketplaces.find((marketplace) => marketplace.id === plugin.sourceMarketplaceId)?.name ?? plugin.sourceMarketplaceId
}

function matchesPlugin(plugin: AgentPluginInfo, query: string): boolean {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return true
  return [
    plugin.name,
    plugin.description,
    plugin.author,
    plugin.version,
    plugin.sourceMarketplaceId,
    ...plugin.keywords,
  ].filter(Boolean).join(' ').toLowerCase().includes(normalized)
}

interface InferredMarketplaceInput {
  id: string
  name: string
  source: string
  type: AgentPluginMarketplaceType
  branch?: string
}

function supportsMarketplaceBranch(type: AgentPluginMarketplaceType): boolean {
  return type === 'github' || type === 'gitee' || type === 'gitlab'
}

function slugFromMarketplaceSource(source: string): string {
  const trimmed = source.trim().replace(/\/$/, '')
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed)
      const last = url.pathname.split('/').filter(Boolean).at(-1) ?? 'marketplace'
      return last.replace(/\.git$/, '').replace(/\.json$/, '') || 'marketplace'
    } catch {
      // 继续走通用路径解析
    }
  }
  const gitSshMatch = trimmed.match(/[:/]([^/:]+\/[^/]+?)(?:\.git)?$/)
  if (gitSshMatch?.[1]) return gitSshMatch[1].split('/').at(-1)?.replace(/\.git$/, '') ?? 'marketplace'
  const last = trimmed.split(/[\\/]/).filter(Boolean).at(-1) ?? 'marketplace'
  return last.replace(/\.git$/, '').replace(/\.json$/, '') || 'marketplace'
}

function inferMarketplaceBranchFromSource(source: string, type: AgentPluginMarketplaceType): string | undefined {
  if (type !== 'github' && type !== 'gitee' && type !== 'gitlab') return undefined
  if (!/^https?:\/\//i.test(source)) return undefined

  try {
    const url = new URL(source)
    const segments = url.pathname.split('/').filter(Boolean)
    const treeIndex = type === 'gitlab'
      ? segments.findIndex((segment, index) => segment === 'tree' && segments[index - 1] === '-')
      : segments.indexOf('tree')
    const branch = treeIndex >= 0 ? segments[treeIndex + 1] : undefined
    return branch ? decodeURIComponent(branch) : undefined
  } catch {
    return undefined
  }
}

export function inferMarketplaceInput(sourceText: string): InferredMarketplaceInput {
  const rawSource = sourceText.trim()
  if (!rawSource) throw new Error('请输入插件市场地址或本地路径')

  let type: AgentPluginMarketplaceType = 'local'
  let source = rawSource
  if (/^git@github\.com:/i.test(source) || /^https?:\/\/github\.com\//i.test(source)) {
    type = 'github'
  } else if (/^git@gitee\.com:/i.test(source) || /^https?:\/\/gitee\.com\//i.test(source)) {
    type = 'gitee'
  } else if (/^git@[^:]*gitlab[^:]*:/i.test(source) || /^https?:\/\/[^/]*gitlab[^/]*\//i.test(source)) {
    type = 'gitlab'
  } else if (/^https?:\/\//i.test(source)) {
    type = 'raw'
  } else if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(source)) {
    type = 'github'
    source = `https://github.com/${source}`
  }

  const rawId = slugFromMarketplaceSource(source)
  const id = rawId.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'marketplace'
  const branch = inferMarketplaceBranchFromSource(source, type)
  return {
    id,
    name: id,
    source,
    type,
    ...(branch && { branch }),
  }
}

export function PluginSettings(): React.ReactElement {
  const [activeTab, setActiveTab] = React.useState<PluginSettingsTab>('installed')
  const [plugins, setPlugins] = React.useState<AgentPluginInfo[]>([])
  const [marketplaces, setMarketplaces] = React.useState<AgentPluginMarketplace[]>([])
  const [marketplaceCatalog, setMarketplaceCatalog] = React.useState<AgentPluginMarketplacePlugin[]>([])
  const [discover, setDiscover] = React.useState<AgentPluginMarketplacePlugin[]>([])
  const [loading, setLoading] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const [installedQuery, setInstalledQuery] = React.useState('')
  const [discoverMarketplaceId, setDiscoverMarketplaceId] = React.useState<string | null>(null)
  const [addMarketplaceOpen, setAddMarketplaceOpen] = React.useState(false)
  const [installedDetailPluginId, setInstalledDetailPluginId] = React.useState<string | null>(null)
  const [selectedMarketplaceId, setSelectedMarketplaceId] = React.useState<string | null>(null)
  const [editingMcp, setEditingMcp] = React.useState<AgentPluginCapability | null>(null)
  const [mcpEnvText, setMcpEnvText] = React.useState('')
  const [marketplaceSourceInput, setMarketplaceSourceInput] = React.useState('')
  const [marketplaceBranchInput, setMarketplaceBranchInput] = React.useState('main')
  const [pendingPluginOperations, setPendingPluginOperations] = React.useState<Set<string>>(new Set())

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
  const errors = React.useMemo<PluginErrorItem[]>(
    () => [
      ...plugins.flatMap((plugin) => plugin.issues.map((issue, index) => ({
        id: `${plugin.id}:issue:${index}`,
        title: plugin.name,
        message: issue.message,
        level: issue.level,
      }))),
      ...capabilities
        .filter((capability) => capability.conflict)
        .map((capability): PluginErrorItem | null => {
          const plugin = plugins.find((item) => item.id === capability.sourcePluginId)
          if (!plugin) return null
          return {
            id: `${capability.sourcePluginId}:${capability.type}:${capability.name}:conflict`,
            title: plugin.name,
            level: 'warning' as const,
            message: `${capabilityLabel(capability.type)} ${capability.name} 与 ${capability.conflictWith?.join(', ')} 冲突`,
          }
        })
        .filter((item): item is PluginErrorItem => Boolean(item)),
      ...marketplaces
        .filter((marketplace) => marketplace.lastError)
        .map((marketplace): PluginErrorItem => ({
          id: `marketplace:${marketplace.id}:last-error`,
          title: marketplace.name,
          level: 'error',
          message: marketplace.lastError ?? '',
        })),
    ],
    [capabilities, marketplaces, plugins],
  )
  const marketplacePlugins = React.useMemo(() => {
    const result = new Map<string, AgentPluginMarketplacePlugin[]>()
    for (const item of marketplaceCatalog) {
      result.set(item.marketplaceId, [...(result.get(item.marketplaceId) ?? []), item])
    }
    return result
  }, [marketplaceCatalog])
  const visibleDiscover = React.useMemo(
    () => {
      const source = discoverMarketplaceId ? marketplaceCatalog : discover
      return discoverMarketplaceId
        ? source.filter((item) => item.marketplaceId === discoverMarketplaceId)
        : source
    },
    [discover, discoverMarketplaceId, marketplaceCatalog],
  )
  const installedPluginsByMarketplace = React.useMemo(() => {
    const result = new Map<string, AgentPluginInfo[]>()
    for (const plugin of plugins.filter((item) => item.kind === 'user' && item.sourceMarketplaceId)) {
      const marketplaceId = plugin.sourceMarketplaceId
      if (!marketplaceId) continue
      result.set(marketplaceId, [...(result.get(marketplaceId) ?? []), plugin])
    }
    return result
  }, [plugins])
  const selectedMarketplace = React.useMemo(() => {
    if (selectedMarketplaceId) {
      return marketplaces.find((marketplace) => marketplace.id === selectedMarketplaceId) ?? null
    }
    return marketplaces[0] ?? null
  }, [marketplaces, selectedMarketplaceId])
  const inferredMarketplacePreview = React.useMemo(() => {
    try {
      return marketplaceSourceInput.trim() ? inferMarketplaceInput(marketplaceSourceInput) : null
    } catch {
      return null
    }
  }, [marketplaceSourceInput])
  const discoverMarketplace = React.useMemo(
    () => marketplaces.find((item) => item.id === discoverMarketplaceId) ?? null,
    [discoverMarketplaceId, marketplaces],
  )
  const filteredInstalledPlugins = React.useMemo(
    () => plugins.filter((plugin) => matchesPlugin(plugin, installedQuery)),
    [installedQuery, plugins],
  )
  const capabilitiesByPluginId = React.useMemo(() => {
    const result = new Map<string, AgentPluginCapability[]>()
    for (const capability of capabilities) {
      result.set(capability.sourcePluginId, [...(result.get(capability.sourcePluginId) ?? []), capability])
    }
    return result
  }, [capabilities])
  const capabilityIssueCountsByPluginId = React.useMemo(() => {
    const result = new Map<string, number>()
    for (const capability of capabilities.filter((item) => item.conflict || item.issue || item.lastTestSuccess === false)) {
      result.set(capability.sourcePluginId, (result.get(capability.sourcePluginId) ?? 0) + 1)
    }
    return result
  }, [capabilities])
  const installedDetailPlugin = React.useMemo(
    () => plugins.find((plugin) => plugin.id === installedDetailPluginId) ?? null,
    [installedDetailPluginId, plugins],
  )
  const installedDetailCapabilities = React.useMemo(
    () => installedDetailPlugin ? capabilitiesByPluginId.get(installedDetailPlugin.id) ?? installedDetailPlugin.capabilities : [],
    [capabilitiesByPluginId, installedDetailPlugin],
  )
  const installedDetailUpdatePending = React.useMemo(() => {
    if (!installedDetailPlugin) return false
    const target = getPluginInstallTarget(installedDetailPlugin)
    return target ? pendingPluginOperations.has(getMarketplacePluginOperationKey(target)) : false
  }, [installedDetailPlugin, pendingPluginOperations])
  const attentionPlugins = React.useMemo(
    () => filteredInstalledPlugins.filter((plugin) => plugin.issues.length > 0 || (capabilityIssueCountsByPluginId.get(plugin.id) ?? 0) > 0),
    [capabilityIssueCountsByPluginId, filteredInstalledPlugins],
  )
  const userPlugins = React.useMemo(
    () => filteredInstalledPlugins.filter((plugin) => plugin.kind === 'user' && !attentionPlugins.some((item) => item.id === plugin.id)),
    [attentionPlugins, filteredInstalledPlugins],
  )
  const builtinPlugins = React.useMemo(
    () => filteredInstalledPlugins.filter((plugin) => plugin.kind === 'builtin' && !attentionPlugins.some((item) => item.id === plugin.id)),
    [attentionPlugins, filteredInstalledPlugins],
  )

  const loadAll = React.useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      const [nextPlugins, nextMarketplaces, nextCatalog, nextDiscover] = await Promise.all([
        window.electronAPI.listAgentPlugins(),
        window.electronAPI.listAgentPluginMarketplaces(),
        window.electronAPI.searchAgentPluginMarketplace(''),
        window.electronAPI.searchAgentPluginMarketplace(query),
      ])
      setPlugins(nextPlugins)
      setMarketplaces(nextMarketplaces)
      setMarketplaceCatalog(nextCatalog)
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

  const setPluginOperationPending = React.useCallback((operationKey: string, isPending: boolean) => {
    setPendingPluginOperations((prev) => {
      const next = new Set(prev)
      if (isPending) {
        next.add(operationKey)
      } else {
        next.delete(operationKey)
      }
      return next
    })
  }, [])

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
      const inferred = inferMarketplaceInput(marketplaceSourceInput)
      const branch = marketplaceBranchInput.trim()
      await window.electronAPI.addAgentPluginMarketplace({
        ...inferred,
        ...(supportsMarketplaceBranch(inferred.type) && branch ? { branch } : {}),
      })
      await window.electronAPI.refreshAgentPluginMarketplace(inferred.id)
      setMarketplaceSourceInput('')
      setMarketplaceBranchInput('main')
      setAddMarketplaceOpen(false)
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

  const handleUpdateMarketplaceBranch = async (marketplace: AgentPluginMarketplace, branch: string): Promise<void> => {
    try {
      const trimmed = branch.trim()
      await window.electronAPI.updateAgentPluginMarketplace(marketplace.id, {
        branch: trimmed || undefined,
        lastError: undefined,
      })
      toast.success('插件市场分支已更新')
      await loadAll()
    } catch (error) {
      toast.error('更新插件市场分支失败', { description: error instanceof Error ? error.message : '未知错误' })
    }
  }

  const handleInstall = async (plugin: AgentPluginMarketplacePlugin): Promise<void> => {
    const operationKey = getMarketplaceCatalogOperationKey(plugin)
    if (pendingPluginOperations.has(operationKey)) return
    setPluginOperationPending(operationKey, true)
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
    } finally {
      setPluginOperationPending(operationKey, false)
    }
  }

  const handleUpdateInstalledPlugin = async (plugin: AgentPluginInfo): Promise<void> => {
    const target = getPluginInstallTarget(plugin)
    if (!target) {
      toast.error('该插件不支持从市场更新')
      return
    }
    const operationKey = getMarketplacePluginOperationKey(target)
    if (pendingPluginOperations.has(operationKey)) return
    setPluginOperationPending(operationKey, true)
    try {
      await window.electronAPI.installAgentMarketplacePlugin({
        marketplaceId: target.marketplaceId,
        pluginName: target.pluginName,
        enable: plugin.enabled,
        overwrite: true,
      })
      toast.success('插件已更新')
      await loadAll()
    } catch (error) {
      toast.error('更新插件失败', { description: error instanceof Error ? error.message : '未知错误' })
    } finally {
      setPluginOperationPending(operationKey, false)
    }
  }

  const handleBrowseMarketplace = (marketplace: AgentPluginMarketplace): void => {
    setQuery('')
    setDiscoverMarketplaceId(marketplace.id)
    setActiveTab('discover')
  }

  const openExternal = (url?: string): void => {
    if (!url) return
    void window.electronAPI.openExternal(url)
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
        <p className="mt-1 text-sm text-muted-foreground">发现、安装和管理 Agent 插件。</p>
      </div>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as PluginSettingsTab)}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="discover">Discover</TabsTrigger>
          <TabsTrigger value="installed">Installed</TabsTrigger>
          <TabsTrigger value="marketplaces">Marketplaces</TabsTrigger>
          <TabsTrigger value="errors">Errors{errors.length > 0 ? ` (${errors.length})` : ''}</TabsTrigger>
        </TabsList>

        <TabsContent value="discover" className="space-y-3">
          <div className="flex flex-col gap-2 md:flex-row">
            <div className="relative flex-1">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索插件" className="pl-9" />
            </div>
            <Button onClick={() => { setDiscoverMarketplaceId(null); void loadAll() }}>搜索</Button>
          </div>
          {discoverMarketplaceId && (
            <div className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2 text-sm">
              <span className="text-muted-foreground">
                当前仅显示 {discoverMarketplace?.name ?? discoverMarketplaceId} 的插件
              </span>
              <Button variant="ghost" size="sm" onClick={() => setDiscoverMarketplaceId(null)}>显示全部</Button>
            </div>
          )}
          <div className="space-y-2">
            {visibleDiscover.map((plugin) => {
              const operationKey = getMarketplaceCatalogOperationKey(plugin)
              const isPending = pendingPluginOperations.has(operationKey)
              const actionLabel = plugin.installed ? '更新' : '安装'
              return (
              <div key={`${plugin.marketplaceId}:${plugin.name}`} className="rounded-lg bg-card p-4 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-medium">{plugin.name}</h3>
                      <Badge variant="secondary">{plugin.marketplaceName}</Badge>
                      {plugin.version && <span className="text-xs text-muted-foreground">{plugin.version}</span>}
                      {plugin.installed && <Badge variant={plugin.enabled === false ? 'outline' : 'secondary'}>{plugin.enabled === false ? '已安装，未启用' : '已安装'}</Badge>}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{plugin.description ?? '暂无描述'}</p>
                  </div>
                  <Button disabled={isPending} onClick={() => void handleInstall(plugin)}>
                    {isPending ? (
                      <Loader2 size={16} className="mr-2 animate-spin" />
                    ) : (
                      <Download size={16} className="mr-2" />
                    )}
                    {isPending ? `${actionLabel}中` : actionLabel}
                  </Button>
                </div>
              </div>
              )
            })}
          </div>
          {!loading && visibleDiscover.length === 0 && <EmptyState text="暂无可安装 Claude Code 插件，请先添加并刷新 Claude Code 类型插件市场" />}
        </TabsContent>

        <TabsContent value="installed" className="space-y-3">
          {installedDetailPlugin ? (
            <InstalledPluginDetailPage
              plugin={installedDetailPlugin}
              capabilities={installedDetailCapabilities}
              marketplaceName={getPluginSourceLabel(installedDetailPlugin, marketplaces)}
              onBack={() => setInstalledDetailPluginId(null)}
              onToggle={handleTogglePlugin}
              onUninstall={handleUninstall}
              onUpdate={handleUpdateInstalledPlugin}
              updatePending={installedDetailUpdatePending}
              onOpenMcpEditor={openMcpEditor}
              onTestMcp={handleTestMcp}
              onOpenExternal={openExternal}
            />
          ) : (
            <div className="space-y-4">
              <div className="relative">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input value={installedQuery} onChange={(event) => setInstalledQuery(event.target.value)} placeholder="搜索已安装插件" className="pl-9" />
              </div>
              {attentionPlugins.length > 0 && (
                <PluginListSection
                  title="需要处理"
                  plugins={attentionPlugins}
                  marketplaces={marketplaces}
                  capabilityIssueCountsByPluginId={capabilityIssueCountsByPluginId}
                  onOpenDetails={setInstalledDetailPluginId}
                />
              )}
              <PluginListSection
                title="用户插件"
                plugins={userPlugins}
                marketplaces={marketplaces}
                capabilityIssueCountsByPluginId={capabilityIssueCountsByPluginId}
                onOpenDetails={setInstalledDetailPluginId}
              />
              <PluginListSection
                title="内置插件"
                plugins={builtinPlugins}
                marketplaces={marketplaces}
                capabilityIssueCountsByPluginId={capabilityIssueCountsByPluginId}
                onOpenDetails={setInstalledDetailPluginId}
              />
              {!loading && filteredInstalledPlugins.length === 0 && <EmptyState text="暂无已安装插件" />}
            </div>
          )}
        </TabsContent>

        <TabsContent value="marketplaces" className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-sm font-medium">插件市场</h3>
              <p className="mt-1 text-xs text-muted-foreground">当前仅支持 Claude Code 类型插件市场，来源可使用 GitHub、Gitee、GitLab、Raw URL 或本地 marketplace.json。</p>
            </div>
            <Button onClick={() => setAddMarketplaceOpen(true)}>
              <FolderPlus size={16} className="mr-2" />
              添加市场
            </Button>
          </div>
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="space-y-2">
              {marketplaces.map((marketplace) => (
                <button
                  key={marketplace.id}
                  type="button"
                  onClick={() => setSelectedMarketplaceId(marketplace.id)}
                  className={cn(
                    'w-full rounded-lg bg-card p-4 text-left shadow-sm transition hover:bg-muted/40',
                    selectedMarketplace?.id === marketplace.id && 'ring-2 ring-primary/25',
                  )}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-medium">{marketplace.name}</h3>
                        <Badge variant={marketplace.enabled ? 'secondary' : 'outline'}>{marketplace.type}</Badge>
                        {!marketplace.enabled && <Badge variant="outline">已禁用</Badge>}
                        {marketplace.lastError && <Badge variant="destructive">错误</Badge>}
                      </div>
                      <p className="mt-1 truncate text-sm text-muted-foreground">{marketplace.source}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>{marketplacePlugins.get(marketplace.id)?.length ?? 0} 个可用插件</span>
                        <span>·</span>
                        <span>{installedPluginsByMarketplace.get(marketplace.id)?.length ?? 0} 个已安装</span>
                        <span>·</span>
                        <span>{formatDateTime(marketplace.lastRefreshAt)}</span>
                      </div>
                    </div>
                    <Info size={16} className="mt-1 shrink-0 text-muted-foreground" />
                  </div>
                </button>
              ))}
              {!loading && marketplaces.length === 0 && <EmptyState text="暂无插件市场" />}
            </div>
            <MarketplaceDetailPanel
              marketplace={selectedMarketplace}
              availablePlugins={selectedMarketplace ? marketplacePlugins.get(selectedMarketplace.id) ?? [] : []}
              installedPlugins={selectedMarketplace ? installedPluginsByMarketplace.get(selectedMarketplace.id) ?? [] : []}
              loading={loading}
              onToggle={handleToggleMarketplace}
              onUpdateBranch={handleUpdateMarketplaceBranch}
              onBrowse={handleBrowseMarketplace}
              onRefresh={handleRefreshMarketplace}
              onRemove={handleRemoveMarketplace}
            />
          </div>
        </TabsContent>

        <TabsContent value="errors" className="space-y-2">
          {errors.map((error) => (
            <div key={error.id} className="rounded-lg bg-card p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <AlertTriangle size={16} className={cn('mt-0.5 shrink-0', error.level === 'error' ? 'text-destructive' : 'text-amber-500')} />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{error.title}</span>
                    <Badge variant={error.level === 'error' ? 'destructive' : 'outline'}>{error.level === 'error' ? '错误' : '警告'}</Badge>
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">{error.message}</div>
                </div>
              </div>
            </div>
          ))}
          {!loading && errors.length === 0 && <EmptyState text="暂无插件错误" />}
        </TabsContent>
      </Tabs>

      <Dialog open={addMarketplaceOpen} onOpenChange={setAddMarketplaceOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>添加插件市场</DialogTitle>
            <DialogDescription>
              当前仅支持 Claude Code 类型插件市场。输入市场来源后，系统会自动识别 GitHub、Gitee、GitLab、Raw URL 或本地路径。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <div className="mb-2 text-sm font-medium">市场来源</div>
              <Input
                value={marketplaceSourceInput}
                onChange={(event) => {
                  const nextSource = event.target.value
                  setMarketplaceSourceInput(nextSource)
                  try {
                    const inferred = nextSource.trim() ? inferMarketplaceInput(nextSource) : null
                    if (inferred && !supportsMarketplaceBranch(inferred.type)) setMarketplaceBranchInput('')
                    if (inferred?.branch) setMarketplaceBranchInput(inferred.branch)
                    if (inferred && supportsMarketplaceBranch(inferred.type) && !inferred.branch && !marketplaceBranchInput.trim()) setMarketplaceBranchInput('main')
                  } catch {
                    // 输入过程中允许暂时不可解析
                  }
                }}
                placeholder="owner/repo、GitLab/Gitee/GitHub 仓库、https://.../marketplace.json 或 ./path/to/marketplace"
                autoFocus
              />
            </div>
            <div>
              <div className="mb-2 text-sm font-medium">读取分支</div>
              <Input
                value={marketplaceBranchInput}
                onChange={(event) => setMarketplaceBranchInput(event.target.value)}
                placeholder="main 或 master"
                disabled={!inferredMarketplacePreview || !supportsMarketplaceBranch(inferredMarketplacePreview.type)}
              />
            </div>
            <div className="rounded-md bg-zinc-950 px-4 py-3 font-mono text-sm text-zinc-100 dark:bg-zinc-900">
              <div className="font-semibold">示例：</div>
              <div className="mt-2 space-y-1 text-zinc-400">
                <div>· owner/repo (GitHub)</div>
                <div>· http://gitlab.htzq.htsc.com.cn/aidev/ht-dev-plugins/claudecode-plugin-marketplace</div>
                <div>· git@github.com:owner/repo.git (SSH)</div>
                <div>· https://example.com/marketplace.json</div>
                <div>· ./path/to/marketplace</div>
              </div>
            </div>
            <Input
              value={inferredMarketplacePreview ? `${inferredMarketplacePreview.type} · ${inferredMarketplacePreview.id}` : ''}
              readOnly
              placeholder="输入后自动识别类型和 ID"
              className="text-muted-foreground"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setMarketplaceSourceInput('')
                setMarketplaceBranchInput('main')
                setAddMarketplaceOpen(false)
              }}
            >
              取消
            </Button>
            <Button disabled={!marketplaceSourceInput.trim()} onClick={() => void handleAddMarketplace()}>
              <FolderPlus size={16} className="mr-2" />
              添加
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

function PluginListSection({
  title,
  plugins,
  marketplaces,
  capabilityIssueCountsByPluginId,
  onOpenDetails,
}: {
  title: string
  plugins: AgentPluginInfo[]
  marketplaces: AgentPluginMarketplace[]
  capabilityIssueCountsByPluginId: Map<string, number>
  onOpenDetails: (pluginId: string) => void
}): React.ReactElement | null {
  if (plugins.length === 0) return null
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <div className="text-xs font-medium uppercase text-muted-foreground">{title}</div>
        <div className="text-xs text-muted-foreground">{plugins.length}</div>
      </div>
      {plugins.map((plugin) => {
        const capabilityIssueCount = capabilityIssueCountsByPluginId.get(plugin.id) ?? 0
        return (
        <div key={plugin.id} className="rounded-lg bg-card px-4 py-3 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-medium">{plugin.name}</h3>
                <Badge variant="outline">Plugin</Badge>
                {plugin.capabilities.some((capability) => capability.type === 'mcp') && <Badge variant="outline">MCP</Badge>}
                <Badge variant={plugin.kind === 'builtin' ? 'secondary' : 'outline'}>{plugin.kind === 'builtin' ? 'builtin' : getPluginSourceLabel(plugin, marketplaces)}</Badge>
                <span className="text-xs text-muted-foreground">{plugin.version}</span>
                <Badge variant={plugin.enabled ? 'secondary' : 'outline'}>{plugin.enabled ? 'enabled' : 'disabled'}</Badge>
                {plugin.issues.length > 0 && <Badge variant="destructive">{plugin.issues.length} error</Badge>}
                {capabilityIssueCount > 0 && <Badge variant="outline">{capabilityIssueCount} warning</Badge>}
              </div>
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{plugin.description ?? '暂无描述'}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>{summarizeCapabilities(plugin)}</span>
                {capabilityIssueCount > 0 && (
                  <>
                    <span>·</span>
                    <span className="text-amber-600 dark:text-amber-400">存在能力告警</span>
                  </>
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2 self-start md:self-center">
              <Package size={16} className="text-muted-foreground" />
              <Button variant="outline" size="sm" onClick={() => onOpenDetails(plugin.id)}>
                详情
              </Button>
            </div>
          </div>
        </div>
        )
      })}
    </section>
  )
}

function InstalledPluginDetailPage({
  plugin,
  capabilities,
  marketplaceName,
  onBack,
  onToggle,
  onUninstall,
  onUpdate,
  updatePending,
  onOpenMcpEditor,
  onTestMcp,
  onOpenExternal,
}: {
  plugin: AgentPluginInfo
  capabilities: AgentPluginCapability[]
  marketplaceName: string
  onBack: () => void
  onToggle: (plugin: AgentPluginInfo, enabled: boolean) => Promise<void>
  onUninstall: (plugin: AgentPluginInfo) => Promise<void>
  onUpdate: (plugin: AgentPluginInfo) => Promise<void>
  updatePending: boolean
  onOpenMcpEditor: (capability: AgentPluginCapability) => void
  onTestMcp: (capability: AgentPluginCapability) => Promise<void>
  onOpenExternal: (url?: string) => void
}): React.ReactElement {
  const grouped = groupCapabilities(capabilities)
  const canUpdate = plugin.kind === 'user' && getPluginInstallTarget(plugin) !== null
  const capabilityIssues = capabilities.filter((capability) => capability.conflict || capability.issue || capability.lastTestSuccess === false)
  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack} className="px-2">
        <ArrowLeft size={16} className="mr-2" />
        返回插件列表
      </Button>

      <section className="rounded-lg bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-semibold">{plugin.name}</h3>
              <span className="text-sm text-muted-foreground">@ {marketplaceName}</span>
              <Badge variant={plugin.enabled ? 'secondary' : 'outline'}>{plugin.enabled ? 'enabled' : 'disabled'}</Badge>
              {plugin.issues.length > 0 && <Badge variant="destructive">{plugin.issues.length} error</Badge>}
            </div>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{plugin.description ?? '暂无描述'}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">{plugin.enabled ? '启用' : '禁用'}</span>
            <Switch checked={plugin.enabled} onCheckedChange={(checked) => void onToggle(plugin, checked)} />
          </div>
        </div>

        <div className="mt-5 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <DetailField label="Scope" value={plugin.kind === 'builtin' ? 'builtin' : 'user'} />
          <DetailField label="Version" value={plugin.version} />
          <DetailField label="Author" value={plugin.author ?? '未知'} />
          <DetailField label="Updated" value={formatDateTime(plugin.updatedAt ?? plugin.installedAt)} />
          <DetailField label="Source" value={marketplaceName} />
          <DetailField label="License" value={plugin.license ?? '未知'} />
          <DetailField label="Path" value={plugin.path} />
          <DetailField label="Capabilities" value={summarizeCapabilities({ ...plugin, capabilities })} />
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {canUpdate && (
            <Button size="sm" disabled={updatePending} onClick={() => void onUpdate(plugin)}>
              {updatePending ? (
                <Loader2 size={14} className="mr-1 animate-spin" />
              ) : (
                <RefreshCw size={14} className="mr-1" />
              )}
              {updatePending ? '更新中' : '更新'}
            </Button>
          )}
          {plugin.homepage && (
            <Button variant="outline" size="sm" onClick={() => onOpenExternal(plugin.homepage)}>
              <ExternalLink size={14} className="mr-1" />
              主页
            </Button>
          )}
          {plugin.repository && (
            <Button variant="outline" size="sm" onClick={() => onOpenExternal(plugin.repository)}>
              <ExternalLink size={14} className="mr-1" />
              仓库
            </Button>
          )}
          {plugin.kind === 'user' && (
            <Button variant="ghost" size="sm" onClick={() => void onUninstall(plugin)}>
              <Trash2 size={14} className="mr-1" />
              卸载
            </Button>
          )}
        </div>
      </section>

      <section className="rounded-lg bg-card p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h4 className="text-sm font-semibold">Installed components</h4>
          <span className="text-xs text-muted-foreground">{capabilities.length} total</span>
        </div>
        <div className="space-y-4">
          {(['command', 'agent', 'skill', 'mcp'] as const).map((type) => (
            <CapabilityGroup
              key={type}
              type={type}
              capabilities={grouped[type]}
              onOpenMcpEditor={onOpenMcpEditor}
              onTestMcp={onTestMcp}
            />
          ))}
        </div>
        {capabilities.length === 0 && <EmptyState text="该插件暂无可发现能力" />}
      </section>

      <section className="rounded-lg bg-card p-5 shadow-sm">
        <h4 className="text-sm font-semibold">Errors</h4>
        <div className="mt-3 space-y-2">
          {plugin.issues.map((issue, index) => (
            <div key={`${plugin.id}:issue:${index}`} className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {issue.message}
            </div>
          ))}
          {capabilityIssues.map((capability) => (
            <div key={`${capability.type}:${capability.name}:issue`} className="rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
              {capability.issue?.message ?? capability.lastTestMessage ?? `${capabilityLabel(capability.type)} ${capability.name} 存在冲突或检查失败`}
            </div>
          ))}
          {!plugin.issues.length && capabilityIssues.length === 0 && (
            <p className="text-sm text-muted-foreground">暂无错误</p>
          )}
        </div>
      </section>

      {plugin.keywords.length > 0 && (
        <section className="rounded-lg bg-card p-5 shadow-sm">
          <h4 className="text-sm font-semibold">Keywords</h4>
          <div className="mt-3 flex flex-wrap gap-2">
            {plugin.keywords.map((keyword) => <Badge key={keyword} variant="outline">{keyword}</Badge>)}
          </div>
        </section>
      )}
    </div>
  )
}

function DetailField({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="truncate font-medium" title={value}>{value}</div>
    </div>
  )
}

function CopyValueButton({ value, label }: { value: string; label: string }): React.ReactElement {
  const [copied, setCopied] = React.useState(false)

  const handleCopy = React.useCallback(async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      toast.success(`${label}已复制`)
      window.setTimeout(() => setCopied(false), 1200)
    } catch (error) {
      console.error(`[插件设置] 复制${label}失败:`, error)
      toast.error(`${label}复制失败`)
    }
  }, [label, value])

  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className="size-7 shrink-0"
      title={copied ? '已复制' : `复制${label}`}
      onClick={handleCopy}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </Button>
  )
}

function CapabilityGroup({
  type,
  capabilities,
  onOpenMcpEditor,
  onTestMcp,
}: {
  type: AgentPluginCapability['type']
  capabilities: AgentPluginCapability[]
  onOpenMcpEditor: (capability: AgentPluginCapability) => void
  onTestMcp: (capability: AgentPluginCapability) => Promise<void>
}): React.ReactElement | null {
  if (capabilities.length === 0) return null
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="text-xs font-medium uppercase text-muted-foreground">{capabilityLabel(type)}</div>
        <Badge variant="outline">{capabilities.length}</Badge>
      </div>
      <div className="grid gap-2 xl:grid-cols-2">
        {capabilities.map((capability) => (
          <div key={`${capability.type}:${capability.name}`} className="rounded-md bg-muted/40 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{capability.name}</span>
                  {!capability.enabled && <Badge variant="outline">未启用</Badge>}
                  {capability.conflict && <Badge variant="destructive">冲突</Badge>}
                  {capability.lastTestSuccess != null && (
                    <Badge variant={capability.lastTestSuccess ? 'secondary' : 'destructive'}>
                      {capability.lastTestSuccess ? '检查通过' : '检查失败'}
                    </Badge>
                  )}
                </div>
                {capability.description && <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-muted-foreground">{capability.description}</p>}
                {capability.relativePath && <p className="mt-2 truncate font-mono text-[11px] text-muted-foreground">{capability.relativePath}</p>}
                {capability.lastTestMessage && <p className="mt-1 text-xs text-muted-foreground">{capability.lastTestMessage}</p>}
              </div>
              {capability.type === 'mcp' && capability.mcpServerId && (
                <div className="flex shrink-0 items-center gap-1">
                  <Button variant="outline" size="sm" onClick={() => onOpenMcpEditor(capability)}>
                    <Settings2 size={14} className="mr-1" />
                    配置
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => void onTestMcp(capability)}>测试</Button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function MarketplaceDetailPanel({
  marketplace,
  availablePlugins,
  installedPlugins,
  loading,
  onToggle,
  onUpdateBranch,
  onBrowse,
  onRefresh,
  onRemove,
}: {
  marketplace: AgentPluginMarketplace | null
  availablePlugins: AgentPluginMarketplacePlugin[]
  installedPlugins: AgentPluginInfo[]
  loading: boolean
  onToggle: (marketplace: AgentPluginMarketplace, enabled: boolean) => Promise<void>
  onUpdateBranch: (marketplace: AgentPluginMarketplace, branch: string) => Promise<void>
  onBrowse: (marketplace: AgentPluginMarketplace) => void
  onRefresh: (id: string) => Promise<void>
  onRemove: (id: string) => Promise<void>
}): React.ReactElement {
  const [branchDraft, setBranchDraft] = React.useState('main')

  React.useEffect(() => {
    setBranchDraft(marketplace?.branch ?? 'main')
  }, [marketplace?.id, marketplace?.branch])

  if (!marketplace) {
    return <EmptyState text="选择一个插件市场查看详情" />
  }
  const canConfigureBranch = supportsMarketplaceBranch(marketplace.type)

  return (
    <aside className="rounded-lg bg-card p-4 shadow-sm xl:sticky xl:top-4 xl:self-start">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{marketplace.name}</h3>
            <Badge variant={marketplace.enabled ? 'secondary' : 'outline'}>{marketplace.enabled ? '已启用' : '已禁用'}</Badge>
          </div>
          <div className="mt-1 flex min-w-0 items-center gap-1">
            <p className="min-w-0 truncate text-sm text-muted-foreground" title={marketplace.source}>{marketplace.source}</p>
            <CopyValueButton value={marketplace.source} label="插件市场地址" />
          </div>
        </div>
        <Switch checked={marketplace.enabled} onCheckedChange={(checked) => void onToggle(marketplace, checked)} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <DetailField label="类型" value={marketplace.type} />
        <DetailField label="分支" value={marketplace.branch ?? 'main'} />
        <DetailField label="可用插件" value={String(availablePlugins.length)} />
        <DetailField label="已安装" value={String(installedPlugins.length)} />
        <DetailField label="最近刷新" value={formatDateTime(marketplace.lastRefreshAt)} />
      </div>

      {canConfigureBranch && (
        <div className="mt-4 space-y-2 border-t pt-4">
          <div className="text-sm font-medium">读取分支</div>
          <div className="flex gap-2">
            <Input
              value={branchDraft}
              onChange={(event) => setBranchDraft(event.target.value)}
              placeholder="main 或 master"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => void onUpdateBranch(marketplace, branchDraft)}
              disabled={branchDraft.trim() === (marketplace.branch ?? 'main')}
            >
              保存
            </Button>
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => onBrowse(marketplace)}>
          <List size={14} className="mr-1" />
          浏览
        </Button>
        <Button size="sm" variant="outline" onClick={() => void onRefresh(marketplace.id)}>
          <RefreshCw size={14} className={cn('mr-1', loading && 'animate-spin')} />
          刷新
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void onRemove(marketplace.id)}>
          <Trash2 size={14} className="mr-1" />
          删除
        </Button>
      </div>

      {marketplace.lastError && (
        <div className="mt-4 max-h-28 overflow-auto break-words rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {marketplace.lastError}
        </div>
      )}

      <div className="mt-4 space-y-2 border-t pt-4">
        <div className="text-sm font-medium">已安装插件</div>
        {installedPlugins.length > 0 ? installedPlugins.map((plugin) => (
          <div key={plugin.id} className="flex items-center justify-between gap-3 rounded-md bg-muted/40 px-3 py-2 text-sm">
            <span className="min-w-0 truncate font-medium">{plugin.name}</span>
            <Badge variant={plugin.enabled ? 'secondary' : 'outline'}>{plugin.enabled ? '启用' : '禁用'}</Badge>
          </div>
        )) : (
          <p className="text-sm text-muted-foreground">暂无已安装插件</p>
        )}
      </div>

      <div className="mt-4 space-y-2 border-t pt-4">
        <div className="text-sm font-medium">市场插件</div>
        {availablePlugins.slice(0, 8).map((plugin) => (
          <div key={`${plugin.marketplaceId}:${plugin.name}`} className="rounded-md bg-muted/40 px-3 py-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate font-medium">{plugin.name}</span>
              {plugin.installed && <Badge variant="secondary">已安装</Badge>}
            </div>
            {plugin.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{plugin.description}</p>}
          </div>
        ))}
        {availablePlugins.length > 8 && <p className="text-xs text-muted-foreground">还有 {availablePlugins.length - 8} 个插件</p>}
      </div>
    </aside>
  )
}
