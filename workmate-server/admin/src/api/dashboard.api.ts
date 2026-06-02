import apiClient from './client'

export interface DashboardStats {
  totalEvents: number
  errorEvents: number
  errorRate: number
  activeStrategies: number
  activeReleases: number
  totalUsers: number
}

export function fetchDashboardStats(): Promise<{ data: DashboardStats }> {
  return apiClient.get('/dashboard')
}