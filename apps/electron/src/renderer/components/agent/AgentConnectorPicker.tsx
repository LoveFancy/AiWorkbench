import * as React from 'react'
import { ChevronDown, Plug, Settings } from 'lucide-react'
import { toast } from 'sonner'
import type { McpServerEntry, WorkspaceMcpConfig, ConnectorsConfig } from '@proma/shared'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import {
  getPresetConnectorDefinitions,
  getPresetConnectorServerNames,
  type PresetConnectorDefinition,
} from '@/components/agent-skills/default-connectors'

export interface ConnectorPickerItem {
  name: string
  displayName: string
  target: string
  entry?: McpServerEntry
  presetConnector?: PresetConnectorDefinition
  isConfigured: boolean
  enabled: boolean
  isComingSoon: boolean
  isCli: boolean
}

// ===== 工具函数 =====

function getConnectorTarget(entry: McpServerEntry): string {
  if (entry.type === 'stdio') return entry.command ?? ''
  return entry.url ?? ''
}

export function getAvailableConnectorsForPicker(
  config: WorkspaceMcpConfig,
  connectorsConfig: ConnectorsConfig | null,
  feishuConnected: boolean,
  query = '',
): ConnectorPickerItem[] {
  const normalized = query.trim().toLowerCase()
  const presetServerNames = getPresetConnectorServerNames(connectorsConfig)
  const presetDefs = getPresetConnectorDefinitions(connectorsConfig)

  const presetItems: ConnectorPickerItem[] = presetDefs.map((connector) => {
    const isCli = connector.connectorType === 'cli'
    const isComingSoon = connector.status === 'coming-soon'

    const mcpEntry = connector.serverName ? config.servers?.[connector.serverName] : undefined
    const entry = isCli ? undefined : mcpEntry

    const isConfigured = isComingSoon ? false
      : isCli ? feishuConnected
      : Boolean(mcpEntry)

    const enabled = isConfigured
      ? (connectorsConfig?.connectors?.[connector.id]?.enabled ?? false)
      : false

    return {
      name: connector.serverName ?? connector.id,
      displayName: connector.name,
      target: entry ? getConnectorTarget(entry) : connector.category,
      entry,
presetConnector: connector,
      isConfigured,
      enabled,
      isComingSoon,
      isCli,
    }
  })

  const customItems: ConnectorPickerItem[] = Object.entries(config.servers ?? {})
    .filter(([name, entry]) => name !== 'memos-cloud' && !presetServerNames.has(name))
    .map(([name, entry]) => ({
      name,
      displayName: connectorsConfig?.connectors?.[name]?.displayName ?? name,
      entry,
      target: getConnectorTarget(entry),
isConfigured: true,
      enabled: connectorsConfig?.connectors?.[name]?.enabled ?? entry.enabled ?? false,
      isComingSoon: false,
      isCli: false,
    }))

  return [...presetItems, ...customItems]
    .filter((item) => {
      if (!normalized) return true
      return [
        item.name,
        item.displayName,
        item.target,
        item.entry?.type,
        item.presetConnector?.description,
        item.presetConnector?.category,
      ].filter(Boolean).some((text) => String(text).toLowerCase().includes(normalized))
    })
}

interface AgentConnectorPickerProps {
  workspaceSlug: string | null
  selectedNames: string[]
  disabled?: boolean
  capabilitiesVersion: number
  onSelectedNamesChange: (names: string[]) => void
  onOpenConnectorManager: () => void
}

