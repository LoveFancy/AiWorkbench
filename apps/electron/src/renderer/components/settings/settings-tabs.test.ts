import { expect, test } from 'bun:test'
import { getSettingsTabs } from './settings-tabs'

test('外观设置在设置页导航中可见', () => {
  const generalTabs = getSettingsTabs('chat')
  const agentTabs = getSettingsTabs('agent')

  expect(generalTabs.some((tab) => tab.id === 'appearance')).toBe(true)
  expect(agentTabs.some((tab) => tab.id === 'appearance')).toBe(true)
})

test('教程入口不在公开设置页导航中显示', () => {
  const generalTabs = getSettingsTabs('chat')
  expect(generalTabs.some((tab) => tab.id === 'tutorial')).toBe(false)
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

test('远程连接入口在设置页导航中可见', () => {
  const generalTabs = getSettingsTabs('chat')
  const agentTabs = getSettingsTabs('agent')

  expect(generalTabs.find((tab) => tab.id === 'bots')?.label).toBe('远程连接')
  expect(agentTabs.find((tab) => tab.id === 'bots')?.label).toBe('远程连接')
})

test('系统日志入口在设置页导航中可见', () => {
  const generalTabs = getSettingsTabs('chat')
  const agentTabs = getSettingsTabs('agent')

  expect(generalTabs.find((tab) => tab.id === 'system-log')?.label).toBe('系统日志')
  expect(agentTabs.find((tab) => tab.id === 'system-log')?.label).toBe('系统日志')
  expect(generalTabs.at(-1)?.id).toBe('system-log')
  expect(agentTabs.at(-1)?.id).toBe('system-log')
})

test('Agent 模式下 Agent 配置入口文案正确', () => {
  const agentTabs = getSettingsTabs('agent')

  expect(agentTabs.find((tab) => tab.id === 'agent')?.label).toBe('Agent 配置')
})

test('Agent 模式下插件管理入口可见', () => {
  const generalTabs = getSettingsTabs('chat')
  const agentTabs = getSettingsTabs('agent')

  expect(generalTabs.some((tab) => tab.id === 'plugins')).toBe(false)
  expect(agentTabs.find((tab) => tab.id === 'plugins')?.label).toBe('插件管理')
})

test('Agent 模式下专家团入口已从设置中移除（移至侧边栏）', () => {
  const generalTabIds = getSettingsTabs('chat').map((tab) => tab.id as string)
  const agentTabIds = getSettingsTabs('agent').map((tab) => tab.id as string)

  expect(generalTabIds.includes('experts')).toBe(false)
  expect(agentTabIds.includes('experts')).toBe(false)
})

test('隐藏非公开设置入口', () => {
  const hiddenTabIds = ['voice-input', 'migration', 'usage-log']
  const generalTabs = getSettingsTabs('chat')
  const agentTabs = getSettingsTabs('agent')

  for (const tabId of hiddenTabIds) {
    expect(generalTabs.some((tab) => tab.id === tabId)).toBe(false)
    expect(agentTabs.some((tab) => tab.id === tabId)).toBe(false)
  }
})
