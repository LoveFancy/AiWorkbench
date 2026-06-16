import { expect, test } from 'bun:test'
import type { AgentExpertGroupInfo, AgentSessionMeta } from '@proma/shared'
import { getExpertSummonDisplayName } from './summon-label'

const groups: AgentExpertGroupInfo[] = [
  {
    id: 'architecture-decision-team',
    name: '架构决策专家团',
    mainRole: { name: '主架构师', prompt: 'prompt' },
    sourcePluginId: 'builtin:architecture-decision-team',
    sourceLabel: '架构决策专家团',
    sourcePluginVersion: '1.0.0',
    sourcePluginKind: 'builtin',
    sourcePluginPath: '/plugins/architecture-decision-team',
    filePath: '/plugins/architecture-decision-team/expert-groups/architecture-decision-team.json',
    enabled: true,
    status: 'available',
    issues: [],
  },
]

test('无 session 时显示默认标签', () => {
  expect(getExpertSummonDisplayName(undefined, groups)).toBe('WorkMate专家')
})

test('有 expertGroupId 但无匹配 group 时回退 session.title', () => {
  const session: AgentSessionMeta = {
    id: '1',
    title: '我的标题 · 副标题',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    expertGroupId: 'nonexistent',
  }
  expect(getExpertSummonDisplayName(session, groups)).toBe('我的标题')
})

test('有匹配 group 时显示 group.name', () => {
  const session: AgentSessionMeta = {
    id: '1',
    title: '标题',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    expertGroupId: 'architecture-decision-team',
  }
  expect(getExpertSummonDisplayName(session, groups)).toBe('架构决策专家团')
})
