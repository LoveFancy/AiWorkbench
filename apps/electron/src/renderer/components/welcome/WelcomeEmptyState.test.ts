import { expect, test } from 'bun:test'
import { join } from 'node:path'

const source = await Bun.file(join(import.meta.dir, 'WelcomeEmptyState.tsx')).text()

test('欢迎空状态不再渲染 Chat 和 Agent 模式切换控件', () => {
  expect(source).not.toContain('useSwitchModeWithSession')
  expect(source).not.toContain('appModeAtom')
  expect(source).not.toContain('MODE_CONFIG')
  expect(source).not.toContain("(['agent', 'chat'] as const).map")
  expect(source).not.toContain('模式切换 Tab')
})
