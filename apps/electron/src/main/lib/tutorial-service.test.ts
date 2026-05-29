import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const servicePath = join(import.meta.dir, 'tutorial-service.ts')

describe('教程服务欢迎对话', () => {
  test('欢迎消息包含安装和使用教程链接', () => {
    const content = readFileSync(servicePath, 'utf-8')

    expect(content).toContain('https://linkapp.htsc.com.cn/S/019dT1')
    expect(content).toContain('安装和使用教程')
  })
})
