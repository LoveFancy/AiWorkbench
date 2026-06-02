import { describe, it, expect } from 'vitest'
import {
  upgradeCheckSchema,
  observabilityEventSchema,
  strategyCreateSchema,
  whitelistRuleSchema,
  adminWhitelistRuleSchema,
  upgradeReleaseSchema,
  paginationSchema,
} from '../utils/validator'

describe('upgradeCheckSchema', () => {
  it('应通过有效参数', () => {
    const result = upgradeCheckSchema.safeParse({
      currentVersion: '1.0.0',
      platform: 'win32',
    })
    expect(result.success).toBe(true)
  })

  it('应拒绝无效的平台', () => {
    const result = upgradeCheckSchema.safeParse({
      currentVersion: '1.0.0',
      platform: 'android',
    })
    expect(result.success).toBe(false)
  })

  it('应拒绝空版本', () => {
    const result = upgradeCheckSchema.safeParse({
      currentVersion: '',
      platform: 'win32',
    })
    expect(result.success).toBe(false)
  })
})

describe('observabilityEventSchema', () => {
  const validEvent = {
    eventId: '550e8400-e29b-41d4-a716-446655440000',
    type: 'chat_question' as const,
    userId: '022480',
    userName: '张三',
    timestamp: Date.now(),
    question: '如何使用',
    questionLength: 4,
    modelId: 'gpt-4',
    result: 'success' as const,
    client: {
      appVersion: '1.0.0',
      platform: 'win32',
      osVersion: 'Windows 11',
    },
  }

  it('应通过有效数据', () => {
    const result = observabilityEventSchema.safeParse(validEvent)
    expect(result.success).toBe(true)
  })

  it('eventId 可选', () => {
    const { eventId, ...rest } = validEvent
    const result = observabilityEventSchema.safeParse(rest)
    expect(result.success).toBe(true)
  })

  it('应拒绝缺少 client 的数据', () => {
    const { client, ...rest } = validEvent
    const result = observabilityEventSchema.safeParse(rest)
    expect(result.success).toBe(false)
  })

  it('应拒绝无效类型', () => {
    const result = observabilityEventSchema.safeParse({
      ...validEvent,
      type: 'invalid_type',
    })
    expect(result.success).toBe(false)
  })

  it('应接受 error 类型', () => {
    const result = observabilityEventSchema.safeParse({
      ...validEvent,
      type: 'error',
      error: {
        type: 'TypeError',
        message: 'Something went wrong',
        stack: 'Error stack...',
        fingerprint: 'abc123',
      },
    })
    expect(result.success).toBe(true)
  })

  it('应接受带 breadcrumbs 的事件', () => {
    const result = observabilityEventSchema.safeParse({
      ...validEvent,
      breadcrumbs: [
        {
          type: 'navigation',
          category: 'user',
          message: '用户点击了按钮',
          timestamp: Date.now() - 1000,
        },
      ],
    })
    expect(result.success).toBe(true)
  })

  it('应接受带 tags 的事件', () => {
    const result = observabilityEventSchema.safeParse({
      ...validEvent,
      tags: { environment: 'production', channel: 'desktop' },
    })
    expect(result.success).toBe(true)
  })
})

describe('strategyCreateSchema', () => {
  const validStrategy = {
    name: 'v1.0.0 灰度升级',
    targetVersion: '1.0.0',
    downloadUrl: 'https://example.com/download',
    releaseNotes: '修复了若干 Bug',
    platform: 'win32' as const,
    totalStages: 3,
    stages: [
      {
        name: '内部测试',
        rules: [{ ruleType: 'list' as const, ruleValue: '022480' }],
      },
      {
        name: '部门推广',
        rules: [{ ruleType: 'prefix' as const, ruleValue: '022*' }],
      },
      {
        name: '全量发布',
        rules: [{ ruleType: 'suffix' as const, ruleValue: '*022' }],
      },
    ],
  }

  it('应通过有效策略', () => {
    const result = strategyCreateSchema.safeParse(validStrategy)
    expect(result.success).toBe(true)
  })

  it('应接受可选参数', () => {
    const result = strategyCreateSchema.safeParse({
      ...validStrategy,
      minVersion: '0.9.0',
      soakTimeMinutes: 60,
      autoPauseErrorRate: 0.05,
      autoPauseEnabled: true,
    })
    expect(result.success).toBe(true)
  })

  it('应拒绝无阶段的策略', () => {
    const result = strategyCreateSchema.safeParse({
      ...validStrategy,
      stages: [],
    })
    expect(result.success).toBe(false)
  })

  it('应拒绝无效规则类型', () => {
    const result = strategyCreateSchema.safeParse({
      ...validStrategy,
      stages: [
        {
          name: '测试',
          rules: [{ ruleType: 'invalid', ruleValue: 'test' }],
        },
      ],
    })
    expect(result.success).toBe(false)
  })
})

describe('whitelistRuleSchema', () => {
  it('应通过有效规则', () => {
    const result = whitelistRuleSchema.safeParse({
      ruleType: 'list',
      ruleValue: '022480,021220',
    })
    expect(result.success).toBe(true)
  })

  it('应接受可选参数', () => {
    const result = whitelistRuleSchema.safeParse({
      ruleType: 'prefix',
      ruleValue: '022*',
      targetVersion: '1.0.0',
      platform: 'win32',
    })
    expect(result.success).toBe(true)
  })
})

describe('adminWhitelistRuleSchema', () => {
  it('应通过有效规则', () => {
    const result = adminWhitelistRuleSchema.safeParse({
      ruleType: 'list',
      ruleValue: '022480',
      remark: '超级管理员',
    })
    expect(result.success).toBe(true)
  })

  it('remark 可选', () => {
    const result = adminWhitelistRuleSchema.safeParse({
      ruleType: 'list',
      ruleValue: '022480',
    })
    expect(result.success).toBe(true)
  })
})

describe('upgradeReleaseSchema', () => {
  it('应通过有效发布版本', () => {
    const result = upgradeReleaseSchema.safeParse({
      version: '1.0.0',
      releaseType: 'UPGRADE',
      releaseNotes: '初始版本',
      downloadUrl: 'https://example.com/download',
      platform: 'win32',
    })
    expect(result.success).toBe(true)
  })

  it('应接受回退类型', () => {
    const result = upgradeReleaseSchema.safeParse({
      version: '0.9.0',
      releaseType: 'ROLLBACK',
      releaseNotes: '回退到之前版本',
      downloadUrl: 'https://example.com/download',
      platform: 'darwin',
    })
    expect(result.success).toBe(true)
  })
})

describe('paginationSchema', () => {
  it('应使用默认值', () => {
    const result = paginationSchema.parse({})
    expect(result.page).toBe(1)
    expect(result.pageSize).toBe(20)
  })

  it('应转换字符串为数字', () => {
    const result = paginationSchema.parse({ page: '3', pageSize: '50' })
    expect(result.page).toBe(3)
    expect(result.pageSize).toBe(50)
  })

  it('应拒绝 pageSize > 100', () => {
    const result = paginationSchema.safeParse({ page: 1, pageSize: 200 })
    expect(result.success).toBe(false)
  })
})