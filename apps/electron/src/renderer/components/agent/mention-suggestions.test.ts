import { describe, expect, test } from 'bun:test'

import { createMcpMentionSuggestion } from './mention-suggestions'

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
