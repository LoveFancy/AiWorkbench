import { describe, expect, test } from 'bun:test'

import { MAX_AUTO_RETRIES } from './agent-sdk-retry-loop'
import { MAX_MALFORMED_RESPONSE_RETRIES, getRetryLimitForCategory } from './retry-policy'

describe('Agent 自动重试策略', () => {
  test('api_retryable 类别错误最多自动重试 5 次', () => {
    expect(getRetryLimitForCategory('api_retryable')).toBe(5)
    expect(MAX_MALFORMED_RESPONSE_RETRIES).toBe(5)
  })

  test('其他错误类别沿用全局重试上限', () => {
    expect(getRetryLimitForCategory('api_fatal')).toBe(MAX_AUTO_RETRIES)
    expect(getRetryLimitForCategory('thinking_signature')).toBe(MAX_AUTO_RETRIES)
    expect(getRetryLimitForCategory(undefined)).toBe(MAX_AUTO_RETRIES)
  })
})
