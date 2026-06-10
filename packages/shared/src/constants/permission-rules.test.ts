import { expect, test } from 'bun:test'
import { SAFE_TOOLS } from './permission-rules'

test('智能模式安全工具白名单只禁用 SDK 原生搜索，保留 URL 获取能力', () => {
  expect(SAFE_TOOLS).not.toContain('WebSearch')
  expect(SAFE_TOOLS).toContain('WebFetch')
})
