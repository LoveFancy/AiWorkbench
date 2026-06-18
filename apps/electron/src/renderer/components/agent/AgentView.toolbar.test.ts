import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const source = readFileSync(join(import.meta.dir, 'AgentView.tsx'), 'utf8')

test('Agent 输入工具栏中专家团入口位于模型选择前面', () => {
  const expertIndex = source.indexOf("key: 'expert-group'")
  const modelIndex = source.indexOf("key: 'model'")

  expect(expertIndex).toBeGreaterThanOrEqual(0)
  expect(modelIndex).toBeGreaterThanOrEqual(0)
  expect(expertIndex).toBeLessThan(modelIndex)
})

test('Agent 输入工具栏按 WorkBuddy 风格左右分组', () => {
  expect(source).toContain('inputPrimaryToolbarItems')
  expect(source).toContain('inputActionToolbarItems')
  expect(source).toContain('items={inputPrimaryToolbarItems}')
  expect(source).toContain('inputActionToolbarItems.map')
  expect(source).toContain('compactTrigger')
  expect(source).toContain('size-8 rounded-full')
})
