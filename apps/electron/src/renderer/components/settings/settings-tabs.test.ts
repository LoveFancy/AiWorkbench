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

test('隐藏非公开设置入口', () => {
  const hiddenTabIds = ['tools', 'voice-input', 'bots', 'migration', 'about']
  const generalTabs = getSettingsTabs('chat')
  const agentTabs = getSettingsTabs('agent')

  for (const tabId of hiddenTabIds) {
    expect(generalTabs.some((tab) => tab.id === tabId)).toBe(false)
    expect(agentTabs.some((tab) => tab.id === tabId)).toBe(false)
  }
})
