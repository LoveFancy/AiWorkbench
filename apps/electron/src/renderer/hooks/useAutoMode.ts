/**
 * useAutoMode — Auto Mode 状态管理 Hook
 *
 * 封装 Auto Mode 的所有状态和行为：
 * - 从 settings.json 加载/持久化 autoModeEnabled 和 autoSwitchCandidateModels
 * - 提供 toggle / candidates 变更回调
 * - 提供 autoModeConfig props 给 ModelSelector
 * - 提供 CandidateModelDialog 状态
 */

import * as React from 'react'
import { useAtom } from 'jotai'
import {
  autoModeEnabledAtom,
  autoSwitchCandidateModelsAtom,
} from '@/atoms/agent-atoms'
import type { CandidateModelRef } from '@/atoms/agent-atoms'

export interface AutoModeState {
  /** Auto Mode 开关 */
  enabled: boolean
  /** 候选模型列表（含渠道信息） */
  candidates: CandidateModelRef[]
  /** 切换开关（含持久化） */
  setEnabled: (enabled: boolean) => void
  /** 修改候选模型列表（含持久化） */
  setCandidates: (modelIds: CandidateModelRef[]) => void
  /** 一次性提交 candidates + autoModeEnabled，避免两次 updateSettings 调用竞态 */
  commitCandidates: (modelIds: CandidateModelRef[], enabled: boolean) => void
  /** 候选模型配置 Dialog 开关 */
  candidateDialogOpen: boolean
  /** 打开候选模型配置 */
  openCandidateDialog: () => void
  /** 关闭候选模型配置 */
  closeCandidateDialog: () => void
  /** 给 ModelSelector 的 autoModeConfig props */
  autoModeConfig: {
    enabled: boolean
    setEnabled: (v: boolean) => void
    candidateModelIds: string[]
    candidateModels: CandidateModelRef[]
    onManageCandidates: () => void
    /** ModelSelector 通过 string[] 调用；hook 内部转为 CandidateModelRef[] */
    onCandidatesChange: (modelIds: string[]) => void
  }
}

export function useAutoMode(): AutoModeState {
  const [enabled, setEnabledAtom] = useAtom(autoModeEnabledAtom)
  const [candidates, setCandidatesAtom] = useAtom(autoSwitchCandidateModelsAtom)
  const [candidateDialogOpen, setCandidateDialogOpen] = React.useState(false)
  const commitGenRef = React.useRef(0)

  // 初始化加载 — 从磁盘读取一次。用 commitGenRef 防止异步 resolve 时
  // 用户已经通过 commitCandidates 更新了原子，导致旧值覆盖新值。
  React.useEffect(() => {
    const genAtStart = commitGenRef.current
    window.electronAPI.getSettings().then((settings) => {
      // 如果这期间已经有 commit 调用，说明原子已被用户操作更新，不再覆盖
      if (commitGenRef.current !== genAtStart) return
      setEnabledAtom(settings.autoModeEnabled ?? false)
      // 归一化：settings 中可能是 string[] 或 CandidateModelRef[]
      const raw = (settings.autoSwitchCandidateModels ?? []) as Array<string | CandidateModelRef>
      const normalized: CandidateModelRef[] = raw.map((item) => {
        if (typeof item === 'string') {
          return { modelId: item, channelId: '' }
        }
        return item as CandidateModelRef
      })
      setCandidatesAtom(normalized)
    }).catch(console.error)
  }, [setEnabledAtom, setCandidatesAtom])

  // 持久化回调
  const setEnabled = React.useCallback((v: boolean) => {
    setEnabledAtom(v)
    window.electronAPI.updateSettings({ autoModeEnabled: v }).catch(console.error)
  }, [setEnabledAtom])

  const setCandidates = React.useCallback((modelIds: CandidateModelRef[]) => {
    setCandidatesAtom(modelIds)
    window.electronAPI.updateSettings({ autoSwitchCandidateModels: modelIds }).catch(console.error)
  }, [setCandidatesAtom])

  // 一次性提交 candidates + autoModeEnabled，避免两次 updateSettings 调用竞态覆盖
  const commitCandidates = React.useCallback((modelIds: CandidateModelRef[], enabled: boolean) => {
    commitGenRef.current += 1
    setCandidatesAtom(modelIds)
    setEnabledAtom(enabled)
    window.electronAPI.updateSettings({
      autoSwitchCandidateModels: modelIds,
      autoModeEnabled: enabled,
    }).catch(console.error)
  }, [setCandidatesAtom, setEnabledAtom])

  // ModelSelector 通过 string[] 触发的快速切换，需转为 CandidateModelRef[]
  const onCandidatesChangeFromSelector = React.useCallback((modelIds: string[]) => {
    // 保留已有候选的 channelId，新增的模型留空（后端 fallback 到首个匹配渠道）
    const existingMap = new Map<string, string>()
    for (const c of candidates) {
      if (c.channelId) existingMap.set(c.modelId, c.channelId)
    }
    const refs: CandidateModelRef[] = modelIds.map((id) => ({
      modelId: id,
      channelId: existingMap.get(id) ?? '',
    }))
    setCandidatesAtom(refs)
    window.electronAPI.updateSettings({ autoSwitchCandidateModels: refs }).catch(console.error)
  }, [candidates, setCandidatesAtom])

  const openCandidateDialog = React.useCallback(() => setCandidateDialogOpen(true), [])
  const closeCandidateDialog = React.useCallback(() => setCandidateDialogOpen(false), [])

  const autoModeConfig = React.useMemo(() => ({
    enabled,
    setEnabled,
    candidateModelIds: candidates.map(c => c.modelId),
    candidateModels: candidates,
    onManageCandidates: openCandidateDialog,
    onCandidatesChange: onCandidatesChangeFromSelector,
  }), [enabled, setEnabled, candidates, openCandidateDialog, onCandidatesChangeFromSelector])

  return {
    enabled,
    candidates,
    setEnabled,
    setCandidates,
    commitCandidates,
    candidateDialogOpen,
    openCandidateDialog,
    closeCandidateDialog,
    autoModeConfig,
  }
}
