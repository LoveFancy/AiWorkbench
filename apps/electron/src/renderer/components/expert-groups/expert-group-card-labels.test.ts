import { expect, test } from 'bun:test'
import type { AgentExpertGroupInfo } from '@proma/shared'
import { getExpertGroupIdentifierLabel } from './expert-group-card-labels'

const group: AgentExpertGroupInfo = {
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

test('专家团卡片展示专家团唯一 ID，而不是来源插件名', () => {
  expect(getExpertGroupIdentifierLabel(group)).toBe('architecture-decision-team')
})
