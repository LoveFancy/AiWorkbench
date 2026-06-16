/**
 * CandidateModelDialog — Auto Mode 候选模型配置面板
 *
 * 允许用户勾选 Auto Mode 下自动切换的后备模型列表。
 * 支持按模型名搜索、全选/清空、快速全选私有化模型。
 * 勾选 SaaS 模型时弹出二次确认。
 */

import * as React from 'react'
import { ChevronDown, Search, Shield } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { getModelLogo } from '@/lib/model-logo'
import type { Channel, ProviderType } from '@proma/shared'

// ===== Types =====

interface CandidateModelDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  channels: Channel[]
  /** 更多模型（如平台模型），非渠道来源 */
  extraModels?: Array<{ id: string; name: string; provider: ProviderType; enabled?: boolean }>
  candidateModelIds: string[]
  onCandidatesChange: (modelIds: string[]) => void
  autoModeEnabled: boolean
  onAutoModeEnabledChange: (enabled: boolean) => void
}

interface FlatModel {
  id: string
  name: string
  provider: ProviderType
  isLocal: boolean
}

// ===== Helpers =====

function isLocalModel(modelId: string, _provider: ProviderType): boolean {
  return modelId.toLowerCase().includes('local')
}

function buildModelList(channels: Channel[], extraModels?: FlatModel['id'][] | Array<{ id: string; name: string; provider: ProviderType; enabled?: boolean }>): FlatModel[] {
  const seen = new Set<string>()
  const result: FlatModel[] = []

  for (const channel of channels) {
    if (!channel.enabled) continue
    for (const model of channel.models) {
      if (!model.enabled) continue
      if (seen.has(model.id)) continue
      seen.add(model.id)
      result.push({
        id: model.id,
        name: model.name,
        provider: channel.provider,
        isLocal: isLocalModel(model.id, channel.provider),
      })
    }
  }

  if (extraModels) {
    for (const m of extraModels) {
      if (typeof m === 'string') continue
      if (seen.has(m.id)) continue
      if (m.enabled === false) continue
      seen.add(m.id)
      result.push({
        id: m.id,
        name: m.name,
        provider: m.provider,
        isLocal: isLocalModel(m.id, m.provider),
      })
    }
  }

  return result
}

// ===== Component =====

