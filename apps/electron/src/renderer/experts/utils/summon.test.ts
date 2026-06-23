import { expect, test } from 'bun:test'
import type { AgentExpertGroupInfo, AgentExpertGroupStatus } from '@proma/shared'
import { isCardSummonActionable, isRemoteSourced, isSummonableLocal } from './summon'

function makeGroup(overrides: Partial<AgentExpertGroupInfo> = {}): AgentExpertGroupInfo {
  return {
    id: 'product-team',
    name: '产品专家团',
    mainRole: { name: '产品负责人', prompt: 'prompt' },
    sourcePluginId: 'user:remote/product-team',
    sourceLabel: '产品专家团',
    sourcePluginVersion: '1.0.0',
    sourcePluginKind: 'user',
    sourcePluginPath: '/plugins/product-team',
    filePath: '/plugins/product-team/expert-groups/product-team.json',
    enabled: true,
    status: 'available',
    issues: [],
    ...overrides,
  }
}

test('远程下载来源（user:remote/*）判定为可自动升级', () => {
  expect(isRemoteSourced(makeGroup({ sourcePluginId: 'user:remote/product-team' }))).toBe(true)
})

test('用户上传来源（user:local/*）不参与自动升级', () => {
  expect(isRemoteSourced(makeGroup({ sourcePluginId: 'user:local/product-team' }))).toBe(false)
})

test('内置来源（builtin:*）不参与自动升级', () => {
  expect(isRemoteSourced(makeGroup({ sourcePluginId: 'builtin:architecture-decision-team' }))).toBe(false)
})

test('available 状态可进入召唤流程', () => {
  expect(isSummonableLocal(makeGroup({ status: 'available' }))).toBe(true)
})

test('remote_update_available 状态可进入召唤流程（不被拦截）', () => {
  expect(isSummonableLocal(makeGroup({ status: 'remote_update_available' }))).toBe(true)
})

test('其它异常状态不进入本地召唤流程', () => {
  expect(isSummonableLocal(makeGroup({ status: 'plugin_disabled' }))).toBe(false)
  expect(isSummonableLocal(makeGroup({ status: 'remote_not_downloaded' }))).toBe(false)
})

test('卡片召唤按钮：本地可召唤 + 可下载状态均可点击', () => {
  expect(isCardSummonActionable('available')).toBe(true)
  // 回归用例：已下载有更新的专家「召唤」按钮必须可点击
  expect(isCardSummonActionable('remote_update_available')).toBe(true)
  expect(isCardSummonActionable('remote_not_downloaded')).toBe(true)
  expect(isCardSummonActionable('remote_downloading')).toBe(true)
})

test('卡片召唤按钮：异常/不可召唤状态禁用', () => {
  const disabled: AgentExpertGroupStatus[] = [
    'plugin_disabled',
    'plugin_uninstalled',
    'invalid_manifest',
    'missing_subagent',
    'missing_skill',
    'mcp_conflict',
    'remote_download_failed',
  ]
  for (const status of disabled) {
    expect(isCardSummonActionable(status)).toBe(false)
  }
})
