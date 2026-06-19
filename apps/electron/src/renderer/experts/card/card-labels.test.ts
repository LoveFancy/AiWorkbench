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

test('专家卡片展示名称和主角色', () => {
  expect(expertCardSource).toContain('{group.name}')
  expect(expertCardSource).toContain('主角色：{group.mainRole.name')
})

test('专家卡片不展示可用或不可用状态', () => {
  expect(expertCardSource).not.toContain('ExpertStatusBadge')
  expect(expertCardSource).not.toContain('可用')
  expect(expertCardSource).not.toContain('不可用')
})

test('卡片支持关注（Star 按钮）', () => {
  expect(expertCardSource).toContain('followedExpertGroupsAtom')
  expect(expertCardSource).toContain('toggleFollow')
})

test('专家卡片操作按钮默认隐藏并在 hover 时显示', () => {
  expect(expertCardSource).toContain('group-hover:opacity-100')
  expect(expertCardSource).toContain('group-hover:pointer-events-auto')
})

test('专家卡片已收藏后星标常驻显示', () => {
  expect(expertCardSource).toContain('size-[26px]')
  expect(expertCardSource).toContain('rounded-bl-lg rounded-tr-xl')
  expect(expertCardSource).toContain("isFollowed && 'text-yellow-500'")
  expect(expertCardSource).toContain("isFollowed && 'fill-yellow-500 text-yellow-500'")
})

test('专家卡片不展示底部能力统计和插件目录', () => {
  expect(expertCardSource).not.toContain('capabilityItems')
  expect(expertCardSource).not.toContain('打开目录')
})

test('专家卡片字号和密度对齐 Agent 技能卡片', () => {
  expect(expertCardSource).toContain('rounded-xl border border-border/60 bg-content-area p-4')
  expect(expertCardSource).toContain('truncate text-sm font-medium text-foreground')
  expect(expertCardSource).toContain('mt-0.5 truncate text-xs text-muted-foreground')
  expect(expertCardSource).toContain('line-clamp-2 min-h-[40px] text-[13px] leading-6 text-muted-foreground')
  expect(expertCardSource).toContain('rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground')
})
