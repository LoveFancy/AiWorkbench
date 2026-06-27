import { afterEach, describe, expect, test } from 'bun:test'
import type { AddressInfo } from 'node:net'
import { request as httpRequest } from 'node:http'

import { AgentEventBus } from './agent-event-bus'
import { LocalApiServer } from './local-api-server'
import { DEFAULT_LOCAL_API_SETTINGS, hashLocalApiToken } from './local-api-settings-service'
import type { LocalApiSettings } from './local-api-types'
import type { AgentSessionMeta, AgentSendInput, SDKAssistantMessage } from '@proma/shared'

const TOKEN = 'test-token'

interface TestHarness {
  server: LocalApiServer
  baseUrl: string
  eventBus: AgentEventBus
  calls: {
    created: Array<{ title?: string; channelId?: string; workspaceId?: string }>
    runs: AgentSendInput[]
    stops: string[]
  }
  setActive: (sessionId: string, active: boolean) => void
  cleanup: () => Promise<void>
}

interface TestHarnessOptions {
  runAgentHeadless?: LocalApiServerConstructorRunAgent
}

type LocalApiServerConstructorRunAgent = ConstructorParameters<typeof LocalApiServer>[0]['runAgentHeadless']

function createSession(id: string): AgentSessionMeta {
  return {
    id,
    title: `Session ${id}`,
    channelId: 'channel-1',
    workspaceId: 'workspace-1',
    createdAt: 1,
    updatedAt: 1,
  }
}

async function createHarness(
  overrides: Partial<LocalApiSettings> = {},
  options: TestHarnessOptions = {},
): Promise<TestHarness> {
  const eventBus = new AgentEventBus()
  const calls: TestHarness['calls'] = { created: [], runs: [], stops: [] }
  const sessions = new Map<string, AgentSessionMeta>([
    ['session-1', createSession('session-1')],
    ['session-2', createSession('session-2')],
  ])
  const active = new Set<string>()
  const settings: LocalApiSettings = {
    ...DEFAULT_LOCAL_API_SETTINGS,
    enabled: true,
    port: 19000 + Math.floor(Math.random() * 20000),
    apiTokenHash: hashLocalApiToken(TOKEN),
    ...overrides,
  }
  const server = new LocalApiServer({
    eventBus,
    getSettings: () => settings,
    getAppVersion: () => '0.0.0-test',
    createAgentSession: (title, channelId, workspaceId) => {
      calls.created.push({ title, channelId, workspaceId })
      const session = createSession('created-session')
      sessions.set(session.id, session)
      return session
    },
    listAgentSessions: () => Array.from(sessions.values()),
    getAgentSessionMeta: (id) => sessions.get(id),
    getAgentSessionSDKMessages: () => [],
    isAgentSessionActive: (id) => active.has(id),
    runAgentHeadless: options.runAgentHeadless ?? (async (input, callbacks) => {
      calls.runs.push(input)
      active.add(input.sessionId)
      callbacks.onTitleUpdated('新标题')
    }),
    stopAgent: (sessionId) => {
      calls.stops.push(sessionId)
      active.delete(sessionId)
    },
  })

  await server.start()
  const address = server.address() as AddressInfo

  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
    eventBus,
    calls,
    setActive: (sessionId, isActive) => {
      if (isActive) active.add(sessionId)
      else active.delete(sessionId)
    },
    cleanup: async () => {
      await server.stop()
      eventBus.dispose()
    },
  }
}

async function requestJson(url: string, init?: RequestInit): Promise<{ status: number; body: unknown; headers: Headers }> {
  const response = await requestLocal(url, init)
  return {
    status: response.status,
    body: await response.json(),
    headers: response.headers,
  }
}

async function requestLocal(url: string, init: RequestInit = {}): Promise<Response> {
  const target = new URL(url)
  const body = typeof init.body === 'string' ? init.body : undefined
  const headers = new Headers(init.headers)
  if (body && !headers.has('content-length')) {
    headers.set('content-length', Buffer.byteLength(body).toString())
  }

  return new Promise<Response>((resolve, reject) => {
    const req = httpRequest({
      hostname: target.hostname,
      port: target.port,
      path: `${target.pathname}${target.search}`,
      method: init.method ?? 'GET',
      headers: Object.fromEntries(headers.entries()),
    }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () => {
        resolve(new Response(Buffer.concat(chunks), {
          status: res.statusCode ?? 0,
          headers: res.headers as HeadersInit,
        }))
      })
    })
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

async function streamLocal(url: string, init: RequestInit = {}): Promise<Response> {
  const target = new URL(url)
  const headers = new Headers(init.headers)

  return new Promise<Response>((resolve, reject) => {
    const req = httpRequest({
      hostname: target.hostname,
      port: target.port,
      path: `${target.pathname}${target.search}`,
      method: init.method ?? 'GET',
      headers: Object.fromEntries(headers.entries()),
    }, (res) => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          let closed = false
          res.on('data', (chunk: Buffer) => {
            if (!closed) controller.enqueue(new Uint8Array(chunk))
          })
          res.on('end', () => {
            if (closed) return
            closed = true
            controller.close()
          })
          res.on('error', (error) => {
            if (closed) return
            closed = true
            controller.error(error)
          })
          req.on('close', () => {
            closed = true
          })
        },
        cancel() {
          req.destroy()
        },
      })
      resolve(new Response(stream, {
        status: res.statusCode ?? 0,
        headers: res.headers as HeadersInit,
      }))
    })
    req.on('error', reject)
    req.end()
  })
}

