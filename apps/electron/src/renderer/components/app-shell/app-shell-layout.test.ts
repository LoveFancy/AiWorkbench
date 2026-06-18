import { expect, test } from 'bun:test'
import { shouldShowAgentRightPanel } from './app-shell-layout'

test('Agent 技能视图会隐藏右侧文件面板', () => {
  expect(shouldShowAgentRightPanel({
    appMode: 'agent',
    currentSessionId: 'session-1',
    automationFormOpen: false,
    activeView: 'agent-skills',
  })).toBe(false)
})

test('Agent 对话视图在有会话时显示右侧文件面板', () => {
  expect(shouldShowAgentRightPanel({
    appMode: 'agent',
    currentSessionId: 'session-1',
    automationFormOpen: false,
    activeView: 'conversations',
  })).toBe(true)
})
