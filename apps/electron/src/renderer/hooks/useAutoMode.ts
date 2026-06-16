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

export interface AutoModeState {
  /** Auto Mode 开关 */
  enabled: boolean
  /** 候选模型 ID 列表 */
  candidates: string[]
  /** 切换开关（含持久化） */
  setEnabled: (enabled: boolean) => void
  /** 修改候选模型列表（含持久化） */
  setCandidates: (modelIds: string[]) => void
  /** 一次性提交 candidates + autoModeEnabled，避免两次 updateSettings 调用竞态 */
  commitCandidates: (modelIds: string[], enabled: boolean) => void
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
    onManageCandidates: () => void
    onCandidatesChange: (modelIds: string[]) => void
  }
}

export function useAutoMode(): AutoModeState {
  const [enabled, setEnabledAtom] = useAtom(autoModeEnabledAtom)
  const [candidates, setCandidatesAtom] = useAtom(autoSwitchCandidateModelsAtom)
  const [candidateDialogOpen, setCandidateDialogOpen] = React.useState(false)

  // 初始化加载
  React.useEffect(() => {
    window.electronAPI.getSettings().then((settings) => {
      setEnabledAtom(settings.autoModeEnabled ?? false)
      setCandidatesAtom(settings.autoSwitchCandidateModels ?? [])
    }).catch(console.error)
  }, [setEnabledAtom, setCandidatesAtom])

  // 持久化回调
  const setEnabled = React.useCallback((v: boolean) => {
    setEnabledAtom(v)
    window.electronAPI.updateSettings({ autoModeEnabled: v }).catch(console.error)
  }, [setEnabledAtom])

  const setCandidates = React.useCallback((modelIds: string[]) => {
    setCandidatesAtom(modelIds)
    window.electronAPI.updateSettings({ autoSwitchCandidateModels: modelIds }).catch(console.error)
  }, [setCandidatesAtom])

  // 一次性提交 candidates + autoModeEnabled，避免两次 updateSettings 调用竞态覆盖
  const commitCandidates = React.useCallback((modelIds: string[], enabled: boolean) => {
    setCandidatesAtom(modelIds)
    setEnabledAtom(enabled)
    window.electronAPI.updateSettings({
      autoSwitchCandidateModels: modelIds,
      autoModeEnabled: enabled,
    }).catch(console.error)
  }, [setCandidatesAtom, setEnabledAtom])

  const openCandidateDialog = React.useCallback(() => setCandidateDialogOpen(true), [])
  const closeCandidateDialog = React.useCallback(() => setCandidateDialogOpen(false), [])

  const autoModeConfig = React.useMemo(() => ({
    enabled,
    setEnabled,
    candidateModelIds: candidates,
    onManageCandidates: openCandidateDialog,
    onCandidatesChange: setCandidates,
  }), [enabled, setEnabled, candidates, openCandidateDialog, setCandidates])

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
