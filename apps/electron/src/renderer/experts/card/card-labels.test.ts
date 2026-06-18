import { expect, test } from 'bun:test'
import { join } from 'node:path'
import type { AgentExpertGroupInfo } from '@proma/shared'
import { getExpertGroupIdentifierLabel } from './card-labels'

const expertCardSource = await Bun.file(join(import.meta.dir, 'ExpertCard.tsx')).text()

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
  expect(expertCardSource).toContain("group.sourcePluginKind === 'builtin'")
  expect(expertCardSource).toContain('内置')
})

test('卡片支持关注（Star 按钮）', () => {
  expect(expertCardSource).toContain('followedExpertGroupsAtom')
  expect(expertCardSource).toContain('toggleFollow')
})
