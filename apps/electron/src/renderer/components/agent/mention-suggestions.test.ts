import { describe, expect, test } from 'bun:test'

import {
  buildSlashMentionCommandProps,
  buildSlashCommandSearchText,
  getSlashMentionItemLayoutClasses,
  truncateSkillMentionName,
  formatSlashMentionTooltip,
  formatSlashCommandDisplayLabel,
  sortSlashMentionItems,
} from './mention-suggestions'

describe('slash command mention 展示', () => {
  test('Skill 候选项排在 command 前面', () => {
    const items = sortSlashMentionItems([
      {
        kind: 'command',
        id: 'wiki-upload',
        name: 'wiki-upload',
        command: '/wiki-upload',
        sourceLabel: 'po-assist',
      },
      {
        kind: 'skill',
        id: 'docx',
        name: 'docx',
        description: '处理 Word 文档',
      },
    ])

    expect(items.map((item) => item.kind)).toEqual(['skill', 'command'])
  })

  test('命令候选项显示插件来源和命令名', () => {
    expect(formatSlashCommandDisplayLabel({
      kind: 'command',
      id: 'brainstorming',
      name: 'brainstorming',
      command: '/brainstorming',
      sourceLabel: 'po-assist',
    })).toBe('po-assist: brainstorming')
  })

  test('命令搜索文本包含来源标签', () => {
    const text = buildSlashCommandSearchText({
      name: 'brainstorming',
      command: '/brainstorming',
      description: '产品想法',
      source: 'builtin',
      sourceLabel: 'po-assist',
      filePath: '/tmp/brainstorming.md',
    })

    expect(text).toContain('po-assist')
  })

  test('hover 说明包含 command 指令和 skill 说明', () => {
    expect(formatSlashMentionTooltip({
      kind: 'command',
      id: 'wiki-upload',
      name: 'wiki-upload',
      command: '/wiki-upload',
      argumentHint: '[本地 Markdown 文件]',
      description: '上传到 Wiki',
      sourceLabel: 'po-assist',
    })).toContain('命令: /wiki-upload')

    expect(formatSlashMentionTooltip({
      kind: 'skill',
      id: 'docx',
      name: 'docx',
      description: '处理 Word 文档',
    })).toContain('说明: 处理 Word 文档')
  })

  test('选中 command 和 skill 时写入不同 mentionKind', () => {
    expect(buildSlashMentionCommandProps({
      kind: 'command',
      id: 'story-create',
      name: 'story-create',
      command: '/story-create',
      sourceLabel: 'po-assist',
    })).toMatchObject({
      label: '/story-create',
      commandText: '/story-create ',
      mentionKind: 'command',
    })

    expect(buildSlashMentionCommandProps({
      kind: 'skill',
      id: 'docx',
      name: 'docx',
    })).toMatchObject({
      label: 'docx',
      mentionKind: 'skill',
    })
  })

  test('候选项名称列和说明列按 1/3 与 2/3 分配宽度', () => {
    expect(getSlashMentionItemLayoutClasses('skill').content).toContain('grid-cols-[minmax(0,1fr)_minmax(0,2fr)]')
    expect(getSlashMentionItemLayoutClasses('command').content).toContain('grid-cols-[minmax(0,1fr)_minmax(0,2fr)]')
  })

  test('Skill 候选项名称最多显示 20 个字符', () => {
    expect(truncateSkillMentionName('developing-claude-code-plugins')).toBe('developing-claude-c…')
    expect(truncateSkillMentionName('brainstorming')).toBe('brainstorming')
    expect(Array.from(truncateSkillMentionName('developing-claude-code-plugins'))).toHaveLength(20)
  })
})
