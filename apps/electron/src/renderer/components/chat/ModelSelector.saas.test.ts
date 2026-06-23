import { describe, expect, test } from 'bun:test'
import { isSaasModel } from './ModelSelector'

describe('isSaasModel', () => {
  test('识别 saas- 前缀模型', () => {
    expect(isSaasModel('saas-doubao-15-pro-32k')).toBe(true)
  })

  test('大小写不敏感', () => {
    expect(isSaasModel('SAAS-doubao')).toBe(true)
  })

  test('本地模型返回 false', () => {
    expect(isSaasModel('local-qwen36-27b')).toBe(false)
  })

  test('非 saas 前缀返回 false', () => {
    expect(isSaasModel('gpt-4o')).toBe(false)
  })
})
