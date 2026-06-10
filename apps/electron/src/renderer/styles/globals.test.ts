import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'

const source = await Bun.file(join(import.meta.dir, 'globals.css')).text()

describe('全局字体', () => {
  test('body 使用明确的中英文系统字体栈，避免中文 fallback 显示异常', () => {
    expect(source).toContain('font-family:')
    expect(source).toContain('Microsoft YaHei')
    expect(source).toContain('PingFang SC')
    expect(source).toContain('-webkit-font-smoothing: antialiased')
  })
})
