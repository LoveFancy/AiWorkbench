import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const viewPath = join(import.meta.dir, 'OnboardingView.tsx')

describe('OnboardingView 欢迎文案', () => {
  test('首屏展示华泰 WorkMate 品牌文案', () => {
    const content = readFileSync(viewPath, 'utf-8')

    expect(content).toContain('欢迎使用华泰 WorkMate')
    expect(content).toContain('新一代桌面 AI 软件，让通用 Agent 触手可及，伴你工作同行')
  })
})
