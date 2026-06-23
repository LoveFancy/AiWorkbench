import { describe, expect, test } from 'bun:test'

import {
  scrubDocumentBlocks,
  buildPostToolUseDocumentScrubOutput,
} from './agent-tool-document-scrub'

describe('scrubDocumentBlocks', () => {
  // ── 纯字符串 / 纯文本块：原样返回 ──

  test('字符串结果原样返回', () => {
    const result = scrubDocumentBlocks('Read 成功：file.txt')
    expect(result.hit).toBe(false)
    expect(result.output).toBe('Read 成功：file.txt')
  })

  test('纯文本块数组原样返回', () => {
    const result = scrubDocumentBlocks([
      { type: 'text', text: 'hello' },
      { type: 'text', text: 'world' },
    ])
    expect(result.hit).toBe(false)
    expect(result.output).toEqual([
      { type: 'text', text: 'hello' },
      { type: 'text', text: 'world' },
    ])
  })

  test('image 块保留不拦截', () => {
    const result = scrubDocumentBlocks([
      { type: 'text', text: 'PDF file read: doc.pdf (124.6KB)' },
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'abc' } },
    ])
    expect(result.hit).toBe(false)
    expect(result.output).toEqual([
      { type: 'text', text: 'PDF file read: doc.pdf (124.6KB)' },
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'abc' } },
    ])
  })

  // ── document 块剥离 ──

  test('单个 document 块被剥离', () => {
    const result = scrubDocumentBlocks([
      { type: 'text', text: 'PDF file read: file.pdf' },
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'JVBER...' } },
    ])
    expect(result.hit).toBe(true)
    expect(result.output).toEqual([
      { type: 'text', text: 'PDF file read: file.pdf' },
    ])
  })

  test('多个 document 块全部剥离', () => {
    const result = scrubDocumentBlocks([
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'a' } },
      { type: 'text', text: 'middle' },
      { type: 'document', source: { type: 'base64', media_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', data: 'b' } },
    ])
    expect(result.hit).toBe(true)
    expect(result.output).toEqual([
      { type: 'text', text: 'middle' },
    ])
  })

  test('全部是 document 块，输出空数组', () => {
    const result = scrubDocumentBlocks([
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'x' } },
    ])
    expect(result.hit).toBe(true)
    expect(result.output).toEqual([])
  })

  test('tool_result 块中嵌套 document 被剥离', () => {
    const result = scrubDocumentBlocks([
      {
        type: 'tool_result',
        tool_use_id: 'call_123',
        content: [
          { type: 'text', text: 'some text' },
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'pdf' } },
        ],
      },
    ])
    expect(result.hit).toBe(true)
    const output = result.output as Array<Record<string, unknown>>
    expect(output).toHaveLength(1)
    const content = (output[0] as Record<string, unknown>).content as Array<Record<string, unknown>>
    expect(content).toHaveLength(1)
    expect(content[0]!.type).toBe('text')
  })

  test('{ content: [...] } 包装结构中的 document 被剥离', () => {
    const result = scrubDocumentBlocks({
      content: [
        { type: 'text', text: 'hello' },
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'x' } },
      ],
    })
    expect(result.hit).toBe(true)
    const output = result.output as Record<string, unknown>
    const content = output.content as Array<Record<string, unknown>>
    expect(content).toHaveLength(1)
    expect(content[0]!.type).toBe('text')
  })

  // ── 边界：未知结构安全保守 ──

  test('数字原样返回', () => {
    const result = scrubDocumentBlocks(42)
    expect(result.hit).toBe(false)
    expect(result.output).toBe(42)
  })

  test('null 原样返回', () => {
    const result = scrubDocumentBlocks(null)
    expect(result.hit).toBe(false)
    expect(result.output).toBe(null)
  })

  test('undefined 原样返回', () => {
    const result = scrubDocumentBlocks(undefined)
    expect(result.hit).toBe(false)
    expect(result.output).toBe(undefined)
  })

  test('空数组原样返回', () => {
    const result = scrubDocumentBlocks([])
    expect(result.hit).toBe(false)
    expect(result.output).toEqual([])
  })

  test('非数组对象（无 content 字段）原样返回', () => {
    const result = scrubDocumentBlocks({ foo: 'bar' })
    expect(result.hit).toBe(false)
    expect(result.output).toEqual({ foo: 'bar' })
  })

  test('content 为非数组的对象原样返回', () => {
    const result = scrubDocumentBlocks({ content: 'just a string' })
    expect(result.hit).toBe(false)
    expect(result.output).toEqual({ content: 'just a string' })
  })

  // ── 深层嵌套递归剥离 ──

  test('深层嵌套中的 document 被剥离', () => {
    const result = scrubDocumentBlocks({
      content: [
        {
          type: 'tool_result',
          content: [
            { type: 'text', text: 'nested' },
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'x' } },
          ],
        },
      ],
    })
    expect(result.hit).toBe(true)
    const output = result.output as Record<string, unknown>
    const content = output.content as Array<Record<string, unknown>>
    const inner = (content[0] as Record<string, unknown>).content as Array<Record<string, unknown>>
    expect(inner).toHaveLength(1)
    expect(inner[0]!.type).toBe('text')
  })

  test('混合：text + document + image 保留非 document 块', () => {
    const result = scrubDocumentBlocks([
      { type: 'text', text: 'a' },
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'x' } },
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'y' } },
      { type: 'text', text: 'b' },
    ])
    expect(result.hit).toBe(true)
    expect(result.output).toEqual([
      { type: 'text', text: 'a' },
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'y' } },
      { type: 'text', text: 'b' },
    ])
  })
})

describe('buildPostToolUseDocumentScrubOutput', () => {
  test('未命中时返回 null', () => {
    const output = buildPostToolUseDocumentScrubOutput({ hit: false, output: 'ok' })
    expect(output).toBeNull()
  })

  test('命中时返回 updatedToolOutput 含引导文本', () => {
    const output = buildPostToolUseDocumentScrubOutput({
      hit: true,
      output: [{ type: 'text', text: 'PDF file read: doc.pdf' }],
    })
    expect(output).not.toBeNull()
    expect(output!.continue).toBe(true)
    expect(output!.hookSpecificOutput.hookEventName).toBe('PostToolUse')
    const updated = output!.hookSpecificOutput.updatedToolOutput as Array<Record<string, unknown>>
    // 应包含原始 text 块 + 追加的引导文本块
    const textBlocks = updated.filter((b: Record<string, unknown>) => b.type === 'text')
    expect(textBlocks.length).toBeGreaterThanOrEqual(2)
    const guideText = textBlocks[textBlocks.length - 1]!.text as string
    expect(guideText).toContain('document')
    expect(guideText).toContain('pdftotext')
  })

  test('命中时追加的引导文本包含 document 类型提示', () => {
    const result = buildPostToolUseDocumentScrubOutput({
      hit: true,
      output: [],
    })
    expect(result).not.toBeNull()
    const updated = result!.hookSpecificOutput.updatedToolOutput as Array<Record<string, unknown>>
    // 即使是空数组，也应追加引导文本
    expect(updated.length).toBe(1)
    const guideText = (updated[0] as Record<string, unknown>).text as string
    expect(guideText).toContain('document')
    expect(guideText).toContain('bash')
    expect(guideText).toContain('image')
  })
})