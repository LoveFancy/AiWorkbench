import { expect, test } from 'bun:test'

import {
  MENTION_LIST_EMPTY_WIDTH_CLASS,
  MENTION_LIST_TOOLTIP_WIDTH_CLASS,
  MENTION_LIST_WIDTH_CLASS,
  handleMentionListKeyDown,
  normalizeMentionTooltipTitle,
} from './MentionList'

test('Tab 选中当前高亮候选项并阻止焦点跳转', () => {
  const selected: string[] = []
  let prevented = false

  const handled = handleMentionListKeyDown({
    event: {
      key: 'Tab',
      preventDefault: () => { prevented = true },
    } as KeyboardEvent,
    items: ['first', 'second'],
    selectedIndex: 1,
    setSelectedIndex: () => {},
    onSelect: (item) => selected.push(item),
  })

  expect(handled).toBe(true)
  expect(prevented).toBe(true)
  expect(selected).toEqual(['second'])
})

test('没有候选项时 Tab 不拦截默认行为', () => {
  let prevented = false

  const handled = handleMentionListKeyDown({
    event: {
      key: 'Tab',
      preventDefault: () => { prevented = true },
    } as KeyboardEvent,
    items: [],
    selectedIndex: 0,
    setSelectedIndex: () => {},
    onSelect: () => {},
  })

  expect(handled).toBe(false)
  expect(prevented).toBe(false)
})

test('hover 说明会保留完整多行文本并忽略空白内容', () => {
  expect(normalizeMentionTooltipTitle('  命令: /doc\n说明: 完整功能提示  ')).toBe('命令: /doc\n说明: 完整功能提示')
  expect(normalizeMentionTooltipTitle('   ')).toBeUndefined()
  expect(normalizeMentionTooltipTitle(undefined)).toBeUndefined()
})

test('候选弹窗整体宽度扩大到 560px，给长 Skill 名称留出空间', () => {
  expect(MENTION_LIST_WIDTH_CLASS).toBe('w-[560px]')
  expect(MENTION_LIST_EMPTY_WIDTH_CLASS).toBe('w-[560px]')
  expect(MENTION_LIST_TOOLTIP_WIDTH_CLASS).toBe('max-w-[560px]')
})
