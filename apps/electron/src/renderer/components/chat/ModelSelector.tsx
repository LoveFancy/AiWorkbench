/**
 * ModelSelector - 模型选择器（Popover 内联展开）
 *
 * 设计：点击触发按钮后在原地弹出下拉面板，选择模型后自动关闭。
 * 参考 WorkBuddy / Trae 的内联模型切换体验。
 */

import * as React from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { ChevronDown, Cpu, Search, Settings2 } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  conversationsAtom,
  selectedModelAtom,
  channelsAtom,
  channelsLoadedAtom,
} from '@/atoms/chat-atoms'
import { useConversationModelOptional } from '@/hooks/useConversationSettings'
import { useConversationIdOptional } from '@/contexts/session-context'
import { getModelLogo, getChannelLogo, DefaultLogo } from '@/lib/model-logo'
import { hasConfiguredApiKey } from '@/lib/model-selection'
import { cn } from '@/lib/utils'
import type { Channel, ModelOption } from '@proma/shared'

/** 从渠道列表构建扁平化的模型选项 */
function buildModelOptions(channels: Channel[], filterChannelId?: string, filterChannelIds?: string[]): ModelOption[] {
  const options: ModelOption[] = []

  for (const channel of channels) {
    if (!channel.enabled) continue
    if (!hasConfiguredApiKey(channel)) continue
    if (filterChannelId && channel.id !== filterChannelId) continue
    if (filterChannelIds && filterChannelIds.length > 0 && !filterChannelIds.includes(channel.id)) continue

    for (const model of channel.models) {
      if (!model.enabled) continue

      options.push({
        channelId: channel.id,
        channelName: channel.name,
        modelId: model.id,
        modelName: model.name,
        provider: channel.provider,
        supportsMultimodal: model.supportsMultimodal,
      })
    }
  }

  return options
}

/** 按渠道分组模型选项 */
function groupByChannel(options: ModelOption[]): Map<string, ModelOption[]> {
  const groups = new Map<string, ModelOption[]>()

  for (const option of options) {
    const key = option.channelId
    const group = groups.get(key) ?? []
    group.push(option)
    groups.set(key, group)
  }

  return groups
}

/** ModelSelector 可选属性 */
interface ModelSelectorProps {
  /** 仅显示此渠道的模型 */
  filterChannelId?: string
  /** 仅显示这些渠道的模型（多渠道过滤） */
  filterChannelIds?: string[]
  /** 外部选中模型（不传则用内部 selectedModelAtom） */
  externalSelectedModel?: { channelId: string; modelId: string } | null
  /** 外部选择回调 */
  onModelSelect?: (option: ModelOption) => void
  /** 触发按钮是否显示「渠道 · 模型」（默认只显示模型名） */
  showChannelInTrigger?: boolean
  /** 紧凑触发按钮，用于输入框工具栏 */
  compactTrigger?: boolean
  /** Auto Mode 配置（不传则不显示 Auto Mode 区域） */
  autoModeConfig?: {
    enabled: boolean
    setEnabled: (v: boolean) => void
    candidateModelIds: string[]
    onManageCandidates: () => void
    onCandidatesChange: (modelIds: string[]) => void
  }
}

