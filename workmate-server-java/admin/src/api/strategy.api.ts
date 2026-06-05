import apiClient from './client'

export interface UpgradeStrategy {
  id: number
  name: string
  targetVersion: string
  downloadUrl: string
  releaseNotes: string | null
  platform: string
  minVersion: string | null
  totalStages: number
  currentStage: number
  soakTimeMinutes: number | null
  autoPauseErrorRate: string | null
  autoPauseEnabled: boolean
  status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'FINISHED'
  createdAt: string
  updatedAt: string
  _count?: { stages: number }
}

export interface StrategyStageRule {
  id: number
  ruleType: string
  ruleValue: string
}

export interface StrategyStage {
  id: number
  stageOrder: number
  name: string
  releaseNotes: string | null
  advancedAt: string | null
  rules: StrategyStageRule[]
}

export interface StrategyDetail extends UpgradeStrategy {
  stages: StrategyStage[]
}

export function fetchStrategies(params: {
  page: number
  pageSize: number
}): Promise<{ data: { total: number; strategies: UpgradeStrategy[] } }> {
  return apiClient.get('/strategies', { params })
}

export function fetchStrategyDetail(id: number): Promise<{ data: StrategyDetail }> {
  return apiClient.get(`/strategies/${id}`)
}

export function createStrategy(data: {
  name: string
  targetVersion: string
  downloadUrl: string
  releaseNotes?: string
  platform: string
  minVersion?: string
  totalStages: number
  soakTimeMinutes?: number
  autoPauseErrorRate?: number
  autoPauseEnabled?: boolean
  stages: Array<{
    name: string
    releaseNotes?: string
    rules: Array<{ ruleType: string; ruleValue: string }>
  }>
}): Promise<{ data: UpgradeStrategy }> {
  return apiClient.post('/strategies', data)
}

export function activateStrategy(id: number): Promise<{ data: UpgradeStrategy }> {
  return apiClient.post(`/strategies/${id}/activate`)
}

export function advanceStrategyStage(id: number): Promise<{ data: StrategyStage }> {
  return apiClient.post(`/strategies/${id}/advance-stage`)
}

export function retreatStrategyStage(id: number): Promise<{ data: StrategyDetail }> {
  return apiClient.post(`/strategies/${id}/retreat-stage`)
}

export function pauseStrategy(id: number): Promise<{ data: UpgradeStrategy }> {
  return apiClient.post(`/strategies/${id}/pause`)
}

export function resumeStrategy(id: number): Promise<{ data: UpgradeStrategy }> {
  return apiClient.post(`/strategies/${id}/resume`)
}

export function finishStrategy(id: number, nextStrategyId: number): Promise<{ data: UpgradeStrategy }> {
  return apiClient.post(`/strategies/${id}/finish`, { nextStrategyId })
}

export function editStrategyStages(id: number, data: {
  stages: Array<{ name: string; rules: Array<{ ruleType: string; ruleValue: string }> }>
  totalStages: number
}): Promise<{ data: StrategyDetail }> {
  return apiClient.put(`/strategies/${id}/edit-stages`, data)
}