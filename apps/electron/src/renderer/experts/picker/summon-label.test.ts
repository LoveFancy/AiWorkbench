import { expect, test } from 'bun:test'
import { join } from 'node:path'
import type { AgentExpertGroupInfo, AgentSessionMeta } from '@proma/shared'
import { getExpertSummonDisplayName } from './summon-label'
import { getRecentExpertGroups } from './ExpertSummonButton'

const expertSummonButtonSource = await Bun.file(join(import.meta.dir, 'ExpertSummonButton.tsx')).text()

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
  {
    id: 'document-team',
    name: '文档处理专家',
    mainRole: { name: '文档专家', prompt: 'prompt' },
    sourcePluginId: 'builtin:document-team',
    sourceLabel: '文档处理专家',
    sourcePluginVersion: '1.0.0',
    sourcePluginKind: 'builtin',
    sourcePluginPath: '/plugins/document-team',
    filePath: '/plugins/document-team/expert-groups/document-team.json',
    enabled: true,
    status: 'available',
    issues: [],
  },
  {
    id: 'broken-team',
    name: '不可用专家',
    mainRole: { name: '故障专家', prompt: 'prompt' },
    sourcePluginId: 'builtin:broken-team',
    sourceLabel: '不可用专家',
    sourcePluginVersion: '1.0.0',
    sourcePluginKind: 'builtin',
    sourcePluginPath: '/plugins/broken-team',
    filePath: '/plugins/broken-team/expert-groups/broken-team.json',
    enabled: true,
    status: 'error',
    issues: [{ level: 'error', message: '配置错误' }],
  },
]

test('无 session 时不展示默认专家团名称', () => {
  expect(getExpertSummonDisplayName(undefined, groups)).toBeNull()
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

test('输入框专家入口默认只展示图标，有名称时才展示文字', () => {
  expect(expertSummonButtonSource).toContain('const showComposerLabel = variant ===')
  expect(expertSummonButtonSource).toContain('showComposerLabel ?')
  expect(expertSummonButtonSource).toContain('{showComposerLabel &&')
})

test('输入框专家入口使用按钮上方的小弹窗，不再打开居中选择弹窗', () => {
  expect(expertSummonButtonSource).toContain('PopoverContent')
  expect(expertSummonButtonSource).toContain('最近召唤专家')
  expect(expertSummonButtonSource).toContain('召唤其它专家')
  expect(expertSummonButtonSource).toContain("variant === 'composer'")
  expect(expertSummonButtonSource).toContain('return renderComposerPicker()')
})

test('最近召唤专家按使用时间排序，并过滤不可召唤的本地专家', () => {
  const result = getRecentExpertGroups(groups, {
    'architecture-decision-team': 100,
    'document-team': 300,
    'broken-team': 500,
  })
  expect(result.map((group) => group.id)).toEqual(['document-team', 'architecture-decision-team'])
})
