import { describe, expect, test } from 'bun:test'
import { selectModeSessionTarget } from './mode-session-restore'
import type { TabItem } from '@/atoms/tab-atoms'

const tabs: TabItem[] = [
  { id: 'scratch', type: 'scratch', sessionId: 'scratch', title: 'Scratch Pad' },
  { id: 'chat-tab', type: 'chat', sessionId: 'chat-tab', title: '已打开 Chat' },
]

describe('selectModeSessionTarget', () => {
  test('优先恢复目标模式上次选中的会话', () => {
    const result = selectModeSessionTarget({
      mode: 'chat',
      lastSessionId: 'chat-last',
      sessions: [
        { id: 'chat-last', title: '上次 Chat', archived: false },
        { id: 'chat-recent', title: '最近 Chat', archived: false },
      ],
      tabs,
    })

    expect(result).toEqual({ kind: 'open', sessionId: 'chat-last', title: '上次 Chat' })
  })

  test('没有上次会话时聚焦已打开的目标模式 Tab', () => {
    const result = selectModeSessionTarget({
      mode: 'chat',
      lastSessionId: null,
      sessions: [
        { id: 'chat-recent', title: '最近 Chat', archived: false },
      ],
      tabs,
    })

    expect(result).toEqual({ kind: 'open', sessionId: 'chat-tab', title: '已打开 Chat' })
  })

  test('没有已打开 Tab 时打开最近的未归档历史会话', () => {
    const result = selectModeSessionTarget({
      mode: 'agent',
      lastSessionId: null,
      sessions: [
        { id: 'agent-archived', title: '归档 Agent', archived: true, workspaceId: 'ws-1' },
        { id: 'agent-recent', title: '最近 Agent', archived: false, workspaceId: 'ws-1' },
      ],
      tabs,
      currentWorkspaceId: 'ws-1',
    })

    expect(result).toEqual({ kind: 'open', sessionId: 'agent-recent', title: '最近 Agent' })
  })

  test('当前工作区没有可恢复 Agent 会话时创建草稿', () => {
    const result = selectModeSessionTarget({
      mode: 'agent',
      lastSessionId: null,
      sessions: [
        { id: 'agent-other-workspace', title: '其他项目 Agent', archived: false, workspaceId: 'ws-2' },
      ],
      tabs,
      currentWorkspaceId: 'ws-1',
    })

    expect(result).toEqual({ kind: 'create-draft' })
  })
})
