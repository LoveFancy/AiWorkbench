import * as React from 'react'
import { Bot, Check, ChevronDown, Mail, MessageSquare, Plug, Settings } from 'lucide-react'
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

export type ConnectorVisualKind = 'email' | 'feishu' | 'hiagent' | 'custom'

export function getConnectorVisualKind(connector: Pick<ConnectorPickerItem, 'name' | 'displayName' | 'defaultConnector'>): ConnectorVisualKind {
  if (connector.defaultConnector?.id === 'personal-email' || connector.displayName.includes('邮箱')) return 'email'
  if (connector.defaultConnector?.id === 'feishu-cli' || connector.displayName.includes('飞书')) return 'feishu'
  if (connector.defaultConnector?.id === 'hiagent-taiwei' || connector.displayName.toLowerCase().includes('hiagent')) return 'hiagent'
  return 'custom'
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
      statusLabel: selectable ? '可连接' : connector.status === 'coming-soon' ? '敬请期待' : initialized ? '未启用' : '配置',
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
      statusLabel: '可连接',
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
        className="w-[360px] overflow-hidden rounded-[14px] border border-border/50 bg-popover/95 p-1.5 shadow-xl backdrop-blur"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <div className="max-h-[360px] space-y-1 overflow-y-auto scrollbar-thin">
          {connectors.length > 0 ? (
            connectors.map((connector) => {
              const checked = connector.selectedName ? selectedSet.has(connector.selectedName) : false
              const subtitle = connector.defaultConnector?.category ?? connector.target
              return (
                <button
                  key={connector.name}
                  type="button"
                  className={cn(
                    'group flex min-h-[58px] w-full items-center gap-3 rounded-[10px] px-2.5 py-2 text-left transition-colors hover:bg-muted/70',
                    checked && 'bg-blue-500/8 hover:bg-blue-500/10',
                    !connector.selectable && 'text-muted-foreground hover:bg-muted/45',
                  )}
                  onClick={() => handleConnectorClick(connector)}
                >
                  <ConnectorAppIcon connector={connector} selected={checked} unavailable={!connector.selectable} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium leading-5 text-foreground">
                      {connector.displayName}
                    </span>
                    <span className="block truncate text-[12px] leading-4 text-muted-foreground">
                      {subtitle}
                    </span>
                  </span>
                  <ConnectorStatusBadge checked={checked} label={connector.statusLabel} selectable={connector.selectable} />
                </button>
              )
            })
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

function ConnectorStatusBadge({ checked, label, selectable }: { checked: boolean; label: string; selectable: boolean }): React.ReactElement {
  return (
    <span className={cn(
      'inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-[12px] font-medium',
      checked
        ? 'bg-blue-500 text-white shadow-sm shadow-blue-500/20'
        : !selectable
          ? 'bg-muted text-muted-foreground'
          : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    )}
    >
      {checked && <Check className="size-3" />}
      {checked ? '已选择' : label}
    </span>
  )
}

function ConnectorAppIcon({ connector, selected, unavailable }: { connector: ConnectorPickerItem; selected: boolean; unavailable: boolean }): React.ReactElement {
  const visualKind = getConnectorVisualKind(connector)
  const Icon = visualKind === 'email'
    ? Mail
    : visualKind === 'feishu'
      ? MessageSquare
      : visualKind === 'hiagent'
        ? Bot
        : Plug

  return (
    <span className={cn(
      'flex size-9 shrink-0 items-center justify-center rounded-[10px] transition-colors',
      selected
        ? 'bg-blue-500 text-white shadow-sm shadow-blue-500/20'
        : unavailable
          ? 'bg-muted/70 text-muted-foreground/55'
          : visualKind === 'email'
            ? 'bg-cyan-500/12 text-cyan-700 dark:text-cyan-300'
            : visualKind === 'feishu'
              ? 'bg-sky-500/12 text-sky-700 dark:text-sky-300'
              : visualKind === 'hiagent'
                ? 'bg-violet-500/12 text-violet-700 dark:text-violet-300'
                : 'bg-muted text-muted-foreground',
    )}
    >
      <Icon className="size-4.5" />
      <span className="sr-only">{connector.displayName}</span>
    </span>
  )
}
