import { expect, test } from 'bun:test'
import { join } from 'node:path'

const selectorSource = await Bun.file(join(import.meta.dir, 'ModelSelector.tsx')).text()

test('模型选择器触发按钮和弹窗列表使用更小的模型名称字号', () => {
  expect(selectorSource).toContain('MODEL_NAME_TRIGGER_CLASS')
  expect(selectorSource).toContain('MODEL_NAME_OPTION_CLASS')
  expect(selectorSource).toContain("'truncate text-xs'")
  expect(selectorSource).toContain("'flex-1 text-xs truncate'")
  expect(selectorSource).not.toContain("'flex-1 text-sm truncate'")
})