export function ModelSelector({
  filterChannelId,
  filterChannelIds,
  externalSelectedModel,
  onModelSelect,
  showChannelInTrigger = false,
  compactTrigger = false,
  autoModeConfig,
}: ModelSelectorProps = {}): React.ReactElement {
  const [conversationModel, setConversationModel] = useConversationModelOptional()
  const conversationId = useConversationIdOptional()
  const setConversations = useSetAtom(conversationsAtom)
  const setGlobalModel = useSetAtom(selectedModelAtom)
  const channels = useAtomValue(channelsAtom)
  const channelsLoaded = useAtomValue(channelsLoadedAtom)
  const setChannels = useSetAtom(channelsAtom)
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState('')
  const [editingCandidates, setEditingCandidates] = React.useState(false)
  const [editingVersion, setEditingVersion] = React.useState(0)
  const localCandidatesRef = React.useRef<Set<string>>(new Set())

  // 进入候选编辑模式
  const enterEditCandidates = React.useCallback(() => {
    localCandidatesRef.current = new Set(autoModeConfig?.candidateModelIds ?? [])
    setEditingVersion(0)
    setEditingCandidates(true)
  }, [autoModeConfig?.candidateModelIds])

  // 退出候选编辑模式
  const cancelEditCandidates = React.useCallback(() => {
    setEditingCandidates(false)
  }, [])

  // 确认候选变更
  const confirmEditCandidates = React.useCallback(() => {
    autoModeConfig?.onCandidatesChange(Array.from(localCandidatesRef.current))
    setEditingCandidates(false)
  }, [autoModeConfig])

  // 切换单个模型的候选状态
  const toggleCandidate = React.useCallback((modelId: string) => {
    const next = new Set(localCandidatesRef.current)
    if (next.has(modelId)) {
      next.delete(modelId)
    } else {
      next.add(modelId)
    }
    localCandidatesRef.current = next
    setEditingVersion((v) => v + 1)
  }, [])

  // 外部模型优先 → per-conversation 模型
  const selectedModel = externalSelectedModel !== undefined ? externalSelectedModel : conversationModel

  // 每次打开时刷新渠道列表
  React.useEffect(() => {
    if (open) {
      window.electronAPI.listChannels().then(setChannels).catch(console.error)
      setSearch('')
    }
  }, [open, setChannels])

  const modelOptions = React.useMemo(() => buildModelOptions(channels, filterChannelId, filterChannelIds), [channels, filterChannelId, filterChannelIds])
  const grouped = React.useMemo(() => groupByChannel(modelOptions), [modelOptions])

  // 搜索过滤
  const filteredGrouped = React.useMemo(() => {
    if (!search.trim()) return grouped

    const query = search.toLowerCase()
    const filtered = new Map<string, ModelOption[]>()

    for (const [channelId, options] of grouped.entries()) {
      const matchedOptions = options.filter(
        (o) =>
          o.modelName.toLowerCase().includes(query) ||
          o.channelName.toLowerCase().includes(query)
      )
      if (matchedOptions.length > 0) {
        filtered.set(channelId, matchedOptions)
      }
    }

    return filtered
  }, [grouped, search])

  // 扁平化过滤后的模型列表，用于键盘导航
  const flatOptions = React.useMemo(() => {
    const result: ModelOption[] = []
    for (const options of filteredGrouped.values()) {
      result.push(...options)
    }
    return result
  }, [filteredGrouped])

  const [highlightIndex, setHighlightIndex] = React.useState(-1)
  const itemRefs = React.useRef<Map<number, HTMLButtonElement>>(new Map())

  React.useEffect(() => {
    setHighlightIndex(-1)
  }, [search])

  React.useEffect(() => {
    if (highlightIndex < 0) return
    const el = itemRefs.current.get(highlightIndex)
    el?.scrollIntoView({ block: 'nearest' })
  }, [highlightIndex])

  const currentModelInfo = React.useMemo(() => {
    if (!selectedModel) return null
    return modelOptions.find(
      (o) => o.channelId === selectedModel.channelId && o.modelId === selectedModel.modelId
    ) ?? null
  }, [selectedModel, modelOptions])

  const stableModelInfoRef = React.useRef(currentModelInfo)
  if (currentModelInfo) stableModelInfoRef.current = currentModelInfo
  const displayModelInfo = currentModelInfo ?? stableModelInfoRef.current

  /** 选择模型并持久化 */
  const handleSelect = (option: ModelOption): void => {
    if (onModelSelect) {
      onModelSelect(option)
      setOpen(false)
      return
    }

    if (setConversationModel) {
      setConversationModel({ channelId: option.channelId, modelId: option.modelId })
    }
    setGlobalModel({ channelId: option.channelId, modelId: option.modelId })
    setOpen(false)

    if (conversationId) {
      window.electronAPI
        .updateConversationModel(conversationId, option.modelId, option.channelId)
        .then((updated) => {
          setConversations((prev) =>
            prev.map((c) => (c.id === updated.id ? updated : c))
          )
        })
        .catch(console.error)
    }
  }

  /** 搜索框键盘导航 */
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (flatOptions.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIndex((prev) => (prev < flatOptions.length - 1 ? prev + 1 : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIndex((prev) => (prev > 0 ? prev - 1 : flatOptions.length - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const target = flatOptions[highlightIndex >= 0 ? highlightIndex : 0]
      if (target) handleSelect(target)
    }
  }

  if (channelsLoaded && modelOptions.length === 0) {
    return (
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground/60 px-2 py-1">
        <Cpu className="size-4" />
        <span>暂无可用模型</span>
      </div>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(
          'flex items-center gap-1.5 border border-transparent text-foreground/70 transition-all hover:border-border/60 hover:bg-accent hover:text-foreground',
          compactTrigger ? 'h-8 rounded-full px-2 text-[13px]' : 'rounded-md px-2.5 py-1.5 text-sm',
        )}
      >
        {autoModeConfig?.enabled ? (
          <>
            <Cpu className="size-4" />
            <span className={cn('truncate', compactTrigger ? 'max-w-[52px]' : 'max-w-[200px]')}>Auto</span>
          </>
        ) : (
          <>
            {displayModelInfo ? (
              <img
                src={getModelLogo(displayModelInfo.modelId, displayModelInfo.provider)}
                alt={displayModelInfo.modelName}
                className={cn('rounded object-cover', compactTrigger ? 'size-4' : 'size-[18px]')}
              />
            ) : (
              <Cpu className="size-4" />
            )}
            <span className={cn('truncate', compactTrigger ? 'max-w-[96px]' : 'max-w-[200px]')}>
              {displayModelInfo
                ? (showChannelInTrigger ? `${displayModelInfo.channelName} · ${displayModelInfo.modelName}` : displayModelInfo.modelName)
                : '选择模型'}
            </span>
          </>
        )}
        <ChevronDown className="size-3.5" />
      </PopoverTrigger>

      {/* 内联下拉面板 */}
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={6}
        className="p-0 gap-0 max-h-[480px] max-w-[340px] overflow-hidden"
      >
        {/* Auto Mode 开关区 */}
        {autoModeConfig && (
          <div className="px-3.5 py-2.5 border-b border-border/60">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-sm font-medium whitespace-nowrap">Auto Mode</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 px-1.5 text-xs text-muted-foreground hover:text-foreground gap-0.5"
                  onClick={editingCandidates ? cancelEditCandidates : enterEditCandidates}
                >
                  <Settings2 className="size-3" />
                  {editingCandidates ? '取消' : '候选'}
                </Button>
              </div>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Switch
                        checked={autoModeConfig.enabled}
                        onCheckedChange={autoModeConfig.setEnabled}
                        disabled={autoModeConfig.candidateModelIds.length === 0}
                      />
                    </span>
                  </TooltipTrigger>
                  {autoModeConfig.candidateModelIds.length === 0 && (
                    <TooltipContent side="left">
                      <p className="text-xs">请先配置候选模型</p>
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            </div>
            {editingCandidates && (
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                勾选作为自动切换候补的模型，完成后点击下方「确定」
              </p>
            )}
          </div>
        )}

        {/* 搜索栏 */}
        <div className="flex items-center gap-2.5 px-3.5 py-2.5 border-b border-border/40">
          <Search className="size-4 text-muted-foreground/40 flex-shrink-0" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="搜索模型..."
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/40"
            autoFocus
          />
        </div>

        {/* 模型列表 */}
        <div className="max-h-[320px] overflow-y-auto scrollbar-thin">
          {filteredGrouped.size === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground/50">
              未找到模型
            </div>
          ) : (
            (() => {
              let flatIndex = 0
              return Array.from(filteredGrouped.entries()).map(([channelId, options]) => {
                const first = options[0]
                if (!first) return null

                return (
                  <div key={channelId}>
                    {/* 供应商标题行 */}
                    <div className="flex items-center gap-2.5 px-3.5 py-2 bg-muted/40 border-b border-border/20">
                      <img
                        src={(() => {
                          const ch = channels.find((c) => c.id === channelId)
                          return ch ? getChannelLogo(ch) : DefaultLogo
                        })()}
                        alt={first.channelName}
                        className="size-[18px] rounded object-cover"
                      />
                      <span className="text-xs font-medium text-muted-foreground">
                        {first.channelName}
                      </span>
                    </div>

                    {/* 该渠道下的模型 */}
                    {options.map((option) => {
                      const isSelected =
                        selectedModel?.channelId === option.channelId &&
                        selectedModel?.modelId === option.modelId
                      const currentFlatIndex = flatIndex++
                      const isHighlighted = currentFlatIndex === highlightIndex

                      return (
                        <button
                          key={`${option.channelId}:${option.modelId}`}
                          ref={(el) => {
                            if (el) itemRefs.current.set(currentFlatIndex, el)
                            else itemRefs.current.delete(currentFlatIndex)
                          }}
                          type="button"
                          onClick={() => {
                            if (editingCandidates) {
                              toggleCandidate(option.modelId)
                            } else {
                              handleSelect(option)
                            }
                          }}
                          onMouseEnter={() => setHighlightIndex(currentFlatIndex)}
                          className={cn(
                            'flex items-center gap-3 w-full px-3.5 py-2 text-left transition-colors',
                            'hover:bg-accent/80',
                            isHighlighted && 'bg-accent/80',
                            !editingCandidates && isSelected && 'bg-primary/8 border-l-[3px] border-l-primary'
                          )}
                        >
                          {/* 编辑模式下显示 checkbox */}
                          {editingCandidates && (
                            <span className={cn(
                              'flex-shrink-0 size-[18px] rounded border-2 flex items-center justify-center transition-colors',
                              localCandidatesRef.current.has(option.modelId)
                                ? 'bg-primary border-primary'
                                : 'border-muted-foreground/30'
                            )}>
                              {localCandidatesRef.current.has(option.modelId) && (
                                <svg className="size-3.5 text-primary-foreground" viewBox="0 0 16 16" fill="none">
                                  <path d="M3 8l3.5 3.5L13 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              )}
                            </span>
                          )}
                          <img
                            src={getModelLogo(option.modelId, option.provider)}
                            alt={option.modelName}
                            className="size-[18px] rounded object-cover flex-shrink-0"
                          />
                          <span className={cn(
                            'flex-1 text-sm truncate',
                            !editingCandidates && isSelected ? 'font-semibold text-foreground' : 'text-foreground/75'
                          )}>
                            {option.modelName}
                          </span>
                          {option.supportsMultimodal ? (
                            <span className="inline-flex h-5 shrink-0 items-center rounded px-1.5 text-[10px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                              多模态
                            </span>
                          ) : (
                            <span className="inline-flex h-5 shrink-0 items-center rounded px-1.5 text-[10px] font-medium bg-muted text-muted-foreground">
                              文本
                            </span>
                          )}
                          {!editingCandidates && autoModeConfig?.candidateModelIds?.includes(option.modelId) && (
                            <span className="inline-flex h-5 shrink-0 items-center rounded px-1.5 text-[10px] font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400">
                              Auto
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                )
              })
            })()
          )}
        </div>

        {/* 编辑模式底部操作栏 */}
        {editingCandidates && (
          <div className="px-3 py-2 border-t border-border/60 flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-7"
              onClick={cancelEditCandidates}
            >
              取消
            </Button>
            <Button
              size="sm"
              className="text-xs h-7"
              onClick={confirmEditCandidates}
            >
              确定
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
