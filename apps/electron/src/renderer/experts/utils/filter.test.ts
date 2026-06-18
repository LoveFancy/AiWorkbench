import { expect, test } from 'bun:test'
import { filterByTag } from './filter'
import type { AgentExpertGroupInfo } from '@proma/shared'

function expertGroupFixture(overrides: Partial<AgentExpertGroupInfo>): AgentExpertGroupInfo {
  return {
    id: 'expert-1',
    name: '高考我帮你',
    description: 'desc',
    mainRole: { name: '主角色', prompt: 'prompt' },
    sourcePluginId: 'plugin-1',
    sourceLabel: '插件',
    sourcePluginVersion: '1.0.0',
    sourcePluginKind: 'user',
    sourcePluginPath: '/tmp/plugin-1',
    filePath: '/tmp/plugin-1/expert-groups/expert-1.json',
    enabled: true,
    status: 'available',
    issues: [],
    ...overrides,
  }
}

const expertGroup = expertGroupFixture({ expertType: 'agent' })
const teamGroup = expertGroupFixture({
  id: 'team-1',
  name: '架构决策专家团',
  expertType: 'team',
  subagents: ['a', 'b'],
})

test('专家筛选会把普通专家和专家团分开', () => {
  const groups = [expertGroup, teamGroup]
  expect(filterByTag(groups, 'expert', {}, {})).toEqual([expertGroup])
  expect(filterByTag(groups, 'team', {}, {})).toEqual([teamGroup])
})
