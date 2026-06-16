import type { AgentExpertGroupInfo } from '@proma/shared'
import { getExpertGroupSearchTerms } from '@/experts/card/subagents'

export function filterByTag(
  groups: AgentExpertGroupInfo[],
  tag: 'all' | 'followed' | 'recent' | 'available' | 'unavailable' | 'expert' | 'team',
  followed: Record<string, number>,
  recent: Record<string, number>
): AgentExpertGroupInfo[] {
  switch (tag) {
    case 'all': return groups
    case 'followed': return groups.filter(g => followed[g.id])
    case 'recent': {
      const r = groups.filter(g => recent[g.id])
      return r.sort((a, b) => (recent[b.id] ?? 0) - (recent[a.id] ?? 0)).slice(0, 8)
    }
    case 'available': return groups.filter(g => g.status === 'available')
    case 'unavailable': return groups.filter(g => g.status !== 'available')
    case 'expert': return groups.filter(g => g.expertType !== 'team')
    case 'team': return groups.filter(g => g.expertType === 'team' || (g.subagents && g.subagents.length > 0))
  }
}

export function searchByName(
  groups: AgentExpertGroupInfo[],
  query: string
): AgentExpertGroupInfo[] {
  if (!query.trim()) return groups
  const q = query.trim().toLowerCase()
  return groups.filter(g =>
    getExpertGroupSearchTerms(g).some(t => t.toLowerCase().includes(q))
  )
}

/** 按场景 tags 过滤：任一 tag 匹配即命中 */
export function filterByScene(
  groups: AgentExpertGroupInfo[],
  sceneTags: string[]
): AgentExpertGroupInfo[] {
  if (!sceneTags || sceneTags.length === 0) return groups
  return groups.filter(g => {
    if (g.tags?.some(t => sceneTags.some(st => t.includes(st) || st.includes(t)))) {
      return true
    }
    const text = [g.name, g.description, g.mainRole?.name].filter(Boolean).join(' ')
    return sceneTags.some(st => text.includes(st))
  })
}

/** 按 tags 匹配场景下的专家数量 */
export function countByScene(
  groups: AgentExpertGroupInfo[],
  sceneTags: string[]
): number {
  return groups.filter(g => {
    if (g.tags?.some(t => sceneTags.some(st => t.includes(st) || st.includes(t)))) {
      return true
    }
    const text = [g.name, g.description, g.mainRole?.name].filter(Boolean).join(' ')
    return sceneTags.some(st => text.includes(st))
  }).length
}
