import { describe, expect, test } from 'bun:test'

import { normalizeRendererErrorPayload } from './observability-ipc-handler.ts'

describe('渲染进程错误 IPC 入参清洗', () => {
  test('拒绝非对象或缺少 message 的 payload', () => {
    expect(normalizeRendererErrorPayload(null)).toBeNull()
    expect(normalizeRendererErrorPayload('boom')).toBeNull()
    expect(normalizeRendererErrorPayload({ name: 'Error' })).toBeNull()
  })

  test('只接受字符串字段并截断超长内容', () => {
    const normalized = normalizeRendererErrorPayload({
      name: 'X'.repeat(500),
      message: 'M'.repeat(20_000),
      stack: 'S'.repeat(100_000),
      componentStack: 'C'.repeat(100_000),
      ignored: 'field',
    })

    expect(normalized).not.toBeNull()
    expect(normalized!.name.length).toBeLessThan(500)
    expect(normalized!.message.length).toBeLessThan(20_000)
    expect(normalized!.stack!.length).toBeLessThan(100_000)
    expect(normalized!.componentStack!.length).toBeLessThan(100_000)
    expect(Object.keys(normalized!)).toEqual(['name', 'message', 'stack', 'componentStack'])
  })
})
