import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'bun:test'

const agentViewSource = readFileSync(join(import.meta.dir, 'AgentView.tsx'), 'utf-8')
const agentMessagesSource = readFileSync(join(import.meta.dir, 'AgentMessages.tsx'), 'utf-8')

test('Agent 新发送消息进入当前轮次聚焦模式', () => {
  expect(agentViewSource).toContain('focusedUserMessageId')
  expect(agentViewSource).toContain('setFocusedUserMessageId(localUuid)')
  expect(agentViewSource).toContain('focusedUserMessageId={focusedUserMessageId}')
})

test('Agent 消息列表在流式期间锚定当前用户消息并添加临时留白', () => {
  expect(agentMessagesSource).toContain('CurrentTurnFocusController')
  expect(agentMessagesSource).toContain('CurrentTurnFocusSpacer')
  expect(agentMessagesSource).toContain('focusedUserMessageId')
  expect(agentMessagesSource).toContain('data-current-turn-focus-spacer')
  expect(agentMessagesSource).toContain('h-[78vh] min-h-[560px] max-h-[960px]')
  expect(agentMessagesSource).toContain('data-current-turn-focus-anchor')
  expect(agentMessagesSource).toContain('focusVersion={currentTurnFocusVersion}')
  expect(agentMessagesSource).toContain("el.scrollTo({ top: Math.max(0, scrollTarget), behavior: 'auto' })")
  expect(agentMessagesSource).toContain('onFocusedUserMessageConsumed')
})
