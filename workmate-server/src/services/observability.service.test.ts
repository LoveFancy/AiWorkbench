import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { createEvent, queryEvents, getEventStats } from '../services/observability.service'
import type { ObservabilityEventDTO } from '../types'

const prisma = new PrismaClient()

describe('observability.service', () => {
  beforeAll(async () => {
    await prisma.observabilityEvent.deleteMany()
  })

  afterAll(async () => {
    await prisma.observabilityEvent.deleteMany()
    await prisma.$disconnect()
  })

  describe('createEvent', () => {
    it('应成功创建事件', async () => {
      const event: ObservabilityEventDTO = {
        eventId: '550e8400-e29b-41d4-a716-446655440000',
        type: 'chat_question',
        userName: '张三',
        timestamp: Date.now(),
        question: '如何使用', 
        questionLength: 4,
        modelId: 'gpt-4',
        result: 'success',
        client: {
          appVersion: '1.0.0',
          platform: 'win32',
          osVersion: 'Windows 11',
        },
      }

      const result = await createEvent(event, '022480')
      expect(result.id).toBeGreaterThan(0)
      expect(result.userId).toBe('022480')
      expect(result.eventType).toBe('chat_question')
    })

    it('应使用 reqJobId 覆盖 userId', async () => {
      const event: ObservabilityEventDTO = {
        eventId: '550e8400-e29b-41d4-a716-446655440001',
        type: 'user_login',
        userId: 'client_reported_id',
        userName: '李四',
        timestamp: Date.now(),
        client: {
          appVersion: '1.0.0',
          platform: 'darwin',
        },
      }

      const result = await createEvent(event, '022480')
      expect(result.userId).toBe('022480')
    })

    it('应去重相同 eventId', async () => {
      const event: ObservabilityEventDTO = {
        eventId: '550e8400-e29b-41d4-a716-446655440000',
        type: 'chat_question',
        userName: '张三',
        timestamp: Date.now(),
        client: {
          appVersion: '1.0.0',
          platform: 'win32',
        },
      }

      const result = await createEvent(event, '022480')
      expect(result.eventId).toBe('550e8400-e29b-41d4-a716-446655440000')
    })

    it('应创建 error 事件', async () => {
      const event: ObservabilityEventDTO = {
        eventId: '550e8400-e29b-41d4-a716-446655440002',
        type: 'error',
        userName: '王五',
        timestamp: Date.now(),
        error: {
          type: 'TypeError',
          message: 'Cannot read property of undefined',
          stack: 'Error stack...',
          fingerprint: 'abc123',
        },
        client: {
          appVersion: '1.0.0',
          platform: 'win32',
        },
      }

      const result = await createEvent(event, '022480')
      expect(result.eventType).toBe('error')
      expect(result.errorFingerprint).toBe('abc123')
    })
  })

  describe('queryEvents', () => {
    it('应查询事件列表', async () => {
      const result = await queryEvents({ page: 1, pageSize: 20 })
      expect(result.total).toBeGreaterThanOrEqual(3)
      expect(result.events.length).toBeGreaterThanOrEqual(3)
    })

    it('应按类型筛选', async () => {
      const result = await queryEvents({ page: 1, pageSize: 20, eventType: 'error' })
      expect(result.events.every((e) => e.eventType === 'error')).toBe(true)
    })

    it('应按用户筛选', async () => {
      const result = await queryEvents({ page: 1, pageSize: 20, userId: '022480' })
      expect(result.events.every((e) => e.userId === '022480')).toBe(true)
    })
  })

  describe('getEventStats', () => {
    it('应返回统计信息', async () => {
      const stats = await getEventStats({})
      expect(stats.totalEvents).toBeGreaterThanOrEqual(3)
      expect(stats.errorEvents).toBeGreaterThanOrEqual(1)
      expect(typeof stats.errorRate).toBe('number')
    })
  })
})