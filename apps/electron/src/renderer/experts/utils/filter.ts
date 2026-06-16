import type { AgentExpertGroupInfo } from '@proma/shared'
import { getExpertGroupSearchTerms } from '@/experts/card/subagents'

export function filterByTag(
  groups: AgentExpertGroupInfo[],
  tag: 'all' | 'followed' | 'recent' | 'available' | 'unavailable' | 'expert' | 'team' | 'not_downloaded',
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
    /** 不可用：排除 normal 和 remote 类条目 */
    case 'unavailable': return groups.filter(g => {
      if (g.status === 'available') return false
      return g.sourcePluginKind !== 'remote'
    })
    case 'expert': return groups.filter(g => g.expertType !== 'team')
    case 'team': return groups.filter(g => g.expertType === 'team' || (g.subagents && g.subagents.length > 0))
    /** 未下载：仅服务端未本地安装的 remote 条目 */
    case 'not_downloaded': return groups.filter(g =>
      g.sourcePluginKind === 'remote' && g.status !== 'available'
    )
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
