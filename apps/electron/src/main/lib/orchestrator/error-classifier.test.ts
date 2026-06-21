import { describe, expect, test } from 'bun:test'

import { classifyFromTypedError, classifySdkError } from './error-classifier'

describe('Agent SDK 错误分类', () => {
  test('empty or malformed response 会进入可自动重试分类并保留重试按钮', () => {
    const result = classifySdkError({
      rawErrorMessage: 'API returned an empty or malformed response (HTTP 502)',
      rawStack: '',
      stderrOutput: '',
      apiError: null,
    })

    expect(result.category).toBe('api_retryable')
    expect(result.isMalformedResponse).toBe(true)
    expect(result.display.errorCode).toBe('malformed_response')
    expect(result.display.errorActions).toContainEqual({ key: 'r', label: '重试', action: 'retry' })
  })

  test('assistant.error 中的 empty or malformed response 也会进入可自动重试分类', () => {
    const result = classifyFromTypedError({
      code: 'unknown_error',
      title: '执行错误',
      message: 'API returned an empty or malformed response (HTTP 502)',
    }, 'API returned an empty or malformed response (HTTP 502)', null)

    expect(result.category).toBe('api_retryable')
    expect(result.isMalformedResponse).toBe(true)
  })
})
