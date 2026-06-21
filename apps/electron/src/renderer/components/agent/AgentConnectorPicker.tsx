import * as React from 'react'
import { ChevronDown, Plug, Search, Settings } from 'lucide-react'
import type { McpServerEntry, WorkspaceMcpConfig } from '@proma/shared'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

export interface ConnectorPickerItem {
  name: string
  target: string
  entry: McpServerEntry
}

function getConnectorTarget(entry: McpServerEntry): string {
  if (entry.type === 'stdio') return entry.command ?? ''
  return entry.url ?? ''
}

export function getAvailableConnectorsForPicker(config: WorkspaceMcpConfig, query = ''): ConnectorPickerItem[] {
  const normalized = query.trim().toLowerCase()
  return Object.entries(config.servers ?? {})
    .filter(([name, entry]) => name !== 'memos-cloud' && entry.enabled)
    .map(([name, entry]) => ({ name, entry, target: getConnectorTarget(entry) }))
    .filter((item) => {
      if (!normalized) return true
      return [item.name, item.target, item.entry.type].some((text) => text.toLowerCase().includes(normalized))
    })
    .sort((a, b) => a.name.localeCompare(b.name))
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
  const [query, setQuery] = React.useState('')
  const [config, setConfig] = React.useState<WorkspaceMcpConfig>({ servers: {} })
  const inputRef = React.useRef<HTMLInputElement>(null)

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

  const connectors = React.useMemo(() => getAvailableConnectorsForPicker(config, query), [config, query])
  const selectedSet = React.useMemo(() => new Set(selectedNames), [selectedNames])

  const toggleConnector = React.useCallback((name: string): void => {
    const next = selectedSet.has(name)
      ? selectedNames.filter((item) => item !== name)
      : [...selectedNames, name]
    onSelectedNamesChange(next)
  }, [onSelectedNamesChange, selectedNames, selectedSet])

  const handleOpenConnectorManager = React.useCallback((): void => {
    setOpen(false)
    setQuery('')
    onOpenConnectorManager()
  }, [onOpenConnectorManager])

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
                {selectedCount > 0 ? `连接器 ${selectedCount}` : '连接器'}
              </span>
              <ChevronDown className="size-3.5" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p>选择连接器</p>
        </TooltipContent>
      </Tooltip>

      <PopoverContent
        side="top"
        align="center"
        sideOffset={10}
        className="w-[330px] overflow-hidden rounded-xl border bg-popover p-0 shadow-2xl"
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          requestAnimationFrame(() => inputRef.current?.focus())
        }}
      >
        <div className="flex h-10 items-center gap-2 border-b px-3">
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索连接器"
            className="h-full min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
          />
          <Search className="size-4 shrink-0 text-muted-foreground" />
        </div>

        <div className="max-h-[320px] overflow-y-auto py-1 scrollbar-thin">
          {connectors.length > 0 ? (
            connectors.map((connector) => {
              const checked = selectedSet.has(connector.name)
              return (
                <button
                  key={connector.name}
                  type="button"
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-accent"
                  onClick={() => toggleConnector(connector.name)}
                >
                  <Plug className={cn('size-4 shrink-0', checked ? 'text-blue-500' : 'text-muted-foreground')} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold leading-5 text-foreground">
                      {connector.name}
                    </span>
                    <span className="mt-0.5 block truncate text-xs leading-5 text-muted-foreground">
                      {checked ? '已选择' : connector.target || connector.entry.type}
                    </span>
                  </span>
                  <Switch checked={checked} className="scale-75" />
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
          className="flex h-10 w-full items-center gap-2.5 border-t px-3 text-left text-[13px] font-medium text-foreground transition-colors hover:bg-accent"
          onClick={handleOpenConnectorManager}
        >
          <Settings className="size-4" />
          <span>更多连接器</span>
        </button>
      </PopoverContent>
    </Popover>
  )
}
