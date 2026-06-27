import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'bun:test'

const source = readFileSync(join(import.meta.dir, 'SDKMessageRenderer.tsx'), 'utf-8')

test('Agent 用户消息外层容器占满宽度以贴近右侧', () => {
  expect(source).toContain('<div className="w-full" data-message-id={groupId} data-message-role="user"')
  expect(source).toContain('data-current-turn-focus-anchor={groupId}')
  expect(source).toContain('<Message from="user" className="max-w-full">')
  expect(source).toContain('<MessageContent className="group-[.is-user]:pr-0">')
  expect(source).toContain('<MessageActions className="pr-0 mt-0.5">')
})
