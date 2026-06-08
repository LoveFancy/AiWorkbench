import { expect, test } from 'bun:test'
import { getSettingsTabs } from './settings-tabs'

test('外观设置在设置页导航中可见', () => {
  const generalTabs = getSettingsTabs('chat')
  const agentTabs = getSettingsTabs('agent')

  expect(generalTabs.some((tab) => tab.id === 'appearance')).toBe(true)
  expect(agentTabs.some((tab) => tab.id === 'appearance')).toBe(true)
})

test('教程入口文案为使用教程', () => {
  const generalTabs = getSettingsTabs('chat')
  expect(generalTabs.find((tab) => tab.id === 'tutorial')?.label).toBe('使用教程')
})

test('关于更新入口在设置页导航中可见', () => {
  const generalTabs = getSettingsTabs('chat')
  const agentTabs = getSettingsTabs('agent')

  expect(generalTabs.find((tab) => tab.id === 'about')?.label).toBe('关于 / 更新')
  expect(agentTabs.find((tab) => tab.id === 'about')?.label).toBe('关于 / 更新')
})

test('Chat 工具入口在设置页导航中可见', () => {
  const generalTabs = getSettingsTabs('chat')
  const agentTabs = getSettingsTabs('agent')

  expect(generalTabs.find((tab) => tab.id === 'tools')?.label).toBe('Chat 工具')
  expect(agentTabs.find((tab) => tab.id === 'tools')?.label).toBe('Chat 工具')
})

test('用量日志入口在设置页导航中可见', () => {
  const generalTabs = getSettingsTabs('chat')
  const agentTabs = getSettingsTabs('agent')

  expect(generalTabs.find((tab) => tab.id === 'usage-log')?.label).toBe('用量日志')
  expect(agentTabs.find((tab) => tab.id === 'usage-log')?.label).toBe('用量日志')
})

test('Agent 模式下 Skill 和 MCP 配置入口文案正确', () => {
  const agentTabs = getSettingsTabs('agent')

  expect(agentTabs.find((tab) => tab.id === 'agent')?.label).toBe('SKILL/MCP')
})

test('Agent 模式下插件管理入口可见', () => {
  const generalTabs = getSettingsTabs('chat')
  const agentTabs = getSettingsTabs('agent')

  expect(generalTabs.some((tab) => tab.id === 'plugins')).toBe(false)
  expect(agentTabs.find((tab) => tab.id === 'plugins')?.label).toBe('插件管理')
})

test('Agent 模式下专家团入口可见', () => {
  const generalTabs = getSettingsTabs('chat')
  const agentTabs = getSettingsTabs('agent')

  expect(generalTabs.some((tab) => tab.id === 'experts')).toBe(false)
  expect(agentTabs.find((tab) => tab.id === 'experts')?.label).toBe('专家团')
})

test('隐藏非公开设置入口', () => {
  const hiddenTabIds = ['voice-input', 'bots', 'migration']
  const generalTabs = getSettingsTabs('chat')
  const agentTabs = getSettingsTabs('agent')

  for (const tabId of hiddenTabIds) {
    expect(generalTabs.some((tab) => tab.id === tabId)).toBe(false)
    expect(agentTabs.some((tab) => tab.id === tabId)).toBe(false)
  }
})
