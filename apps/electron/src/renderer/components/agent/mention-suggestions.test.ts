import { describe, expect, test } from 'bun:test'

import {
  buildSlashMentionCommandProps,
  buildSlashCommandSearchText,
  createMcpMentionSuggestion,
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
})

describe('createMcpMentionSuggestion', () => {
  test('mention 选中时使用当前 editor schema 插入节点，避开 insertContentAt 的跨实例 Fragment 转换', () => {
    const suggestion = createMcpMentionSuggestion(
      { current: 'default-workspace' },
      { current: false },
      { current: 0 },
    )
    const command = suggestion.command
    expect(typeof command).toBe('function')
    if (!command) throw new Error('mention suggestion command 未配置')

    const calls: string[] = []
    const mentionNode = { nodeSize: 1 }
    const tr = {
      replaceWith(from: number, to: number, node: unknown) {
        calls.push(`replaceWith:${from}:${to}:${node === mentionNode}`)
        return this
      },
      insertText(text: string, pos: number) {
        calls.push(`insertText:${text}:${pos}`)
        return this
      },
      scrollIntoView() {
        calls.push('scrollIntoView')
        return this
      },
    }
    const editor = {
      chain() {
        throw new Error('不应调用 insertContentAt 链路')
      },
      state: {
        tr,
        schema: {
          nodes: {
            mention: {
              create(attrs: Record<string, unknown>) {
                expect(attrs).toEqual({
                  id: 'github',
                  label: 'github',
                  mentionSuggestionChar: '#',
                })
                return mentionNode
              },
            },
          },
        },
      },
      view: {
        state: {
          selection: {
            $to: {
              nodeAfter: null,
            },
          },
        },
        dispatch(transaction: unknown) {
          expect(transaction).toBe(tr)
          calls.push('dispatch')
        },
        focus() {
          calls.push('focus')
        },
        dom: {
          ownerDocument: {
            defaultView: {
              getSelection() {
                return {
                  collapseToEnd() {
                    calls.push('collapseToEnd')
                  },
                }
              },
            },
          },
        },
      },
    }

    type CommandArgs = Parameters<NonNullable<typeof command>>[0]
    command({
      editor: editor as unknown as CommandArgs['editor'],
      range: { from: 5, to: 9 },
      props: { id: 'github', label: 'github' },
    })

    expect(calls).toEqual([
      'focus',
      'replaceWith:5:9:true',
      'insertText: :6',
      'scrollIntoView',
      'dispatch',
      'collapseToEnd',
    ])
  })
})
