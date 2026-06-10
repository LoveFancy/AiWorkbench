import { describe, expect, test } from 'bun:test'

import type { ObservabilityEventItem } from '../../types/workmate.ts'
import {
  getSerializedEventBytes,
  normalizeObservabilityEvent,
  upsertDiskCacheContent,
} from './observability-event-utils.ts'

function baseEvent(overrides: Partial<ObservabilityEventItem> = {}): ObservabilityEventItem {
  return {
    eventId: 'event-1',
    type: 'error',
    userId: 'u1',
    timestamp: 1710000000000,
    result: 'failure',
    error: {
      type: 'Error',
      message: 'message',
      stack: 'stack',
    },
    client: {
      appVersion: '1.0.0',
      platform: 'win32',
      osVersion: '10.0',
    },
    ...overrides,
  }
}

describe('观测上报事件处理', () => {
  test('入队前会裁剪超长字符串并按真实 UTF-8 字节计算大小', () => {
    const event = baseEvent({
      question: '你'.repeat(20_000),
      error: {
        type: 'Error',
        message: '错'.repeat(20_000),
        stack: 'stack-line\n'.repeat(20_000),
      },
      tags: {
        source: 'renderer',
        componentStack: '组件'.repeat(20_000),
      },
    })

    const normalized = normalizeObservabilityEvent(event)

    expect(normalized.question!.length).toBeLessThan(event.question!.length)
    expect(normalized.error!.message.length).toBeLessThan(event.error!.message.length)
    expect(normalized.error!.stack!.length).toBeLessThan(event.error!.stack!.length)
    expect(normalized.tags!.componentStack!.length).toBeLessThan(event.tags!.componentStack!.length)
    expect(getSerializedEventBytes(normalized)).toBe(Buffer.byteLength(JSON.stringify(normalized), 'utf8'))
  })

  test('磁盘缓存写入同一 eventId 时不会重复保存', () => {
    const existing = `${JSON.stringify(baseEvent({ eventId: 'event-1', question: 'old' }))}\n`
    const next = upsertDiskCacheContent(existing, [
      baseEvent({ eventId: 'event-1', question: 'new' }),
      baseEvent({ eventId: 'event-2', question: 'second' }),
    ])

    const events = next.trim().split('\n').map((line) => JSON.parse(line) as ObservabilityEventItem)
    expect(events.map((event) => event.eventId)).toEqual(['event-1', 'event-2'])
    expect(events[0]!.question).toBe('old')
    expect(events[1]!.question).toBe('second')
  })
})
