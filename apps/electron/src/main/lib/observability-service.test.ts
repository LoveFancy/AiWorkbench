import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import type { ObservabilityEventItem } from '../../types/workmate.ts'
import {
  getSerializedEventBytes,
  normalizeObservabilityEvent,
  upsertDiskCacheContent,
} from './observability-event-utils.ts'

// ============ Mock 依赖（供 reportEvent 登录拦截测试） ============

let mockLoggedIn = true
let mockTempDir = ''
const originalFetch = globalThis.fetch

mock.module('electron', () => ({
  app: { getVersion: () => '1.0.0' },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => Buffer.from(s, 'utf-8'),
    decryptString: (b: Buffer) => b.toString('utf-8'),
  },
}))

mock.module('./config-paths', () => ({
  getConfigDir: () => mockTempDir,
}))

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

describe('reportEvent 登录拦截', () => {
  let svc: typeof import('./observability-service')
  let fetchCalls: number

  beforeEach(async () => {
    mockTempDir = mkdtempSync(join(tmpdir(), 'workmate-test-obs-'))
    fetchCalls = 0
    globalThis.fetch = mock(async () => {
      fetchCalls++
      return new Response(JSON.stringify({ code: 0 }), { status: 200 })
    }) as unknown as typeof fetch
    svc = await import('./observability-service')
    svc.__setAuthDepsForTest({
      hasValidSession: () => mockLoggedIn,
      getToken: () => 'mock-token',
      getJobId: () => '022480',
    })
    // 大 flushInterval 防止定时器在测试期间自行触发
    svc.init({ enabled: true, url: 'http://localhost/events', flushIntervalMs: 999_999 })
  })

  afterEach(async () => {
    await svc.shutdown()
    svc.__resetAuthDepsForTest()
    globalThis.fetch = originalFetch
    rmSync(mockTempDir, { recursive: true, force: true })
  })

  function errorEvent() {
    return {
      type: 'error' as const,
      userId: '022480',
      timestamp: Date.now(),
      result: 'failure' as const,
      error: { type: 'Error', message: 'boom' },
      client: { appVersion: '1.0.0', platform: 'win32', osVersion: '10.0' },
    }
  }

  test('未登录时事件被拦截，不入队也不上报', async () => {
    mockLoggedIn = false
    svc.reportEvent(errorEvent())
    await svc.flushQueue()
    expect(fetchCalls).toBe(0)
  })

  test('已登录时事件正常入队并上报', async () => {
    mockLoggedIn = true
    svc.reportEvent(errorEvent())
    await svc.flushQueue()
    expect(fetchCalls).toBe(1)
  })
})