async function readUntil(stream: Response, marker: string): Promise<string> {
  const reader = stream.body?.getReader()
  if (!reader) return ''
  const decoder = new TextDecoder()
  let text = ''
  try {
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) break
      text += decoder.decode(chunk.value, { stream: true })
      if (text.includes(marker)) break
    }
  } finally {
    await reader.cancel().catch(() => {})
  }
  return text
}

describe('local-api-server', () => {
  const cleanupFns: Array<() => Promise<void>> = []

  afterEach(async () => {
    while (cleanupFns.length > 0) {
      const cleanup = cleanupFns.pop()
      if (cleanup) await cleanup()
    }
  })

  test('健康检查不需要 token 并返回 API 版本', async () => {
    const harness = await createHarness()
    cleanupFns.push(harness.cleanup)

    const result = await requestJson(`${harness.baseUrl}/api/health`)

    expect(result.status).toBe(200)
    expect(result.body).toEqual({ ok: true, version: '0.0.0-test', apiVersion: 'v1' })
  })

  test('非 health 接口缺少 Bearer token 时返回 unauthorized', async () => {
    const harness = await createHarness()
    cleanupFns.push(harness.cleanup)

    const result = await requestJson(`${harness.baseUrl}/api/agent/sessions`, { method: 'POST' })

    expect(result.status).toBe(401)
    expect(result.body).toEqual({ error: { code: 'unauthorized', message: '缺少或无效的 API Token' } })
  })

  test('创建 Agent 会话时调用现有会话服务', async () => {
    const harness = await createHarness()
    cleanupFns.push(harness.cleanup)

    const result = await requestJson(`${harness.baseUrl}/api/agent/sessions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '外部任务', channelId: 'channel-a', workspaceId: 'workspace-a' }),
    })

    expect(result.status).toBe(200)
    expect(result.body).toEqual({ session: createSession('created-session') })
    expect(harness.calls.created).toEqual([{ title: '外部任务', channelId: 'channel-a', workspaceId: 'workspace-a' }])
  })

  test('同一会话正在运行时发送消息返回 session_busy', async () => {
    const harness = await createHarness()
    cleanupFns.push(harness.cleanup)
    harness.setActive('session-1', true)

    const result = await requestJson(`${harness.baseUrl}/api/agent/sessions/session-1/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ userMessage: '继续分析' }),
    })

    expect(result.status).toBe(409)
    expect(result.body).toEqual({ error: { code: 'session_busy', message: '上一条消息仍在处理中，请稍候再试' } })
    expect(harness.calls.runs).toHaveLength(0)
  })

  test('发送消息返回 runId，并允许 SSE 订阅 replay 已缓存事件', async () => {
    const harness = await createHarness()
    cleanupFns.push(harness.cleanup)

    const result = await requestJson(`${harness.baseUrl}/api/agent/sessions/session-1/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ userMessage: '你好', permissionMode: 'plan' }),
    })
    const body = result.body as { runId: string; sessionId: string; status: string; eventsUrl: string }
    const assistantMessage: SDKAssistantMessage = {
      type: 'assistant',
      parent_tool_use_id: null,
      message: { content: [{ type: 'text', text: '增量文本' }] },
    }
    harness.eventBus.emit('session-1', { kind: 'sdk_message', message: assistantMessage })

    const stream = await streamLocal(`${harness.baseUrl}${body.eventsUrl}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    })
    const text = await readUntil(stream, '增量文本')

    expect(result.status).toBe(200)
    expect(body.sessionId).toBe('session-1')
    expect(body.status).toBe('started')
    expect(harness.calls.runs[0]).toMatchObject({
      sessionId: 'session-1',
      userMessage: '你好',
      channelId: 'channel-1',
      workspaceId: 'workspace-1',
      permissionModeOverride: 'plan',
    })
    expect(stream.headers.get('content-type')).toContain('text/event-stream')
    expect(text).toContain('event: run_started')
    expect(text).toContain('event: title_updated')
    expect(text).toContain('event: delta')
    expect(text).toContain('增量文本')
  })

  test('Agent 只触发错误回调时会释放运行状态', async () => {
    const runs: AgentSendInput[] = []
    const harness = await createHarness({}, {
      runAgentHeadless: async (input, callbacks) => {
        runs.push(input)
        callbacks.onError('模型调用失败')
      },
    })
    cleanupFns.push(harness.cleanup)

    const first = await requestJson(`${harness.baseUrl}/api/agent/sessions/session-1/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ userMessage: '第一次' }),
    })
    const second = await requestJson(`${harness.baseUrl}/api/agent/sessions/session-1/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ userMessage: '第二次' }),
    })

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(runs).toHaveLength(2)
  })
})
