import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'

const messageSource = await Bun.file(join(import.meta.dir, 'message.tsx')).text()
const chatMessageItemSource = await Bun.file(join(import.meta.dir, '..', 'chat', 'ChatMessageItem.tsx')).text()
const sdkMessageRendererSource = await Bun.file(join(import.meta.dir, '..', 'agent', 'SDKMessageRenderer.tsx')).text()

describe('消息模式标识', () => {
  test('Chat 和 Agent 用户消息头部使用低调的模式标识', () => {
    expect(messageSource).toContain('export function MessageModeBadge')
    expect(messageSource).toContain('text-foreground/[0.38]')
    expect(chatMessageItemSource).toContain('<MessageModeBadge mode="Chat" />')
    expect(sdkMessageRendererSource).toContain('<MessageModeBadge mode="Agent" />')
  })
})
