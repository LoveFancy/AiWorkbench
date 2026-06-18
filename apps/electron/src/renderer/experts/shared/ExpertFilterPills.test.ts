import { expect, test } from 'bun:test'
import { join } from 'node:path'

const source = await Bun.file(join(import.meta.dir, 'ExpertFilterPills.tsx')).text()

test('专家筛选条不展示可用或不可用筛选项', () => {
  expect(source).not.toContain("label: '可用'")
  expect(source).not.toContain("label: '不可用'")
})
