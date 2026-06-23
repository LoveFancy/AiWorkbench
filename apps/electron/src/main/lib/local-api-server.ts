/**
 * WorkMate 本地 HTTP API Server
 *
 * 使用 Node 原生 http 实现 REST + SSE，不引入 Web 框架。
 */

import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'
import type {
  AgentSendInput,
  PromaPermissionMode,
  SDKAssistantMessage,
  SDKMessage,
  SDKToolUseBlock,
  SDKUserMessage,
} from '@proma/shared'
import {
  LOCAL_API_VERSION,
} from './local-api-types'
import type {
  LocalApiCreateSessionBody,
  LocalApiErrorCode,
  LocalApiRequestContext,
  LocalApiRunRecord,
  LocalApiSendMessageBody,
  LocalApiServerDependencies,
  LocalApiSettings,
  LocalApiSseEvent,
} from './local-api-types'
import { verifyLocalApiToken } from './local-api-settings-service'

const MAX_BODY_BYTES = 1024 * 1024
const RUN_BUFFER_LIMIT = 200
const RUN_RETENTION_MS = 5 * 60 * 1000

const ERROR_MESSAGES: Record<LocalApiErrorCode, string> = {
  unauthorized: '缺少或无效的 API Token',
  forbidden: '请求被安全策略禁止',
  not_found: '接口不存在',
  invalid_json: '请求体不是合法 JSON',
  invalid_request: '请求参数无效',
  session_not_found: 'Agent 会话不存在',
  session_busy: '上一条消息仍在处理中，请稍候再试',
  run_not_found: '运行不存在或已过期',
  too_many_runs: '本地 API 活跃运行数已达到上限',
  permission_mode_forbidden: '当前设置不允许使用 bypassPermissions',
  agent_error: 'Agent 执行失败',
  internal_error: '本地 API 服务内部错误',
}

const ERROR_STATUS: Record<LocalApiErrorCode, number> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  invalid_json: 400,
  invalid_request: 400,
  session_not_found: 404,
  session_busy: 409,
  run_not_found: 404,
  too_many_runs: 429,
  permission_mode_forbidden: 403,
  agent_error: 500,
  internal_error: 500,
}

export class LocalApiServer {
  private server: Server | null = null
  private readonly runs = new Map<string, LocalApiRunRecord>()
  private readonly sessionRuns = new Map<string, string>()
  private unsubscribeEventBus: (() => void) | null = null
  private cleanupTimer: ReturnType<typeof setInterval> | null = null

  constructor(private readonly deps: LocalApiServerDependencies) {}

