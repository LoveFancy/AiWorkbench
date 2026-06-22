/**
 * ChannelSettings - 渠道配置页
 *
 * 模型配置同时作为 Chat 和 Agent 的来源。Agent 可用模型由已启用的
 * Anthropic 兼容渠道自动推导，不再维护独立的供应商开关。
 */

import * as React from 'react'
import { useAtom, useSetAtom } from 'jotai'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { PROVIDER_LABELS, isAgentCompatibleProvider } from '@proma/shared'
import type { Channel } from '@proma/shared'
import { getChannelLogo } from '@/lib/model-logo'
import { agentChannelIdAtom, agentModelIdAtom, agentChannelIdsAtom } from '@/atoms/agent-atoms'
import { channelsAtom, selectedModelAtom } from '@/atoms/chat-atoms'
import { applySavedChannelSnapshot } from '@/lib/channel-sync'
import { getAgentAvailableChannelIds, hasConfiguredApiKey, resolveAgentSelectedModel, resolveSelectedModel } from '@/lib/model-selection'
import { PlatformModelsSection } from '@/platform-models/renderer'
import { SettingsSection, SettingsCard, SettingsRow } from './primitives'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { ChannelForm } from './ChannelForm'

/** 组件视图模式 */
type ViewMode = 'list' | 'create' | 'edit'

