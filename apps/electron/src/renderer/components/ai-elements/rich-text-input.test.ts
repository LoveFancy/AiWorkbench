import { describe, expect, test } from 'bun:test'

import { getMentionChipClass } from './rich-text-input'

describe('getMentionChipClass', () => {
  test('同为斜杠触发时按 mentionKind 区分 command 和 skill 图标样式', () => {
    expect(getMentionChipClass('/', 'command')).toBe('command-mention-chip')
    expect(getMentionChipClass('/', 'skill')).toBe('skill-mention-chip')
  })

  test('旧 command mention 没有 mentionKind 时根据 commandText 兼容识别', () => {
    expect(getMentionChipClass('/', undefined, '/story-create ')).toBe('command-mention-chip')
  })
})
