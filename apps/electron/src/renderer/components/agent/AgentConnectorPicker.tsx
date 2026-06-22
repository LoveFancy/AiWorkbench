import * as React from 'react'
import { ChevronDown, Plug, Settings } from 'lucide-react'
import type { McpServerEntry, WorkspaceMcpConfig } from '@proma/shared'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import {
  DEFAULT_CONNECTOR_DEFINITIONS,
  getDefaultConnectorServerNames,
  type DefaultConnectorDefinition,
} from '@/components/agent-skills/default-connectors'

export interface ConnectorPickerItem {
  name: string
  displayName: string
  target: string
  entry?: McpServerEntry
  defaultConnector?: DefaultConnectorDefinition
  selectable: boolean
  selectedName?: string
  statusLabel: string
}

function getConnectorTarget(entry: McpServerEntry): string {
  if (entry.type === 'stdio') return entry.command ?? ''
  return entry.url ?? ''
}

export function getAvailableConnectorsForPicker(config: WorkspaceMcpConfig, query = ''): ConnectorPickerItem[] {
  const normalized = query.trim().toLowerCase()
  const defaultServerNames = getDefaultConnectorServerNames()
  const defaultItems: ConnectorPickerItem[] = DEFAULT_CONNECTOR_DEFINITIONS.map((connector) => {
    const entry = connector.serverName ? config.servers?.[connector.serverName] : undefined
    const initialized = Boolean(entry)
    const selectable = Boolean(entry?.enabled && connector.serverName)
    return {
      name: connector.serverName ?? connector.id,
      displayName: connector.name,
      target: entry ? getConnectorTarget(entry) : connector.category,
      entry,
      defaultConnector: connector,
      selectable,
      selectedName: connector.serverName,
      statusLabel: selectable ? '连接' : connector.status === 'coming-soon' ? '敬请期待' : initialized ? '未启用' : '配置',
    }
  })

  const customItems: ConnectorPickerItem[] = Object.entries(config.servers ?? {})
    .filter(([name, entry]) => name !== 'memos-cloud' && entry.enabled && !defaultServerNames.has(name))
    .map(([name, entry]) => ({
      name,
      displayName: name,
      entry,
      target: getConnectorTarget(entry),
      selectable: true,
      selectedName: name,
      statusLabel: '连接',
    }))

  return [...defaultItems, ...customItems]
    .filter((item) => {
      if (!normalized) return true
      return [
        item.name,
        item.displayName,
        item.target,
        item.entry?.type,
        item.defaultConnector?.description,
        item.defaultConnector?.category,
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

  React.useEffect(() => {
    if (!workspaceSlug) {
      setConfig({ servers: {} })
      return
    }

    let cancelled = false
    window.electronAPI.getWorkspaceMcpConfig(workspaceSlug)
      .then((nextConfig) => {
        if (!cancelled) setConfig(nextConfig)
      })
      .catch((error) => {
        console.error('[连接器] 加载 MCP 配置失败:', error)
        if (!cancelled) setConfig({ servers: {} })
      })

    return () => {
      cancelled = true
    }
  }, [workspaceSlug, capabilitiesVersion])

  const connectors = React.useMemo(() => getAvailableConnectorsForPicker(config), [config])
  const selectedSet = React.useMemo(() => new Set(selectedNames), [selectedNames])

  const toggleConnector = React.useCallback((name: string): void => {
    const next = selectedSet.has(name)
      ? selectedNames.filter((item) => item !== name)
      : [...selectedNames, name]
    onSelectedNamesChange(next)
  }, [onSelectedNamesChange, selectedNames, selectedSet])

  const handleOpenConnectorManager = React.useCallback((): void => {
    setOpen(false)
    onOpenConnectorManager()
  }, [onOpenConnectorManager])

  const handleConnectorClick = React.useCallback((connector: ConnectorPickerItem): void => {
    if (!connector.selectable || !connector.selectedName) {
      handleOpenConnectorManager()
      return
    }
    toggleConnector(connector.selectedName)
  }, [handleOpenConnectorManager, toggleConnector])

  const selectedCount = selectedNames.length

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              className={cn(
                'h-8 shrink-0 rounded-full px-2.5 text-foreground/70 hover:text-foreground',
                (open || selectedCount > 0) && 'bg-muted text-foreground',
              )}
              disabled={disabled || !workspaceSlug}
            >
              <Plug className={cn('size-4', selectedCount > 0 && 'text-blue-500')} />
              <span className="text-[13px] font-medium">
                {selectedCount > 0 ? `连应用 ${selectedCount}` : '连应用'}
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
        className="w-[430px] overflow-hidden rounded-xl border bg-popover p-0 shadow-2xl"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <div className="max-h-[420px] overflow-y-auto py-1.5 scrollbar-thin">
          {connectors.length > 0 ? (
            connectors.map((connector) => {
              const checked = connector.selectedName ? selectedSet.has(connector.selectedName) : false
              return (
                <button
                  key={connector.name}
                  type="button"
                  className={cn(
                    'flex h-12 w-full items-center gap-3 px-3 text-left transition-colors hover:bg-accent',
                    !connector.selectable && 'text-muted-foreground',
                  )}
                  onClick={() => handleConnectorClick(connector)}
                >
                  <ConnectorAppIcon name={connector.displayName} selected={checked} unavailable={!connector.selectable} />
                  <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-foreground">
                    {connector.displayName}
                  </span>
                  <span className={cn(
                    'shrink-0 text-[14px] font-medium',
                    checked ? 'text-blue-600 dark:text-blue-300' : 'text-foreground/70',
                  )}
                  >
                    {checked ? '已选择' : connector.statusLabel}
                  </span>
                </button>
              )
            })
          ) : (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              没有可用连接器
            </div>
          )}
        </div>

        <button
          type="button"
          className="flex h-11 w-full items-center gap-3 border-t px-3 text-left text-[15px] font-medium text-foreground transition-colors hover:bg-accent"
          onClick={handleOpenConnectorManager}
        >
          <Settings className="size-5 text-muted-foreground" />
          <span>更多连接器</span>
        </button>
      </PopoverContent>
    </Popover>
  )
}

function ConnectorAppIcon({ name, selected, unavailable }: { name: string; selected: boolean; unavailable: boolean }): React.ReactElement {
  const initial = (name.trim()[0] ?? 'C').toUpperCase()
  return (
    <span className={cn(
      'flex size-8 shrink-0 items-center justify-center rounded-lg text-sm font-semibold',
      selected
        ? 'bg-blue-500/12 text-blue-600 dark:text-blue-300'
        : unavailable
          ? 'bg-muted/70 text-muted-foreground/60'
          : 'bg-muted text-muted-foreground',
    )}
    >
      <Plug className="size-4" />
      <span className="sr-only">{initial}</span>
    </span>
  )
}