export function AgentConnectorPicker({
  workspaceSlug,
  selectedNames,
  disabled = false,
  capabilitiesVersion,
  onSelectedNamesChange,
  onOpenConnectorManager,
}: AgentConnectorPickerProps): React.ReactElement {
  const [open, setOpen] = React.useState(false)
  const [config, setConfig] = React.useState<WorkspaceMcpConfig>({ servers: {} })
  const [connectorsConfig, setConnectorsConfig] = React.useState<ConnectorsConfig | null>(null)
  const [feishuConnected, setFeishuConnected] = React.useState(false)

  React.useEffect(() => {
    if (!workspaceSlug) {
      setConfig({ servers: {} })
      setConnectorsConfig(null)
      setFeishuConnected(false)
      return
    }

    let cancelled = false
    window.electronAPI.getWorkspaceMcpConfig(workspaceSlug)
      .then((nextConfig) => { if (!cancelled) setConfig(nextConfig) })
      .catch((error) => { console.error('[连接器] 加载 MCP 配置失败:', error); if (!cancelled) setConfig({ servers: {} }) })

    window.electronAPI.getConnectorsConfig(workspaceSlug)
      .then((next) => { if (!cancelled) setConnectorsConfig(next) })
      .catch(() => { if (!cancelled) setConnectorsConfig(null) })

    window.electronAPI.getFeishuCliAuthStatus()
      .then((s) => { if (!cancelled) setFeishuConnected(s.status === 'connected') })
      .catch(() => { if (!cancelled) setFeishuConnected(false) })

    return () => { cancelled = true }
  }, [workspaceSlug, capabilitiesVersion])

  const connectors = React.useMemo(
    () => getAvailableConnectorsForPicker(config, connectorsConfig, feishuConnected),
    [config, connectorsConfig, feishuConnected],
  )

  const handleOpenConnectorManager = React.useCallback((): void => {
    setOpen(false)
    onOpenConnectorManager()
  }, [onOpenConnectorManager])

  /** 切换连接器 enabled 状态（统一走 connectorsConfig） */
  const handleToggleEnabled = React.useCallback(async (connector: ConnectorPickerItem, enabled: boolean): Promise<void> => {
    if (!workspaceSlug) return

    // 预设连接器用 presetConnector.id，自定义连接器用 name
    const connectorId = connector.presetConnector?.id ?? connector.name

    setConnectorsConfig((prev) => {
      if (!prev) return prev
      const c = prev.connectors[connectorId]
      if (!c) {
        // 自定义连接器可能尚未注册到 connectors.json，补一个最小条目
        return { ...prev, connectors: { ...prev.connectors, [connectorId]: { type: 'mcp', enabled, source: 'user' } } }
      }
      return { ...prev, connectors: { ...prev.connectors, [connectorId]: { ...c, enabled } } }
    })

    if (enabled) {
      if (!selectedNames.includes(connectorId)) {
        onSelectedNamesChange([...selectedNames, connectorId])
      }
    } else {
      onSelectedNamesChange(selectedNames.filter((n) => n !== connectorId))
    }

    try {
      const cc = await window.electronAPI.getConnectorsConfig(workspaceSlug)
      const c = cc.connectors[connectorId]
      if (c) {
        await window.electronAPI.saveConnectorsConfig(workspaceSlug, {
          ...cc,
          connectors: { ...cc.connectors, [connectorId]: { ...c, enabled } },
        })
      } else {
        // 补充缺失的自定义连接器条目
        await window.electronAPI.saveConnectorsConfig(workspaceSlug, {
          ...cc,
          connectors: { ...cc.connectors, [connectorId]: { type: 'mcp', enabled, source: 'user' } },
        })
      }
    } catch (e) {
      toast.error('切换连接器状态失败', { description: (e as Error).message })
    }
  }, [workspaceSlug, selectedNames, onSelectedNamesChange])

  const handleOpenChange = React.useCallback((nextOpen: boolean) => {
    setOpen(nextOpen)
    if (nextOpen && workspaceSlug) {
      window.electronAPI.getConnectorsConfig(workspaceSlug)
        .then((next) => { setConnectorsConfig(next) })
        .catch(() => {})
      window.electronAPI.getFeishuCliAuthStatus()
        .then((s) => { setFeishuConnected(s.status === 'connected') })
        .catch(() => {})
    }
  }, [workspaceSlug])

  const anyEnabled = connectors.some((c) => c.isConfigured && c.enabled)

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              className={cn(
                'h-8 shrink-0 rounded-full px-2.5 text-foreground/70 hover:text-foreground',
                (open || anyEnabled) && 'bg-muted text-foreground',
              )}
              disabled={disabled || !workspaceSlug}
            >
              <Plug className={cn('size-4', anyEnabled && 'text-blue-500')} />
              <span className="text-[13px] font-medium">
                {anyEnabled ? `连应用 ${connectors.filter((c) => c.isConfigured && c.enabled).length}` : '连应用'}
              </span>
              <ChevronDown className="size-3.5" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p>连接应用</p>
        </TooltipContent>
      </Tooltip>

      <PopoverContent
        side="top"
        align="center"
        sideOffset={10}
        className="w-[360px] overflow-hidden rounded-[14px] border border-border/50 bg-popover/95 p-1.5 shadow-xl backdrop-blur"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <div className="max-h-[360px] space-y-1 overflow-y-auto scrollbar-thin">
          {connectors.length > 0 ? (
connectors.map((connector) => (
              <ConnectorRow
                key={connector.name}
                connector={connector}
                onOpenManager={handleOpenConnectorManager}
                onToggleEnabled={handleToggleEnabled}
              />
            ))
          ) : (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              没有可用连接器
            </div>
          )}
        </div>

        <div className="mt-1 border-t border-border/50 pt-1">
          <button
            type="button"
            className="flex h-10 w-full items-center gap-2.5 rounded-[10px] px-2.5 text-left text-[13px] font-medium text-foreground transition-colors hover:bg-muted/70"
            onClick={handleOpenConnectorManager}
          >
            <span className="flex size-7 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Settings className="size-4" />
            </span>
            <span>更多连接器</span>
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ===== 单行连接器组件 =====

interface ConnectorRowProps {
  connector: ConnectorPickerItem
  onOpenManager: () => void
  onToggleEnabled: (connector: ConnectorPickerItem, enabled: boolean) => void
}

function ConnectorRow({
  connector,
  onOpenManager,
  onToggleEnabled,
}: ConnectorRowProps): React.ReactElement {
  return (
    <div
      className={cn(
        'group flex h-12 w-full items-center gap-3 px-3 transition-colors',
        connector.isComingSoon && 'pointer-events-none opacity-40',
      )}
    >
      <ConnectorAppIcon name={connector.displayName} enabled={connector.enabled} />

      <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-foreground">
        {connector.displayName}
      </span>

      {connector.isComingSoon ? (
        <span className="shrink-0 text-[14px] text-muted-foreground">敬请期待</span>
      ) : connector.isConfigured ? (
        <div className="flex shrink-0 items-center gap-2">
          {/* Switch 切换开关：绿色 = 启用，灰色 = 未启用 */}
          <Switch
            checked={connector.enabled}
            onCheckedChange={(checked) => onToggleEnabled(connector, checked)}
            className={cn(
              'data-[state=checked]:bg-emerald-500',
            )}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onOpenManager()
          }}
          className="shrink-0 rounded-md bg-primary px-3 py-1 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          连接
        </button>
      )}
    </div>
  )
}

function ConnectorAppIcon({ name, enabled }: { name: string; enabled: boolean }): React.ReactElement {
  return (
    <span className={cn(
      'flex size-8 shrink-0 items-center justify-center rounded-lg text-sm font-semibold',
      enabled
        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
        : 'bg-muted text-muted-foreground',
    )}
    >
      <Plug className="size-4" />
      <span className="sr-only">{name}</span>
    </span>
  )
}