  async start(): Promise<void> {
    if (this.server) return
    const settings = this.deps.getSettings()
    if (!settings.enabled) return

    const nextServer = createServer((req, res) => {
      void this.handleRequest(req, res)
    })
    this.server = nextServer
    this.unsubscribeEventBus = this.deps.eventBus.on((sessionId, payload) => {
      this.handleAgentEvent(sessionId, payload)
    })
    this.cleanupTimer = setInterval(() => this.cleanupExpiredRuns(), 60_000)

    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error): void => {
        nextServer.off('listening', onListening)
        reject(error)
      }
      const onListening = (): void => {
        nextServer.off('error', onError)
        resolve()
      }
      nextServer.once('error', onError)
      nextServer.once('listening', onListening)
      nextServer.listen({ port: settings.port, host: settings.host })
    }).catch((error) => {
      if (this.cleanupTimer) {
        clearInterval(this.cleanupTimer)
        this.cleanupTimer = null
      }
      if (this.unsubscribeEventBus) {
        this.unsubscribeEventBus()
        this.unsubscribeEventBus = null
      }
      nextServer.removeAllListeners()
      nextServer.close(() => {})
      if (this.server === nextServer) {
        this.server = null
      }
      throw error
    })
    console.log(`[本地 API] 服务已启动: http://${settings.host}:${(this.address() as AddressInfo).port}`)
  }

  async stop(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }
    if (this.unsubscribeEventBus) {
      this.unsubscribeEventBus()
      this.unsubscribeEventBus = null
    }
    for (const run of this.runs.values()) {
      for (const client of run.clients) {
        client.end()
      }
      run.clients.clear()
    }
    const server = this.server
    this.server = null
    if (!server) return
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve())
    })
    console.log('[本地 API] 服务已停止')
  }

  address(): AddressInfo | string | null {
    return this.server?.address() ?? null
  }

  async restart(): Promise<void> {
    await this.stop()
    await this.start()
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const startedAt = Date.now()
    const host = req.headers.host ?? '127.0.0.1'
    const url = new URL(req.url ?? '/', `http://${host}`)
    const ctx: LocalApiRequestContext = {
      req,
      res,
      method: req.method ?? 'GET',
      pathname: url.pathname,
      searchParams: url.searchParams,
      startedAt,
    }

    try {
      this.applyCors(ctx, this.deps.getSettings())
      if (ctx.method === 'OPTIONS') {
        res.writeHead(204)
        res.end()
        return
      }
      if (ctx.method === 'GET' && ctx.pathname === '/api/health') {
        this.writeJson(ctx, 200, { ok: true, version: this.deps.getAppVersion(), apiVersion: LOCAL_API_VERSION })
        return
      }
      if (!this.authenticate(ctx, this.deps.getSettings())) return
      await this.routeAuthenticated(ctx)
    } catch (error) {
      console.error('[本地 API] 请求处理失败:', error)
      if (!res.headersSent) this.writeError(ctx, 'internal_error')
      else res.end()
    } finally {
      this.logRequest(ctx)
    }
  }

  private async routeAuthenticated(ctx: LocalApiRequestContext): Promise<void> {
    if (ctx.method === 'POST' && ctx.pathname === '/api/agent/sessions') {
      await this.handleCreateSession(ctx)
      return
    }
    if (ctx.method === 'GET' && ctx.pathname === '/api/agent/sessions') {
      this.writeJson(ctx, 200, { sessions: this.deps.listAgentSessions() })
      return
    }

    const sessionMessages = ctx.pathname.match(/^\/api\/agent\/sessions\/([^/]+)\/messages$/)
    if (sessionMessages && ctx.method === 'GET') {
      const sessionId = decodeURIComponent(sessionMessages[1]!)
      if (!this.deps.getAgentSessionMeta(sessionId)) {
        this.writeError(ctx, 'session_not_found')
        return
      }
      this.writeJson(ctx, 200, { messages: this.deps.getAgentSessionSDKMessages(sessionId) })
      return
    }
    if (sessionMessages && ctx.method === 'POST') {
      await this.handleSendMessage(ctx, decodeURIComponent(sessionMessages[1]!))
      return
    }

    const sessionEvents = ctx.pathname.match(/^\/api\/agent\/sessions\/([^/]+)\/events$/)
    if (sessionEvents && ctx.method === 'GET') {
      this.handleSubscribeEvents(ctx, decodeURIComponent(sessionEvents[1]!))
      return
    }

    const sessionStop = ctx.pathname.match(/^\/api\/agent\/sessions\/([^/]+)\/stop$/)
    if (sessionStop && ctx.method === 'POST') {
      this.handleStop(ctx, decodeURIComponent(sessionStop[1]!))
      return
    }

    this.writeError(ctx, 'not_found')
  }

  private async handleCreateSession(ctx: LocalApiRequestContext): Promise<void> {
    const body = await this.readJsonBody<LocalApiCreateSessionBody>(ctx)
    if (!body.ok) return
    const session = this.deps.createAgentSession(
      body.value.title,
      body.value.channelId,
      body.value.workspaceId,
      body.value.expertGroupId,
      body.value.expertPluginId,
      body.value.expertIntroduction,
    )
    this.writeJson(ctx, 200, { session })
  }

  private async handleSendMessage(ctx: LocalApiRequestContext, sessionId: string): Promise<void> {
    const settings = this.deps.getSettings()
    const session = this.deps.getAgentSessionMeta(sessionId)
    if (!session) {
      this.writeError(ctx, 'session_not_found')
      return
    }
    if (this.deps.isAgentSessionActive(sessionId) || this.sessionRuns.has(sessionId)) {
      this.writeError(ctx, 'session_busy')
      return
    }
    if (settings.maxConcurrentRuns != null && this.countActiveRuns() >= settings.maxConcurrentRuns) {
      this.writeError(ctx, 'too_many_runs')
      return
    }

    const body = await this.readJsonBody<LocalApiSendMessageBody>(ctx)
    if (!body.ok) return
    const userMessage = typeof body.value.userMessage === 'string' ? body.value.userMessage.trim() : ''
    if (!userMessage) {
      this.writeError(ctx, 'invalid_request', 'userMessage 不能为空')
      return
    }

    const permissionMode = this.resolvePermissionMode(body.value.permissionMode, settings)
    if (!permissionMode) {
      this.writeError(ctx, 'permission_mode_forbidden')
      return
    }
    const channelId = body.value.channelId ?? session.channelId
    if (!channelId) {
      this.writeError(ctx, 'invalid_request', 'channelId 不能为空')
      return
    }

    const runId = randomUUID()
    const run: LocalApiRunRecord = {
      runId,
      sessionId,
      startedAt: Date.now(),
      events: [],
      clients: new Set(),
    }
    this.runs.set(runId, run)
    this.sessionRuns.set(sessionId, runId)
    this.pushRunEvent(run, 'run_started', { runId, sessionId, startedAt: run.startedAt })

    const input: AgentSendInput = {
      sessionId,
      userMessage,
      channelId,
      modelId: body.value.modelId,
      workspaceId: body.value.workspaceId ?? session.workspaceId,
      permissionModeOverride: permissionMode,
      mentionedSkills: Array.isArray(body.value.mentionedSkills) ? body.value.mentionedSkills : [],
      mentionedSessionIds: Array.isArray(body.value.mentionedSessionIds) ? body.value.mentionedSessionIds : [],
      selectedMcpServers: Array.isArray(body.value.selectedMcpServers) ? body.value.selectedMcpServers : [],
      startedAt: run.startedAt,
    }

    void this.deps.runAgentHeadless(input, {
      source: 'bridge',
      onError: (error) => {
        this.pushRunEvent(run, 'error', { code: 'agent_error', message: error })
        this.finishRun(run, sessionId)
      },
      onComplete: () => {
        if (run.finishedAt != null) return
        this.pushRunEvent(run, 'done', { stoppedByUser: false })
        this.finishRun(run, sessionId)
      },
      onTitleUpdated: (title) => {
        this.pushRunEvent(run, 'title_updated', { title })
      },
    }).catch((error) => {
      const message = error instanceof Error ? error.message : String(error)
      this.pushRunEvent(run, 'error', { code: 'agent_error', message })
      this.finishRun(run, sessionId)
    })

    this.writeJson(ctx, 200, {
      runId,
      sessionId,
      status: 'started',
      eventsUrl: `/api/agent/sessions/${encodeURIComponent(sessionId)}/events?runId=${encodeURIComponent(runId)}`,
    })
  }

  private handleSubscribeEvents(ctx: LocalApiRequestContext, sessionId: string): void {
    const runId = ctx.searchParams.get('runId')
    const run = runId ? this.runs.get(runId) : undefined
    if (!run || run.sessionId !== sessionId) {
      this.writeError(ctx, 'run_not_found')
      return
    }

    ctx.res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    })
    for (const event of run.events) {
      this.writeSse(ctx.res, event)
    }
    if (run.finishedAt != null) {
      ctx.res.end()
      return
    }
    run.clients.add(ctx.res)
    ctx.req.on('close', () => {
      run.clients.delete(ctx.res)
    })
  }

  private handleStop(ctx: LocalApiRequestContext, sessionId: string): void {
    const wasActive = this.deps.isAgentSessionActive(sessionId) || this.sessionRuns.has(sessionId)
    this.deps.stopAgent(sessionId)
    const runId = this.sessionRuns.get(sessionId)
    if (runId) {
      const run = this.runs.get(runId)
      if (run) {
        this.pushRunEvent(run, 'done', { stoppedByUser: true })
        this.finishRun(run, sessionId)
      }
    }
    this.writeJson(ctx, 200, { sessionId, stopped: true, wasActive })
  }

  private handleAgentEvent(sessionId: string, payload: { kind: 'sdk_message'; message: SDKMessage } | { kind: 'proma_event'; event: { type: string; [key: string]: unknown } }): void {
    const runId = this.sessionRuns.get(sessionId)
    if (!runId) return
    const run = this.runs.get(runId)
    if (!run) return

    if (payload.kind === 'proma_event') {
      if (payload.event.type === 'external_run_started') return
      if (payload.event.type === 'title_updated' && typeof payload.event.title === 'string') {
        this.pushRunEvent(run, 'title_updated', { title: payload.event.title })
      }
      return
    }

    for (const event of this.sdkMessageToSseEvents(payload.message)) {
      if (run.finishedAt != null) return
      this.pushRunEvent(run, event.event, event.data)
      if (event.event === 'done') {
        this.finishRun(run, sessionId)
      }
    }
  }

  private sdkMessageToSseEvents(message: SDKMessage): LocalApiSseEvent[] {
    if (message.type === 'assistant') {
      const assistant = message as SDKAssistantMessage
      return assistant.message.content.flatMap((block): LocalApiSseEvent[] => {
        if (block.type === 'text' && 'text' in block) {
          return [{ event: 'delta', data: { text: String(block.text) } }]
        }
        if (block.type === 'tool_use') {
          const tool = block as SDKToolUseBlock
          return [{ event: 'tool_start', data: { id: tool.id, name: tool.name, input: tool.input } }]
        }
        return []
      })
    }
    if (message.type === 'user') {
      const user = message as SDKUserMessage
      return (user.message?.content ?? []).flatMap((block) => {
        if (block.type !== 'tool_result') return []
        const content = typeof block.content === 'string' ? block.content : JSON.stringify(block.content ?? '')
        return [{
          event: 'tool_result',
          data: { id: block.tool_use_id, content, isError: block.is_error ?? false },
        }]
      })
    }
    if (message.type === 'result') {
      return [{ event: 'done', data: { stoppedByUser: false } }]
    }
    return []
  }

  private pushRunEvent(run: LocalApiRunRecord, event: string, data: Record<string, unknown>): void {
    const sseEvent = { event, data }
    run.events.push(sseEvent)
    if (run.events.length > RUN_BUFFER_LIMIT) run.events.shift()
    for (const client of run.clients) {
      this.writeSse(client, sseEvent)
    }
  }

  private writeSse(res: ServerResponse, event: LocalApiSseEvent): void {
    res.write(`event: ${event.event}\n`)
    res.write(`data: ${JSON.stringify(event.data)}\n\n`)
  }

  private endRunClients(run: LocalApiRunRecord): void {
    for (const client of run.clients) {
      client.end()
    }
    run.clients.clear()
  }

  private finishRun(run: LocalApiRunRecord, sessionId: string): void {
    if (run.finishedAt != null) return
    run.finishedAt = Date.now()
    this.sessionRuns.delete(sessionId)
    this.endRunClients(run)
  }

  private resolvePermissionMode(input: LocalApiSendMessageBody['permissionMode'], settings: LocalApiSettings): PromaPermissionMode | null {
    const mode = input === 'ask' ? 'auto' : (input ?? settings.defaultPermissionMode)
    if (mode === 'bypassPermissions' && !settings.allowBypassPermissions) return null
    if (mode === 'auto' || mode === 'plan' || mode === 'bypassPermissions') return mode
    return 'auto'
  }

  private authenticate(ctx: LocalApiRequestContext, settings: LocalApiSettings): boolean {
    const auth = ctx.req.headers.authorization ?? ''
    const prefix = 'Bearer '
    if (!auth.startsWith(prefix) || !verifyLocalApiToken(auth.slice(prefix.length), settings.apiTokenHash)) {
      this.writeError(ctx, 'unauthorized')
      return false
    }
    return true
  }

  private async readJsonBody<T>(ctx: LocalApiRequestContext): Promise<{ ok: true; value: T } | { ok: false }> {
    let size = 0
    const chunks: Buffer[] = []
    for await (const chunk of ctx.req) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      size += buffer.length
      if (size > MAX_BODY_BYTES) {
        this.writeError(ctx, 'invalid_request', '请求体过大')
        return { ok: false }
      }
      chunks.push(buffer)
    }
    if (chunks.length === 0) return { ok: true, value: {} as T }
    try {
      return { ok: true, value: JSON.parse(Buffer.concat(chunks).toString('utf-8')) as T }
    } catch {
      this.writeError(ctx, 'invalid_json')
      return { ok: false }
    }
  }

  private writeJson(ctx: LocalApiRequestContext, status: number, body: unknown): void {
    ctx.res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
    ctx.res.end(JSON.stringify(body))
  }

  private writeError(ctx: LocalApiRequestContext, code: LocalApiErrorCode, message = ERROR_MESSAGES[code]): void {
    this.writeJson(ctx, ERROR_STATUS[code], { error: { code, message } })
  }

  private applyCors(ctx: LocalApiRequestContext, settings: LocalApiSettings): void {
    const origin = ctx.req.headers.origin
    if (!origin) return
    if (!settings.corsOrigins.includes(origin)) return
    ctx.res.setHeader('Access-Control-Allow-Origin', origin)
    ctx.res.setHeader('Vary', 'Origin')
    ctx.res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
    ctx.res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  }

  private countActiveRuns(): number {
    let count = 0
    for (const run of this.runs.values()) {
      if (run.finishedAt == null) count++
    }
    return count
  }

  private cleanupExpiredRuns(): void {
    const now = Date.now()
    for (const [runId, run] of this.runs) {
      if (run.finishedAt != null && now - run.finishedAt > RUN_RETENTION_MS) {
        this.runs.delete(runId)
      }
    }
  }

  private logRequest(ctx: LocalApiRequestContext): void {
    if (!this.deps.getSettings().requestLoggingEnabled) return
    const statusCode = ctx.res.statusCode
    const elapsedMs = Date.now() - ctx.startedAt
    console.log(`[本地 API] ${ctx.method} ${ctx.pathname} ${statusCode} ${elapsedMs}ms`)
  }
}
