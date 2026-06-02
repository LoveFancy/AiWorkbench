import { describe, expect, test } from 'bun:test'
import type { AgentPluginInfo, WorkspaceMcpConfig } from '@proma/shared'

import { getWorkspaceCapabilitiesFromSources } from './agent-workspace-manager.ts'

function pluginWithSkill(id: string, skillName: string, enabled = true): AgentPluginInfo {
  return {
    id,
    kind: 'user',
    name: id,
    version: '1.0.0',
    keywords: [],
    path: `/tmp/${id}`,
    enabled,
    capabilities: [
      {
        type: 'skill',
        name: skillName,
        sourcePluginId: id,
        sourceLabel: id,
        relativePath: `skills/${skillName}`,
        description: `${skillName} 描述`,
        enabled,
      },
    ],
    issues: [],
  }
}

describe('Agent 工作区能力聚合', () => {
  test('合并已启用插件中的 Skill，供 slash 补全使用', () => {
    const capabilities = getWorkspaceCapabilitiesFromSources({
      workspaceSlug: 'default',
      mcpConfig: { servers: {} } satisfies WorkspaceMcpConfig,
      workspaceSkills: [],
      plugins: [pluginWithSkill('user:ecc/claude-api', 'claude-api')],
    })

    expect(capabilities.skills).toContainEqual({
      slug: 'claude-api',
      name: 'claude-api',
      description: 'claude-api 描述',
      enabled: true,
    })
  })

  test('忽略已禁用或有错误的插件 Skill', () => {
    const capabilities = getWorkspaceCapabilitiesFromSources({
      workspaceSlug: 'default',
      mcpConfig: { servers: {} } satisfies WorkspaceMcpConfig,
      workspaceSkills: [],
      plugins: [
        pluginWithSkill('user:ecc/disabled', 'disabled', false),
        {
          ...pluginWithSkill('user:ecc/broken', 'broken'),
          issues: [{ level: 'error', message: '插件损坏' }],
        },
      ],
    })

    expect(capabilities.skills).toEqual([])
  })
})
