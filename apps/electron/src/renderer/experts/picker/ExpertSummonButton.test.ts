import { expect, test } from 'bun:test'
import { join } from 'node:path'

const source = await Bun.file(join(import.meta.dir, 'ExpertSummonButton.tsx')).text()

test('composer 默认专家入口只显示图标', () => {
  expect(source).toContain('isDefaultExpertEntry')
  expect(source).toContain("isDefaultExpertEntry ? 'w-8 px-0' : 'px-2'")
  expect(source).toContain('{!isDefaultExpertEntry && (')
})
