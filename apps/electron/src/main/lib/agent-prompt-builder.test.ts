import { describe, expect, test } from 'bun:test'

import { buildSystemPrompt } from './agent-prompt-builder.ts'
import { BUILTIN_DEFAULT_PROMPT_STRING } from '@proma/shared'

describe('系统根提示词', () => {
  test('Agent 根提示词要求可见思考过程优先使用中文', () => {
    const prompt = buildSystemPrompt({
      sessionId: 'test-session',
      permissionMode: 'bypassPermissions',
      memoryEnabled: false,
      claudeAvailable: true,
    })

    expect(prompt).toContain('可见思考过程、推理摘要和最终回复都优先使用中文')
    expect(prompt).toContain('## 语言规则')
    expect(prompt).toContain('`thinking`、`thinking block`、`reasoning`')
    expect(prompt.indexOf('## 语言规则')).toBeLessThan(prompt.indexOf('## 工具使用指南'))
  })

  test('Chat 内置提示词要求可见思考过程优先使用中文', () => {
    expect(BUILTIN_DEFAULT_PROMPT_STRING).toContain('可见思考过程、推理摘要和最终回复都优先使用中文')
    expect(BUILTIN_DEFAULT_PROMPT_STRING).toContain('`thinking`、`thinking block`、`reasoning`')
  })
})
