import { expect, test } from 'bun:test'
import { join } from 'node:path'
import type { AgentExpertGroupInfo } from '@proma/shared'
import { getExpertGroupIdentifierLabel } from './expert-group-card-labels'

const expertGroupCardSource = await Bun.file(join(import.meta.dir, 'ExpertGroupCard.tsx')).text()

const group: AgentExpertGroupInfo = {
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
}

test('专家团卡片展示专家团唯一 ID，而不是来源插件名', () => {
  expect(getExpertGroupIdentifierLabel(group)).toBe('architecture-decision-team')
})

test('内置专家团通过卡片标签提示来源', () => {
  expect(expertGroupCardSource).toContain("group.sourcePluginKind === 'builtin'")
  expect(expertGroupCardSource).toContain('内置')
})
