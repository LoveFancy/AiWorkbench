import type { AgentExpertGroupInfo, AgentSessionMeta } from '@proma/shared'

export function getExpertSummonDisplayName(
  session: AgentSessionMeta | undefined,
  groups: AgentExpertGroupInfo[],
): string | null {
  if (!session?.expertGroupId) return null

  const group = groups.find((item) => (
    item.id === session.expertGroupId &&
    (!session.expertPluginId || item.sourcePluginId === session.expertPluginId)
  ))
  if (group) return group.name

  const titlePrefix = session.title.split(' · ')[0]?.trim()
  return titlePrefix || null
}