export function ChannelSettings(): React.ReactElement {
  const [channels, setChannels] = React.useState<Channel[]>([])
  const [viewMode, setViewMode] = React.useState<ViewMode>('list')
  const [editingChannel, setEditingChannel] = React.useState<Channel | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [agentChannelId, setAgentChannelId] = useAtom(agentChannelIdAtom)
  const [agentModelId, setAgentModelId] = useAtom(agentModelIdAtom)
  const setAgentChannelIds = useSetAtom(agentChannelIdsAtom)
  const setGlobalChannels = useSetAtom(channelsAtom)
  const [selectedModel, setSelectedModel] = useAtom(selectedModelAtom)
  const [deleteTarget, setDeleteTarget] = React.useState<Channel | null>(null)
  const agentChannelIdRef = React.useRef(agentChannelId)

  React.useEffect(() => {
    agentChannelIdRef.current = agentChannelId
  }, [agentChannelId])

  const syncDefaultAgentModel = React.useCallback(async (
    list: Channel[],
  ): Promise<void> => {
    const nextAgentChannelIds = getAgentAvailableChannelIds(list)
    const current = agentChannelIdRef.current && agentModelId
      ? { channelId: agentChannelIdRef.current, modelId: agentModelId }
      : null
    const nextModel = resolveAgentSelectedModel(list, current)

    setAgentChannelIds(nextAgentChannelIds)

    if (nextModel?.channelId === current?.channelId && nextModel?.modelId === current?.modelId) return

    agentChannelIdRef.current = nextModel?.channelId ?? null
    setAgentChannelId(nextModel?.channelId ?? null)
    setAgentModelId(nextModel?.modelId ?? null)
    await window.electronAPI.updateSettings({
      agentChannelId: nextModel?.channelId,
      agentModelId: nextModel?.modelId,
      agentChannelIds: nextAgentChannelIds,
    }).catch(console.error)
  }, [agentModelId, setAgentChannelId, setAgentModelId])

  /** 加载渠道列表 */
  const loadChannels = React.useCallback(async (): Promise<Channel[]> => {
    try {
      const list = await window.electronAPI.listChannels()
      // 排除 __platform__ 虚拟渠道（由 PlatformModelsSection 独立管理）
      const filtered = list.filter((c) => c.id !== '__platform__')
      setChannels(filtered)
      setGlobalChannels(list) // 全局缓存包含 __platform__，供 ModelSelector 使用
      const nextModel = resolveSelectedModel(filtered, selectedModel)
      if (nextModel?.channelId !== selectedModel?.channelId || nextModel?.modelId !== selectedModel?.modelId) {
        setSelectedModel(nextModel)
      }
      await syncDefaultAgentModel(list)
      return list
    } catch (error) {
      console.error('[渠道设置] 加载渠道列表失败:', error)
      return []
    } finally {
      setLoading(false)
    }
  }, [selectedModel, setGlobalChannels, setSelectedModel, syncDefaultAgentModel])

  React.useEffect(() => {
    loadChannels()
  }, [loadChannels])

  const syncAgentChannelEligibility = React.useCallback(async (): Promise<void> => {
    await syncDefaultAgentModel(await window.electronAPI.listChannels())
  }, [syncDefaultAgentModel])

  /** 删除渠道（通过弹窗确认） */
  const handleDeleteRequest = (channel: Channel): void => {
    setDeleteTarget(channel)
  }

  /** 确认删除 */
  const handleDeleteConfirm = async (): Promise<void> => {
    if (!deleteTarget) return
    const target = deleteTarget
    try {
      await window.electronAPI.deleteChannel(target.id)

      const nextChannels = (await window.electronAPI.listChannels()).filter((channel) => channel.id !== target.id)
      const newIds = getAgentAvailableChannelIds(nextChannels)
      setAgentChannelIds(newIds)

      // 如果删除的是当前选中的 Agent 渠道，清空选择
      if (agentChannelId === target.id) {
        setAgentChannelId(null)
        setAgentModelId(null)
      }

      await window.electronAPI.updateSettings({
        agentChannelIds: newIds,
        ...(agentChannelId === target.id && { agentChannelId: undefined, agentModelId: undefined }),
      })

      await loadChannels()
      setDeleteTarget(null)
    } catch (error) {
      console.error('[渠道设置] 删除渠道失败:', error)
    }
  }

  /** 切换渠道启用状态 */
  const handleToggle = async (channel: Channel): Promise<void> => {
    try {
      await window.electronAPI.updateChannel(channel.id, { enabled: !channel.enabled })
      await syncAgentChannelEligibility()

      await loadChannels()
    } catch (error) {
      console.error('[渠道设置] 切换渠道状态失败:', error)
    }
  }

  /** 表单保存回调 */
  const handleFormSaved = async (): Promise<void> => {
    setViewMode('list')
    setEditingChannel(null)
    await loadChannels()
  }

  const handleFormAutoSaved = React.useCallback((savedChannel: Channel): void => {
    const synced = applySavedChannelSnapshot(channels, savedChannel, selectedModel)
    setChannels(synced.channels)
    setGlobalChannels(synced.channels)
    if (synced.selectedModel?.channelId !== selectedModel?.channelId || synced.selectedModel?.modelId !== selectedModel?.modelId) {
      setSelectedModel(synced.selectedModel)
    }
  }, [channels, selectedModel, setGlobalChannels, setSelectedModel])

  /** 取消表单 */
  const handleFormCancel = (): void => {
    setViewMode('list')
    setEditingChannel(null)
  }

  // 表单视图
  if (viewMode === 'create' || viewMode === 'edit') {
    return (
      <ChannelForm
        channel={editingChannel}
        onSaved={handleFormSaved}
        onAutoSaved={handleFormAutoSaved}
        onAgentEligibilityChange={syncAgentChannelEligibility}
        onCancel={handleFormCancel}
      />
    )
  }

  // 列表视图
  return (
    <div className="space-y-8">
      {/* 区块零：泰为平台模型 */}
      <PlatformModelsSection />

      {/* 区块一：自定义模型配置 */}
      <SettingsSection
        title="自定义模型配置"
        description="手动配置 AI 供应商连接、API Key 和模型。Anthropic 兼容协议的已启用模型会自动用于 Agent"
        action={
          <Button size="sm" onClick={() => setViewMode('create')}>
            <Plus size={16} />
            <span>添加配置</span>
          </Button>
        }
      >
        {loading ? (
          <div className="text-sm text-muted-foreground py-8 text-center">加载中...</div>
        ) : channels.length === 0 ? (
          <SettingsCard divided={false}>
            <div className="text-sm text-muted-foreground py-12 text-center">
              还没有配置任何模型，点击上方"添加配置"开始
            </div>
          </SettingsCard>
        ) : (
          <SettingsCard>
            {channels.map((channel) => (
              <ChannelRow
                key={channel.id}
                channel={channel}
                onEdit={() => {
                  setEditingChannel(channel)
                  setViewMode('edit')
                }}
                onDelete={() => handleDeleteRequest(channel)}
                onToggle={() => handleToggle(channel)}
              />
            ))}
          </SettingsCard>
        )}
      </SettingsSection>

      {/* 删除确认弹窗 */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确定删除渠道？</AlertDialogTitle>
            <AlertDialogDescription>
              确定删除渠道「{deleteTarget?.name}」？此操作不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteTarget(null)}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm}>确认删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ===== 渠道行子组件 =====

interface ChannelRowProps {
  channel: Channel
  onEdit: () => void
  onDelete: () => void
  onToggle: () => void
}

function ChannelRow({ channel, onEdit, onDelete, onToggle }: ChannelRowProps): React.ReactElement {
  const enabledCount = channel.models.filter((m) => m.enabled).length
  const description = [
    PROVIDER_LABELS[channel.provider],
    !hasConfiguredApiKey(channel) ? '待配置 API Key' : undefined,
    enabledCount > 0 ? `${enabledCount} 个模型已启用` : undefined,
    isAgentCompatibleProvider(channel.provider) ? '可用于 Agent' : undefined,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <SettingsRow
      label={channel.name}
      icon={<img src={getChannelLogo(channel)} alt="" className="w-8 h-8 rounded" />}
      description={description}
      className="group"
    >
      <div className="flex items-center gap-2">
        {/* 操作按钮 */}
        <button
          onClick={onEdit}
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors opacity-0 group-hover:opacity-100"
          title="编辑"
        >
          <Pencil size={14} />
        </button>
        <button
          onClick={onDelete}
          className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100"
          title="删除"
        >
          <Trash2 size={14} />
        </button>

        {/* 启用/关闭开关 */}
        <Switch
          checked={channel.enabled}
          onCheckedChange={onToggle}
        />
      </div>
    </SettingsRow>
  )
}
