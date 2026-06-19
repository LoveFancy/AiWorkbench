import type { AgentExpertGroupInfo, AgentSessionMeta } from '@proma/shared'

export const DEFAULT_EXPERT_ENTRY_LABEL = 'WorkMate专家'

export function getExpertSummonDisplayName(
  session: AgentSessionMeta | undefined,
  groups: AgentExpertGroupInfo[],
): string {
  if (!session?.expertGroupId) return DEFAULT_EXPERT_ENTRY_LABEL

  const group = groups.find((item) => (
    item.id === session.expertGroupId &&
    (!session.expertPluginId || item.sourcePluginId === session.expertPluginId)
  ))
  if (group) return group.name

  const titlePrefix = session.title.split(' · ')[0]?.trim()
  return titlePrefix || DEFAULT_EXPERT_ENTRY_LABEL
}
