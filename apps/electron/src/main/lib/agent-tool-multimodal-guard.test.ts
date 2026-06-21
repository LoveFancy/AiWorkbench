import { describe, expect, test } from 'bun:test'

import {
  buildPreToolUseMultimodalGuardOutput,
  getBlockedMultimodalToolUse,
} from './agent-tool-multimodal-guard'

describe('agent tool multimodal guard', () => {
  test('非多模态模型禁止 Read 读取 PDF', () => {
    const blocked = getBlockedMultimodalToolUse({
      toolName: 'Read',
      input: { file_path: '/workspace/产品经理_数据.pdf' },
      supportsMultimodal: false,
    })

    expect(blocked?.path).toBe('/workspace/产品经理_数据.pdf')
    expect(blocked?.message).toContain('当前 Agent 模型不支持多模态')
    expect(blocked?.message).toContain('PDF')
  })

  test('非多模态模型禁止 Read 读取会被转为 base64 的二进制文件', () => {
    const blocked = getBlockedMultimodalToolUse({
      toolName: 'Read',
      input: { file_path: '/workspace/report.docx' },
      supportsMultimodal: false,
    })

    expect(blocked?.path).toBe('/workspace/report.docx')
    expect(blocked?.message).toContain('base64')
  })

  test('非多模态模型禁止 Read 显式请求 base64 输出', () => {
    const blocked = getBlockedMultimodalToolUse({
      toolName: 'Read',
      input: { file_path: '/workspace/archive.bin', output_format: 'base64' },
      supportsMultimodal: false,
    })

    expect(blocked?.path).toBe('/workspace/archive.bin')
    expect(blocked?.message).toContain('base64')
  })

  test('多模态模型允许 Read 读取 PDF，文本文件不受限制', () => {
    expect(getBlockedMultimodalToolUse({
      toolName: 'Read',
      input: { file_path: '/workspace/report.pdf' },
      supportsMultimodal: true,
    })).toBeNull()

    expect(getBlockedMultimodalToolUse({
      toolName: 'Read',
      input: { file_path: '/workspace/readme.md' },
      supportsMultimodal: false,
    })).toBeNull()
  })

  test('PreToolUse 输出 deny，阻止 SDK 在 bypassPermissions 下直接执行', () => {
    const output = buildPreToolUseMultimodalGuardOutput({
      toolName: 'Read',
      input: { file_path: '/workspace/image.png' },
      supportsMultimodal: false,
    })

    expect(output?.continue).toBe(false)
    expect(output?.hookSpecificOutput?.permissionDecision).toBe('deny')
    expect(output?.hookSpecificOutput?.hookEventName).toBe('PreToolUse')
  })
})