export function CandidateModelDialog({
  open,
  onOpenChange,
  channels,
  extraModels,
  candidateModelIds,
  onCandidatesChange,
  autoModeEnabled,
  onAutoModeEnabledChange,
}: CandidateModelDialogProps): React.ReactElement {
  const [search, setSearch] = React.useState('')
  const [showSaaSConfirm, setShowSaaSConfirm] = React.useState<string | null>(null)

  // 本地暂存：解决快速勾选竞态 + 提供"确定/取消"语义
  const [pendingCandidates, setPendingCandidates] = React.useState<string[]>(candidateModelIds)
  const [pendingAutoMode, setPendingAutoMode] = React.useState(autoModeEnabled)

  // dialog 打开时从 props 同步到本地暂存
  React.useEffect(() => {
    if (open) {
      setPendingCandidates(candidateModelIds)
      setPendingAutoMode(autoModeEnabled)
      setSearch('')
      setShowSaaSConfirm(null)
    }
  }, [open, candidateModelIds, autoModeEnabled])

  const allModels = React.useMemo(() => buildModelList(channels, extraModels), [channels, extraModels])
  const localModelIds = React.useMemo(() => allModels.filter(m => m.isLocal).map(m => m.id), [allModels])

  const filteredModels = React.useMemo(() => {
    if (!search.trim()) return allModels
    const q = search.toLowerCase()
    return allModels.filter(m => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q))
  }, [allModels, search])

  const candidateSet = React.useMemo(() => new Set(pendingCandidates), [pendingCandidates])

  const handleToggle = (modelId: string, checked: boolean) => {
    if (checked) {
      const model = allModels.find(m => m.id === modelId)
      if (model && !model.isLocal) {
        setShowSaaSConfirm(modelId)
        return
      }
      setPendingCandidates(prev => [...prev, modelId])
    } else {
      setPendingCandidates(prev => prev.filter(id => id !== modelId))
    }
  }

  const confirmSaaS = () => {
    if (showSaaSConfirm) {
      setPendingCandidates(prev => [...prev, showSaaSConfirm])
      setShowSaaSConfirm(null)
    }
  }

  const handleClearAll = () => {
    setPendingCandidates([])
    setPendingAutoMode(false)
  }

  const handleSelectAllLocal = () => {
    setPendingCandidates(prev => {
      const merged = new Set([...prev, ...localModelIds])
      return Array.from(merged)
    })
  }

  // "确定" 时一次性持久化
  const handleConfirm = () => {
    onCandidatesChange(pendingCandidates)
    onAutoModeEnabledChange(pendingAutoMode)
    onOpenChange(false)
  }

  // "取消" 时直接关闭
  const handleCancel = () => {
    onOpenChange(false)
  }

  React.useEffect(() => {
    if (!open) {
      setSearch('')
      setShowSaaSConfirm(null)
    }
  }, [open])

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="p-0 gap-0 max-w-md" aria-describedby={undefined}>
          <DialogHeader className="sr-only">
            <DialogTitle>Auto Mode 候选模型</DialogTitle>
            <DialogDescription>
              配置自动切换时的后备模型列表
            </DialogDescription>
          </DialogHeader>

          {/* 安全提示 */}
          <div className="mx-4 mt-3 p-2.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-400 flex items-start gap-2">
            <Shield className="size-3.5 mt-0.5 flex-shrink-0" />
            <span>为保障数据安全，建议仅勾选本地模型。勾选 SaaS 模型可能导致敏感数据在自动切换时被发送至第三方服务。</span>
          </div>

          {/* 搜索栏 */}
          <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border/60">
            <Search className="size-4 text-muted-foreground/60 flex-shrink-0" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索模型..."
              className="flex-1 border-0 bg-transparent h-auto p-0 text-sm outline-none placeholder:text-muted-foreground/50 focus-visible:ring-0 focus-visible:ring-offset-0"
              autoFocus
            />
          </div>

          {/* 模型列表 */}
          <div className="max-h-[360px] overflow-y-auto scrollbar-thin">
            {filteredModels.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                未找到模型
              </div>
            ) : (
              filteredModels.map((model) => {
                const checked = candidateSet.has(model.id)
                return (
                  <label
                    key={model.id}
                    className={cn(
                      'flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors hover:bg-accent/50',
                      checked && 'bg-accent/30',
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) => handleToggle(model.id, v === true)}
                    />
                    <img
                      src={getModelLogo(model.id, model.provider)}
                      alt={model.name}
                      className="size-5 rounded object-cover flex-shrink-0"
                    />
                    <span className="flex-1 text-sm truncate">{model.name}</span>
                    <span className={cn(
                      'inline-flex h-5 shrink-0 items-center rounded px-1.5 text-[10px] font-medium',
                      model.isLocal
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        : 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
                    )}>
                      {model.isLocal ? '私有化' : '云端 (SaaS)'}
                    </span>
                  </label>
                )
              })
            )}
          </div>

          {/* 底部操作栏 */}
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-border/60">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="text-xs" onClick={handleSelectAllLocal}>
                全选私有化
              </Button>
              <Button variant="outline" size="sm" className="text-xs" onClick={handleClearAll}>
                清空
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="text-xs" onClick={handleCancel}>
                取消
              </Button>
              <Button size="sm" className="text-xs" onClick={handleConfirm}>
                确定
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* SaaS 确认对话框 */}
      <Dialog open={showSaaSConfirm !== null} onOpenChange={(v) => { if (!v) setShowSaaSConfirm(null) }}>
        <DialogContent className="max-w-sm" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>添加 SaaS 模型？</DialogTitle>
            <DialogDescription>
              该模型为云端服务，自动切换时可能将对话上下文发送至第三方服务器，存在数据泄露风险。确定要添加吗？
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setShowSaaSConfirm(null)}>
              取消
            </Button>
            <Button size="sm" onClick={confirmSaaS}>
              确定添加
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
