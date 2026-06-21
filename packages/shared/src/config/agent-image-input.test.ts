import { describe, expect, test } from 'bun:test'
import { AGENT_IMAGE_INPUT_LIMITS } from './index'

describe('Agent 图片输入限制', () => {
  test('导出单图和单轮总量限制', () => {
    expect(AGENT_IMAGE_INPUT_LIMITS.MAX_SINGLE_IMAGE_BYTES).toBe(10 * 1024 * 1024)
    expect(AGENT_IMAGE_INPUT_LIMITS.MAX_TOTAL_IMAGE_BYTES).toBe(20 * 1024 * 1024)
  })
})
