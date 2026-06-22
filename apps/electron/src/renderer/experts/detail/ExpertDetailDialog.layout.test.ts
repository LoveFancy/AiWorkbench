import { expect, test } from 'bun:test'
import { join } from 'node:path'

const expertDetailSource = await Bun.file(join(import.meta.dir, 'ExpertDetailDialog.tsx')).text()

test('专家详情抽屉宽度与窄版详情抽屉保持一致', () => {
  expect(expertDetailSource).toContain('w-full sm:w-[46vw] sm:min-w-[520px] sm:max-w-[760px]')
  expect(expertDetailSource).not.toContain('sm:w-[62vw] sm:min-w-[680px] sm:max-w-[1100px]')
})

test('专家详情主操作按钮放在顶部右侧', () => {
  expect(expertDetailSource).toContain('ml-auto flex shrink-0 items-center gap-2')
  expect(expertDetailSource).not.toContain('shrink-0 border-t border-border/60 px-5 py-4')
})
