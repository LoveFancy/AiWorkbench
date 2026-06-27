import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'bun:test'

const source = readFileSync(join(import.meta.dir, 'ToolSettings.tsx'), 'utf-8')

test('联网搜索设置页使用泰为平台说明且不展示内置凭据文案', () => {
  expect(source).toContain('泰为平台')
  expect(source).not.toContain('服务凭据由系统内置管理')
})

test('联网搜索设置页和工具弹窗共用 chatToolsAtom 状态源', () => {
  expect(source).toContain('useAtom(chatToolsAtom)')
  expect(source).toContain('const searchTool = chatTools.find')
  expect(source).not.toContain('const [enabled, setEnabled]')
})

test('个人记忆设置使用用户可理解的命名和使用说明', () => {
  expect(source).toContain('title="个人记忆"')
  expect(source).toContain('跨会话保存你的偏好、事实和长期上下文')
  expect(source).toContain('请记住')
  expect(source).not.toContain('记忆立方')
  expect(source).not.toContain('创建记忆立方')
  expect(source).not.toContain('创建专属记忆空间实现跨会话记忆')
})

test('个人记忆开关会在首次开启时自动创建记忆空间', () => {
  expect(source).toContain('await ensurePersonalMemoryCreated()')
  expect(source).not.toContain('disabled={!hasCube || !isLoggedIn}')
  expect(source).not.toContain('创建个人记忆')
})
