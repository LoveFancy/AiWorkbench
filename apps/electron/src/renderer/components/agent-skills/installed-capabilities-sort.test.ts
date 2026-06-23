import { expect, test } from 'bun:test'
import type { AgentPluginInfo, SkillMeta } from '@proma/shared'
import { sortInstalledCapabilities } from './installed-capabilities'

function plugin(id: string, enabled: boolean, installedAt: string): AgentPluginInfo {
  return {
    id,
    kind: 'user',
    name: id,
    version: '1.0.0',
    keywords: [],
    path: `/tmp/${id}`,
    enabled,
    installedAt,
    category: 'general',
    capabilities: [],
    issues: [],
  }
}

function skill(slug: string, enabled: boolean, installedAt: string): SkillMeta {
  return {
    slug,
    name: slug,
    enabled,
    installedAt,
    sourceKind: 'workspace',
  }
}

test('已安装技能列表优先展示已启用项，并在分组内按安装时间倒序排列', () => {
  const sorted = sortInstalledCapabilities(
    [
      plugin('old-enabled-plugin', true, '2026-01-01T00:00:00.000Z'),
      plugin('new-disabled-plugin', false, '2026-06-01T00:00:00.000Z'),
    ],
    [
      skill('new-enabled-skill', true, '2026-05-01T00:00:00.000Z'),
      skill('old-disabled-skill', false, '2026-02-01T00:00:00.000Z'),
    ],
  )

  expect(sorted.map((item) => item.type === 'plugin' ? item.plugin.id : item.skill.slug)).toEqual([
    'new-enabled-skill',
    'old-enabled-plugin',
    'new-disabled-plugin',
    'old-disabled-skill',
  ])
})
