import { describe, expect, test } from 'bun:test'

import { DEFAULT_THEME_MODE, DEFAULT_THEME_STYLE } from './settings.ts'

describe('应用设置默认值', () => {
  test('新用户默认使用特殊风格中的云朵舞者主题', () => {
    expect(DEFAULT_THEME_MODE).toBe('special')
    expect(DEFAULT_THEME_STYLE).toBe('slate-light')
  })
})
