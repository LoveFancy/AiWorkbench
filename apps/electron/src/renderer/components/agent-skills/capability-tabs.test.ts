import { expect, test } from 'bun:test'
import { getCapabilityTabs } from './capability-tabs'

test('能力页菜单展示专家、技能、连接器，并沿用现有计数', () => {
  expect(getCapabilityTabs({ experts: 3, skills: 21, connectors: 2 })).toEqual([
    { value: 'experts', label: '专家', count: 3 },
    { value: 'skills', label: '技能', count: 21 },
    { value: 'connectors', label: '连接器', count: 2 },
  ])
})
