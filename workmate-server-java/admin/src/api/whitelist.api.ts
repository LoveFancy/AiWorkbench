import apiClient from './client'

export interface AdminWhitelistRule {
  id: number
  ruleType: string
  ruleValue: string
  remark: string | null
  isActive: boolean
  createdAt: string
}

export function fetchAdminWhitelist(params: {
  page: number
  pageSize: number
}): Promise<{ data: { total: number; rules: AdminWhitelistRule[] } }> {
  return apiClient.get('/admin-whitelist', { params })
}

export function addAdminWhitelistRule(data: {
  ruleType: string
  ruleValue: string
  remark?: string
}): Promise<{ data: AdminWhitelistRule }> {
  return apiClient.post('/admin-whitelist', data)
}

export function removeAdminWhitelistRule(id: number): Promise<unknown> {
  return apiClient.delete(`/admin-whitelist/${id}`)
}

export function toggleAdminWhitelistRule(
  id: number,
  isActive: boolean
): Promise<{ data: AdminWhitelistRule }> {
  return apiClient.patch(`/admin-whitelist/${id}`, { isActive })
}