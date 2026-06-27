import { expect, test } from 'bun:test'
import { join } from 'node:path'

const source = await Bun.file(join(import.meta.dir, 'ui-preferences.ts')).text()

test('用户消息悬浮置顶条默认不开启', () => {
  expect(source).toContain('stickyUserMessageEnabledAtom = atom<boolean>(false)')
  expect(source).toContain('settings.stickyUserMessageEnabled ?? false')
})

test('用户消息悬浮置顶条仍然支持显式开启配置', () => {
  expect(source).toContain('updateSettings({ stickyUserMessageEnabled: enabled })')
})
