import { expect, test } from 'bun:test'
import { join } from 'node:path'

const source = await Bun.file(join(import.meta.dir, 'ExpertSummonButton.tsx')).text()

test('composer 默认专家入口显示文字和下拉箭头', () => {
  expect(source).toContain("displayName ?? '专家'")
  expect(source).toContain('<ChevronDown className="size-3.5 text-muted-foreground" />')
  expect(source).not.toContain("'w-8 px-0'")
})
