import type { AgentPluginInfo, SkillMeta } from '@proma/shared'

export type InstalledCapability =
  | { type: 'plugin'; plugin: AgentPluginInfo }
  | { type: 'skill'; skill: SkillMeta }

function getInstalledTimestamp(value?: string): number {
  if (!value) return 0
  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) ? 0 : timestamp
}

function compareInstalledCapabilities(a: InstalledCapability, b: InstalledCapability): number {
  const aEnabled = a.type === 'plugin' ? a.plugin.enabled : a.skill.enabled
  const bEnabled = b.type === 'plugin' ? b.plugin.enabled : b.skill.enabled
  if (aEnabled !== bEnabled) return aEnabled ? -1 : 1

  const aInstalledAt = getInstalledTimestamp(a.type === 'plugin' ? a.plugin.installedAt : a.skill.installedAt)
  const bInstalledAt = getInstalledTimestamp(b.type === 'plugin' ? b.plugin.installedAt : b.skill.installedAt)
  if (aInstalledAt !== bInstalledAt) return bInstalledAt - aInstalledAt

  const aName = a.type === 'plugin' ? a.plugin.name : a.skill.name
  const bName = b.type === 'plugin' ? b.plugin.name : b.skill.name
  return aName.localeCompare(bName)
}

export function sortInstalledCapabilities(plugins: AgentPluginInfo[], skills: SkillMeta[]): InstalledCapability[] {
  return [
    ...plugins.map((plugin): InstalledCapability => ({ type: 'plugin', plugin })),
    ...skills.map((skill): InstalledCapability => ({ type: 'skill', skill })),
  ].sort(compareInstalledCapabilities)
}
