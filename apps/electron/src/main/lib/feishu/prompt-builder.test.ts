import { expect, test } from 'bun:test'
import { buildAgentUserMessage } from './prompt-builder'

test('飞书用户消息前置说明不暴露 Proma 品牌词', () => {
  const message = buildAgentUserMessage({
    userText: '你好',
    context: {
      chatId: 'chat-1',
      chatType: 'group',
      senderOpenId: 'ou_1',
      senderName: '用户',
    },
  })

  expect(message).not.toContain('Proma')
  expect(message).not.toContain('proma')
  expect(message).toContain('你正在通过飞书机器人通道处理来自飞书的用户消息')
  expect(message).toContain('<user_message>\n你好\n</user_message>')
})
