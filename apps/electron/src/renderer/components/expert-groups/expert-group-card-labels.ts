import type { AgentExpertGroupInfo } from '@proma/shared'

export function getExpertGroupIdentifierLabel(group: AgentExpertGroupInfo): string {
  return group.id
}
