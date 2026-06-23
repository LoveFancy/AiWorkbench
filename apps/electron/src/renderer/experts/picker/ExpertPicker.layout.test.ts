import { expect, test } from 'bun:test'
import { join } from 'node:path'

const expertPickerSource = await Bun.file(join(import.meta.dir, 'ExpertPicker.tsx')).text()

test('召唤专家弹窗搜索框使用弹窗内容宽度并预留右侧操作区', () => {
  expect(expertPickerSource).not.toContain('relative max-w-xl')
  expect(expertPickerSource).toContain('relative w-full min-w-0')
  expect(expertPickerSource).toContain('pr-12')
})
