import type { AgentExpertGroupInfo } from '@proma/shared'

export function getExpertSubagentLabel(group: AgentExpertGroupInfo, agentName: string): string {
  return group.subagentLabels?.[agentName] ?? agentName
}

export function getExpertGroupSearchTerms(group: AgentExpertGroupInfo): string[] {
  return [
    group.name,
    group.description,
    group.mainRole.name,
    group.sourceLabel,
    ...(group.tags ?? []),
    ...(group.subagents ?? []),
    ...Object.values(group.subagentLabels ?? {}),
    ...(group.skills ?? []),
  ].filter((item): item is string => typeof item === 'string')
}
