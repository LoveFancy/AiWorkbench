import { describe, expect, test } from 'bun:test'
import { isValidAgentPromptContent } from './claude-agent-adapter'

describe('Claude Agent prompt content 校验', () => {
  test('接受纯文本和合法图片内容块', () => {
    expect(isValidAgentPromptContent('你好')).toBe(true)
    expect(isValidAgentPromptContent([
      { type: 'text', text: '看图' },
      {
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/png',
          data: 'aGVsbG8=',
        },
      },
    ])).toBe(true)
  })

  test('拒绝非法图片内容块', () => {
    expect(isValidAgentPromptContent([])).toBe(false)
    expect(isValidAgentPromptContent([{ type: 'text' }])).toBe(false)
    expect(isValidAgentPromptContent([
      {
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/bmp',
          data: 'aGVsbG8=',
        },
      },
    ])).toBe(false)
  })
})
