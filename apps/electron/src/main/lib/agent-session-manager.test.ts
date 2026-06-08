import { afterAll, beforeAll, describe, expect, mock, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AgentSessionMeta } from '@proma/shared'
import { clearConfigRootOverride, setConfigRoot } from './config-root-service.ts'

let root = ''

mock.module('electron', () => ({
  app: {
    isPackaged: false,
    getPath: () => root,
  },
  dialog: {},
  BrowserWindow: class {},
}))

beforeAll(() => {
  clearConfigRootOverride()
  root = mkdtempSync(join(tmpdir(), 'proma-agent-sessions-'))
  process.env.HOME = root
  process.env.PROMA_DEV = '0'
  setConfigRoot(join(root, '.workmate-test'), { homeDir: root, configDirName: '.workmate-dev' })
})

afterAll(() => {
  clearConfigRootOverride()
  if (root) rmSync(root, { recursive: true, force: true })
})

describe('Agent 会话管理器专家团绑定', () => {
  test('创建会话时写入专家团绑定', async () => {
    const { createAgentSession } = await import('./agent-session-manager.ts')

    const session = createAgentSession(
      '产品专家团 · 新任务',
      'channel-1',
      undefined,
      'product-team',
      'builtin:workmate-experts',
    )

    expect(session.expertGroupId).toBe('product-team')
    expect(session.expertPluginId).toBe('builtin:workmate-experts')
  })

  test('创建专家团会话时写入自我介绍消息', async () => {
    const { createAgentSession, getAgentSessionSDKMessages } = await import('./agent-session-manager.ts')

    const session = createAgentSession(
      '产品专家团 · 新任务',
      'channel-1',
      undefined,
      'product-team',
      'builtin:workmate-experts',
      '我是产品专家团，会先帮你梳理目标、约束和可行动方案。',
    )

    const messages = getAgentSessionSDKMessages(session.id)
    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({
      type: 'assistant',
      message: {
        content: [
          {
            type: 'text',
            text: '我是产品专家团，会先帮你梳理目标、约束和可行动方案。',
          },
        ],
      },
      parent_tool_use_id: null,
    })
  })

  test('更新会话元数据时拒绝修改专家团绑定', async () => {
    const { createAgentSession, updateAgentSessionMeta } = await import('./agent-session-manager.ts')
    const session = createAgentSession(
      '产品专家团 · 新任务',
      'channel-1',
      undefined,
      'product-team',
      'builtin:workmate-experts',
    )

    expect(() => updateAgentSessionMeta(
      session.id,
      { expertGroupId: 'other-team' } as Partial<AgentSessionMeta>,
    )).toThrow('专家团绑定不能在会话创建后修改')
  })
})
