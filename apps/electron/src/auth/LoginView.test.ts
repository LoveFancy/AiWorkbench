import { expect, test } from 'bun:test'
import { join } from 'node:path'

const source = await Bun.file(join(import.meta.dir, 'LoginView.tsx')).text()

test('登录卡片标题展示 WorkMate 品牌', () => {
  expect(source).toContain('登录 WorkMate')
})
