export type CapabilityTab = 'experts' | 'skills' | 'connectors'

export interface CapabilityTabItem {
  value: CapabilityTab
  label: string
  count: number
}

interface CapabilityTabCounts {
  experts: number
  skills: number
  connectors: number
}

export function getCapabilityTabs(counts: CapabilityTabCounts): CapabilityTabItem[] {
  return [
    { value: 'experts', label: '专家', count: counts.experts },
    { value: 'skills', label: '技能', count: counts.skills },
    { value: 'connectors', label: '连接器', count: counts.connectors },
  ]
}
