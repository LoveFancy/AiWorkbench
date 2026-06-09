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
