import apiClient from './client'

export interface UpgradeRelease {
  id: number
  version: string
  releaseType: 'UPGRADE' | 'ROLLBACK'
  releaseNotes: string
  downloadUrl: string
  platform: string
  arch: string | null
  packageType: string | null
  fileName: string | null
  fileSize: number | null
  sha256: string | null
  minVersion: string | null
  isActive: boolean
  publishedAt: string
}

export interface ReleaseUploadResult {
  version: string
  platform: string
  arch: string
  packageType: string
  fileName: string
  fileSize: number
  sha256: string
  downloadUrl: string
}

export interface UpgradeWhitelistRule {
  id: number
  ruleType: string
  ruleValue: string
  targetVersion: string | null
  platform: string | null
  sourceStrategyId: number | null
  isActive: boolean
  createdAt: string
}

export interface ListResult<T> {
  total: number
  rules?: T[]
  releases?: T[]
}

export function fetchReleases(params: {
  page: number
  pageSize: number
  platform?: string
}): Promise<{ data: { total: number; releases: UpgradeRelease[] } }> {
  return apiClient.get('/releases', { params })
}

export function uploadReleaseFile(data: {
  version: string
  platform: string
  arch: string
  packageType: string
  file: File
  onUploadProgress?: (percent: number) => void
}): Promise<{ data: ReleaseUploadResult }> {
  const formData = new FormData()
  formData.append('version', data.version)
  formData.append('platform', data.platform)
  formData.append('arch', data.arch)
  formData.append('packageType', data.packageType)
  formData.append('file', data.file)

  return apiClient.post('/releases/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 600000, // 10 min for large file upload
    onUploadProgress: (progressEvent) => {
      if (data.onUploadProgress && progressEvent.total) {
        const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total)
        data.onUploadProgress(percent)
      }
    },
  })
}

export function createRelease(data: {
  version: string
  releaseType: string
  releaseNotes: string
  downloadUrl: string
  platform: string
  arch?: string
  packageType?: string
  fileName?: string
  fileSize?: number
  sha256?: string
  minVersion?: string
}): Promise<{ data: UpgradeRelease }> {
  return apiClient.post('/releases', data)
}

export function rollbackRelease(data: {
  platform: string
  targetVersion: string
}): Promise<{ data: UpgradeRelease }> {
  return apiClient.post('/rollback', data)
}

export function fetchUpgradeWhitelist(params: {
  page: number
  pageSize: number
  platform?: string
  targetVersion?: string
  strategyId?: number
}): Promise<{ data: { total: number; rules: UpgradeWhitelistRule[] } }> {
  return apiClient.get('/upgrade-whitelist', { params })
}

export function addUpgradeWhitelistRule(data: {
  ruleType: string
  ruleValue: string
  targetVersion?: string
  platform?: string
}): Promise<{ data: UpgradeWhitelistRule }> {
  return apiClient.post('/upgrade-whitelist', data)
}

export function removeUpgradeWhitelistRule(id: number): Promise<unknown> {
  return apiClient.delete(`/upgrade-whitelist/${id}`)
}

export function toggleUpgradeWhitelistRule(
  id: number,
  isActive: boolean
): Promise<{ data: UpgradeWhitelistRule }> {
  return apiClient.patch(`/upgrade-whitelist/${id}`, { isActive })
}