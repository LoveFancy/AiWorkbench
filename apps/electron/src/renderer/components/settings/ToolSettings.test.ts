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
