import { expect, test } from 'bun:test'
import type { AgentExpertGroupInfo, AgentSessionMeta } from '@proma/shared'
import { getExpertSummonDisplayName } from './expert-summon-label'

const baseSession: AgentSessionMeta = {
  id: 'session-1',
  title: '新 Agent 会话',
  createdAt: 1,
  updatedAt: 1,
}

const architectureGroup: AgentExpertGroupInfo = {
  id: 'architecture-decision-team',
  name: '架构决策专家团',
  mainRole: { name: '主架构师', prompt: 'prompt' },
  sourcePluginId: 'builtin:workmate-experts',
  sourceLabel: 'workmate-experts',
  sourcePluginVersion: '1.0.0',
  sourcePluginKind: 'builtin',
  sourcePluginPath: '/plugins/workmate-experts',
  filePath: '/plugins/workmate-experts/expert-groups/architecture-decision-team.json',
  enabled: true,
  status: 'available',
  issues: [],
}

test('普通会话显示默认 WorkMate 专家入口', () => {
  expect(getExpertSummonDisplayName(baseSession, [architectureGroup])).toBe('WorkMate专家')
})

test('专家会话显示绑定的专家团名称', () => {
  expect(getExpertSummonDisplayName({
    ...baseSession,
    expertGroupId: 'architecture-decision-team',
    expertPluginId: 'builtin:workmate-experts',
  }, [architectureGroup])).toBe('架构决策专家团')
})
