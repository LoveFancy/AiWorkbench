import { describe, expect, test } from 'bun:test'
import { getAgentUserDisplayText } from './bridge-message-display'

describe('飞书 bridge 消息展示文本', () => {
  test('Given 飞书 bridge XML When 展示用户消息 Then 只展示 user_message 内容', () => {
    const content = [
      '<!-- bridge prelude -->',
      '<bridge_context>',
      'chat_id: oc_123',
      'chat_type: p2p',
      'sender_id: ou_123',
      '</bridge_context>',
      '',
      '<user_message>',
      '你好',
      '</user_message>',
    ].join('\n')

    expect(getAgentUserDisplayText(content)).toBe('你好')
  })

  test('Given 普通用户消息 When 展示用户消息 Then 保持原文', () => {
    expect(getAgentUserDisplayText('帮我总结这份文档')).toBe('帮我总结这份文档')
  })

  test('Given 飞书 bridge 附件消息 When 展示用户消息 Then 保留附件块供后续解析', () => {
    const content = [
      '<bridge_context>',
      'chat_id: oc_123',
      'chat_type: p2p',
      'sender_id: ou_123',
      '</bridge_context>',
      '',
      '<attached_files>',
      '- test.png: /tmp/test.png',
      '</attached_files>',
      '',
      '<user_message>',
      '看下这张图',
      '</user_message>',
    ].join('\n')

    expect(getAgentUserDisplayText(content)).toBe([
      '<attached_files>',
      '- test.png: /tmp/test.png',
      '</attached_files>',
      '',
      '看下这张图',
    ].join('\n'))
  })
})
