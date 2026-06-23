/**
 * AgentOrchestrator — Agent 编排层
 *
 * 从 agent-service.ts 提取的核心业务逻辑，负责：
 * - 并发守卫（同一会话不允许并行请求）
 * - 渠道查找 + API Key 解密
 * - 环境变量构建 + SDK 路径解析
 * - 用户/助手消息持久化
 * - 事件流遍历 + 文本累积 + 事件持久化
 * - 错误处理 + 部分内容保存
 * - 自动标题生成
 *
 * 通过 EventBus 分发 AgentEvent，通过 SessionCallbacks 发送控制信号，
 * 完全解耦 Electron IPC，可独立测试（mock Adapter + EventBus）。
 */

import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import type { AgentSendInput, AgentMessage, AgentProviderAdapter, AgentSessionMeta, TypedError, RetryAttempt, SDKMessage, RewindSessionResult, SdkBeta, AgentGenerateTitleInput } from '@proma/shared'
import {
  PROMA_DEFAULT_PERMISSION_MODE,
  SAFE_TOOLS,
} from '@proma/shared'
import type { PermissionRequest, PromaPermissionMode, AskUserRequest, ExitPlanModeRequest } from '@proma/shared'
import type { ClaudeAgentQueryOptions } from './adapters/claude-agent-adapter'
import { AgentEventBus } from './agent-event-bus'
import { decryptApiKey, getChannelById } from './channel-manager'
import { injectAutomationMcpServer } from './automation-agent-tools'
import { normalizeAnthropicBaseUrlForSdk, getPromaUserAgent } from '@proma/core'
import pkg from '../../../package.json' with { type: 'json' }
import { appendSDKMessages, updateAgentSessionMeta, getAgentSessionMeta, getAgentSessionMessages } from './agent-session-manager'
import { getAgentWorkspace, ensurePluginManifest, getWorkspaceConnectorsConfig, migrateMcpJsonToConnectors, syncDefaultConnectorsToWorkspace, readSkillDirsFromConnectorJson } from './agent-workspace-manager'
import { getAgentSessionWorkspacePath } from './config-paths'
import { getRuntimeStatus } from './runtime-init'
import { getSettings } from './settings-service'
import {
  MAX_SAME_MODEL_RETRIES,
  selectNextCandidateModel,
  resolveAutoModeConfig,
  resolveInitialModel,
  findChannelForModel,
  filterCandidatePoolByCapabilities,
} from './agent-auto-model-switcher'
import {
  MAX_AUTO_RETRIES,
  MAX_AUTO_RETRY_WAIT_MS,
  getRetryDelayMs,
  sdkRunSingleAttempt,
  type SdkRunContext,
  type SdkRunCallbacks,
  type SdkRunnerDeps,
} from './orchestrator/agent-sdk-retry-loop'
import {
  sdkPermissionModeForPromaMode,
  mergeDisallowedTools,
  DEFAULT_MODEL_ID,
  supports1MContext,
} from './orchestrator/constants'
import { buildContextPrompt, buildRecoveryPrompt, buildReferencedSessionsPrompt, MAX_CONTEXT_MESSAGES } from './orchestrator/context-prompt'
import { collectAttachedDirectories } from './orchestrator/workspace-context'
import { resolveSDKCliPath, getAgentPluginPaths } from './orchestrator/sdk-path'
import {
  buildErrorSDKMessage,
  shouldClearSDKSessionId,
  logStderr,
} from './orchestrator/error-presenter'
import { buildSdkEnv } from './orchestrator/sdk-env'
import { buildAgentUserContent } from './orchestrator/agent-user-content'
import {
  buildMcpServers,
  collectConnectorDisabledTools,
  injectMemoryTools,
  injectNanoBananaTools,
  injectWebSearchTools,
} from './orchestrator/mcp-builder'
import { generateTitle, autoGenerateTitle } from './orchestrator/title-generator'
import { persistSDKMessages } from './orchestrator/sdk-message-persister'
import { prepareResumeFallbackRecovery, prepareSessionNotFoundRecovery } from './orchestrator/resume-recovery'
import { rewindSession as rewindSessionImpl } from './orchestrator/rewind'
import { getRetryLimitForCategory } from './orchestrator/retry-policy'
import { buildSystemPrompt, buildDynamicContext, buildAgentsForSession } from './agent-prompt-builder'
import { permissionService } from './agent-permission-service'
import type { PermissionResult, CanUseToolOptions } from './agent-permission-service'
import { askUserService } from './agent-ask-user-service'
import { exitPlanService, type ExitPlanPermissionResult } from './agent-exit-plan-service'
import { applyAgentModelRoutingToEnv, resolveAgentModelRouting } from './agent-model-routing'
import { getMemoryConfig } from './memory-service'
import { validateToolInput } from './agent-tool-input-validator'
import { estimateTokenCount, WRITE_CONTENT_TOKEN_THRESHOLD } from './agent-tool-token-estimator'
import { resolveExpertGroupRuntime } from './agent-expert-group-manager'
import { detectAgentReadableFileKind, guardToolUseBeforePermission, type RunToolGuardContext } from './agent-tool-read-guard'

// ===== 类型定义 =====

/**
 * 会话控制信号回调
 *
 * 解耦 Electron webContents，使 Orchestrator 可独立测试。
 * agent-service.ts 负责将这些回调绑定到 webContents.send()。
 */
export interface SessionCallbacks {
  /** 发送流式错误 */
  onError: (error: string) => void
  /** 发送流式完成（携带已持久化的消息列表） */
  onComplete: (messages?: AgentMessage[], opts?: { stoppedByUser?: boolean; startedAt?: number; resultSubtype?: string; backgroundTasksPending?: boolean }) => void
  /** 发送标题更新 */
  onTitleUpdated: (title: string) => void
  /** 用户消息已持久化，外部入口可据此通知前端切到实时会话 */
  onRunStarted?: (opts: { startedAt: number }) => void
}

function isImageAttachment(input: { filename: string; mediaType?: string; path?: string }): boolean {
  const target = input.path || input.filename
  return detectAgentReadableFileKind(target, input.mediaType) === 'raster_image'
}

function getChannelModelSupportsMultimodal(channel: ReturnType<typeof getChannelById>, modelId: string): boolean {
  return channel?.models.find((model) => model.id === modelId)?.supportsMultimodal === true
}

function buildModelSwitchedSystemMessage(fromModel: string, toModel: string): SDKMessage {
  return {
    type: 'system',
    subtype: 'model_switched',
    from_model: fromModel,
    to_model: toModel,
    _createdAt: Date.now(),
    uuid: randomUUID(),
  } as unknown as SDKMessage
}


// ===== AgentOrchestrator =====

export class AgentOrchestrator {
  private adapter: AgentProviderAdapter
  private eventBus: AgentEventBus
  private activeSessions = new Map<string, number>()

  /** 队列消息本地记录（sessionId → UUID 集合，用于防重） */
  private queuedMessageUuids = new Map<string, Set<string>>()

  /** 被用户手动中止的会话集合（在 stop 中标记，catch block 中消费） */
  private stoppedBySessions = new Set<string>()

  /** 运行中会话的当前权限模式（支持运行时动态切换） */
  private sessionPermissionModes = new Map<string, PromaPermissionMode>()

  constructor(adapter: AgentProviderAdapter, eventBus: AgentEventBus) {
    this.adapter = adapter
    this.eventBus = eventBus
  }

  /**
   * 消费一次用户手动停止标记。
   *
   * SDK 在 query.close() 后不一定走异常路径：某些版本会先正常 yield result 再结束迭代。
   * 因此停止标记必须在所有终态路径统一消费，而不能只依赖 catch 块。
   */
  private consumeStoppedByUser(sessionId: string): boolean {
    const stoppedByUser = this.stoppedBySessions.has(sessionId)
    this.stoppedBySessions.delete(sessionId)
    return stoppedByUser
  }

  /**
   * Session-not-found 恢复：清除失效的 sdkSessionId，切换到上下文回填模式
   *
   * 当 resume 的目标 session 已过期/被清理时，SDK 会抛出 "No conversation found" 错误。
   * 此方法执行恢复的公共逻辑，调用方负责设置 existingSdkSessionId = undefined 和流程控制（break/continue）。
   *
   * @returns lastRetryableError 描述字符串
   */
  /**
   * Resume 失败恢复：清除 SDK resume 关系，注入 session 自引用让 Agent 读取完整历史继续工作。
   *
   * 适用于 SDK session 过期、thinking signature 跨模型不兼容等场景。
   * 使用 <session_recovery> 标签指向当前会话的 JSONL 历史文件，Agent 会自动读取并恢复上下文，
   * 比 buildContextPrompt（仅注入 20 条摘要）提供完整得多的上下文连续性。
   */
  /**
   * 发送消息并流式推送事件
   *
   * 核心编排方法，从 agent-service.ts 的 runAgent 提取。
   * 通过 EventBus 分发 AgentEvent，通过 callbacks 发送控制信号。
   */
  async sendMessage(input: AgentSendInput, callbacks: SessionCallbacks): Promise<void> {
    const _diagStart = Date.now()
    const _diag = (tag: string) => console.log(`[DIAG][Agent 编排] [${tag}] sessionId=${input.sessionId}, elapsed=${Date.now() - _diagStart}ms, ts=${Date.now()}`)
    _diag('sendMessage 入口')
    // Event Loop 健康检查：setImmediate 回调延迟反映主线程拥堵程度
    const _elCheckStart = Date.now()
    setImmediate(() => {
      const elDelay = Date.now() - _elCheckStart
      if (elDelay > 50) {
        console.warn(`[DIAG][Agent 编排] ⚠️ Event Loop 延迟: ${elDelay}ms (>50ms 表示主线程拥堵)`)
      } else {
        console.log(`[DIAG][Agent 编排] Event Loop 延迟: ${elDelay}ms (正常)`)
      }
    })
    const { sessionId, userMessage, channelId, modelId, workspaceId, additionalDirectories, attachments, customMcpServers, permissionModeOverride, mentionedSkills, mentionedSessionIds, automationContext, selectedMcpServers } = input
    const stderrChunks: string[] = []

    // 0. 并发保护
    if (this.activeSessions.has(sessionId)) {
      console.warn(`[Agent 编排] 会话 ${sessionId} 正在处理中，拒绝新请求`)
      callbacks.onError('上一条消息仍在处理中，请稍候再试')
      callbacks.onComplete([], { startedAt: input.startedAt })
      return
    }

    // 0.5 清除上一轮中断标记
    try { updateAgentSessionMeta(sessionId, { stoppedByUser: false }) } catch { /* 会话可能已删除 */ }

    // 环境 / 配置类错误的统一上报：持久化为 TypedError 消息，由 SDKMessageRenderer 渲染
    const reportPreflightError = (typedError: TypedError) => {
      const errorContent = typedError.title
        ? `${typedError.title}: ${typedError.message}`
        : typedError.message
      const errorSDKMsg: SDKMessage = {
        type: 'assistant',
        message: {
          content: [{ type: 'text', text: errorContent }],
        },
        parent_tool_use_id: null,
        error: { message: typedError.message, errorType: typedError.code },
        _createdAt: Date.now(),
        _errorCode: typedError.code,
        _errorTitle: typedError.title,
        _errorDetails: typedError.details,
        _errorCanRetry: typedError.canRetry,
        _errorActions: typedError.actions,
      } as unknown as SDKMessage
      try { appendSDKMessages(sessionId, [errorSDKMsg]) } catch (e) {
        console.error('[Agent 编排] 持久化 preflight error 失败:', e)
      }
      callbacks.onError(errorContent)
      callbacks.onComplete([], { startedAt: input.startedAt })
    }

    // 1. Windows 平台：检查 Shell 环境可用性
    if (process.platform === 'win32') {
      const runtimeStatus = getRuntimeStatus()
      const shellStatus = runtimeStatus?.shell

      if (shellStatus && !shellStatus.gitBash?.available) {
        reportPreflightError({
          code: 'windows_shell_missing',
          title: 'Windows 环境未就绪',
          message:
            '需要 Git Bash 才能运行 Agent。建议安装 Git for Windows（自带 Git Bash），安装完成后点「打开环境检测」刷新状态。',
          details: [
            `Git Bash: ${shellStatus.gitBash?.error || '未检测到'}`,
          ],
          actions: [
            { key: 'e', label: '打开环境检测', action: 'open_environment_check' },
            { key: 'g', label: '去官方下载 Git', action: 'open_external', payload: 'https://git-scm.com/download/win' },
          ],
          canRetry: false,
        })
        return
      }
    }

    // 2. 获取渠道信息并解密 API Key
    let channel = getChannelById(channelId)
    if (!channel) {
      reportPreflightError({
        code: 'channel_not_found',
        title: '渠道不存在',
        message: '当前会话引用的渠道已被删除或不可用，请在设置中重新选择。',
        actions: [
          { key: 's', label: '打开渠道设置', action: 'open_channel_settings' },
        ],
        canRetry: false,
      })
      return
    }

    let apiKey: string
    try {
      apiKey = decryptApiKey(channelId)
    } catch {
      reportPreflightError({
        code: 'api_key_decrypt_failed',
        title: 'API Key 解密失败',
        message: '无法解密此渠道的 API Key，可能是系统密钥环异常。请到设置中重新填写 API Key。',
        actions: [
          { key: 's', label: '打开渠道设置', action: 'open_channel_settings' },
        ],
        canRetry: false,
      })
      return
    }

    // 诊断日志：输出渠道认证信息，方便排查 403/401 问题
    console.log(`[Agent 编排] 渠道信息: channelId=${channelId}, modelId=${modelId}, provider=${channel.provider}, baseUrl="${channel.baseUrl || '(default)'}", apiKey=${apiKey ? apiKey.slice(0, 8) + '...' + apiKey.slice(-4) : '(empty)'}`)
    _diag('渠道/apiKey 解密完成')

    // 2.1 立即抢占会话槽位（在所有同步检查通过后、第一个 await 之前）
    // 防止 buildSdkEnv 等 await 期间并发调用绕过上方的检查，导致多条重复消息写入 JSONL
    // finally 块会通过 generation 匹配来安全清理，不影响正常流程
    const runGeneration = Date.now()
    // 优先使用渲染进程传来的 startedAt（确保 STREAM_COMPLETE 竞态保护比较的是同一个值），
    // 否则用本地 runGeneration 作为回退（headless 模式等无渲染进程场景）
    const streamStartedAt = input.startedAt ?? runGeneration
    this.activeSessions.set(sessionId, runGeneration)

    const releaseActiveRun = (): void => {
      // 在发送 STREAM_COMPLETE 前释放 active slot，避免渲染进程已进入空闲态、
      // 主进程仍在 finally 前短暂拒绝下一条消息。
      if (this.activeSessions.get(sessionId) !== runGeneration) return
      this.activeSessions.delete(sessionId)
      this.sessionPermissionModes.delete(sessionId)
      this.queuedMessageUuids.delete(sessionId)
    }
    const completeRun = (
      messages?: AgentMessage[],
      opts?: { stoppedByUser?: boolean; startedAt?: number; resultSubtype?: string },
    ): void => {
      releaseActiveRun()
      callbacks.onComplete(messages, opts)
    }
    // 轻量完成：turn 主体结束但仍有后台任务在飞行。
    // 关键区别——不调用 releaseActiveRun，保留 activeSessions/activeChannels/sessionPermissionModes，
    // 以便 ① adapter 保持的通道在任务完成时自动续轮 ② 用户在等待期手动注入消息能复用通道。
    // UI 侧通过 backgroundTasksPending 进入"空闲可输入"态（spinner 停、输入框启用）。
    const idleComplete = (
      messages?: AgentMessage[],
      opts?: { startedAt?: number; resultSubtype?: string },
    ): void => {
      callbacks.onComplete(messages, { ...opts, backgroundTasksPending: true })
    }
    const failRun = (
      error: string,
      messages?: AgentMessage[],
      opts?: { stoppedByUser?: boolean; startedAt?: number; resultSubtype?: string },
    ): void => {
      releaseActiveRun()
      callbacks.onError(error)
      callbacks.onComplete(messages, opts)
    }

    // 3. 构建环境变量
    // 同步凭证到 process.env（SDK in-process 代码可能直接读取 process.env）
    // 先清理再注入，确保 SDK 无论从 env 选项还是 process.env 都拿到正确值
    delete process.env.ANTHROPIC_API_KEY
    delete process.env.ANTHROPIC_AUTH_TOKEN
    delete process.env.ANTHROPIC_BASE_URL
    delete process.env.ANTHROPIC_CUSTOM_HEADERS
    if (channel.provider === 'kimi-coding') {
      // Kimi Coding Plan：只用 Bearer + 必须带 User-Agent
      process.env.ANTHROPIC_AUTH_TOKEN = apiKey
      process.env.ANTHROPIC_CUSTOM_HEADERS = `User-Agent: ${getPromaUserAgent(pkg.version)}`
    } else if (channel.provider === 'xiaomi-token-plan') {
      // 小米 Token Plan：Bearer + 必须带 User-Agent
      process.env.ANTHROPIC_AUTH_TOKEN = apiKey
      process.env.ANTHROPIC_CUSTOM_HEADERS = `User-Agent: ${getPromaUserAgent(pkg.version)}`
    } else if (channel.provider === 'minimax') {
      // MiniMax Coding Plan：Claude Code 兼容配置使用 Bearer
      process.env.ANTHROPIC_AUTH_TOKEN = apiKey
    } else {
      process.env.ANTHROPIC_API_KEY = apiKey
    }
    // 使用与 buildSdkEnv 相同的规范化逻辑，确保 process.env 和 sdkEnv 中的 URL 一致
    if (channel.baseUrl && channel.baseUrl !== 'https://api.anthropic.com') {
      process.env.ANTHROPIC_BASE_URL = normalizeAnthropicBaseUrlForSdk(channel.baseUrl)
    }

    _diag('开始构建 sdkEnv (await buildSdkEnv)')
    const modelRouting = resolveAgentModelRouting({ modelId: modelId || DEFAULT_MODEL_ID, provider: channel.provider })
    let sdkEnv = await buildSdkEnv(apiKey, channel.baseUrl, channel.provider)
    applyAgentModelRoutingToEnv(sdkEnv, modelRouting)
    _diag('sdkEnv 构建完成')

    // 4. 读取已有的 SDK session ID（用于 resume）
    _diag('读取 sessionMeta')
    const sessionMeta = getAgentSessionMeta(sessionId)
    let existingSdkSessionId = sessionMeta?.sdkSessionId
    const runHasImageInput = (attachments ?? []).some(isImageAttachment)
    const runRequiresVision = runHasImageInput || sessionMeta?.requiresVisionContext === true

    // 4.1 检测回退后的 resume 截断点（快照回退功能）
    let rewindResumeAt: string | undefined
    if (sessionMeta?.resumeAtMessageUuid) {
      rewindResumeAt = sessionMeta.resumeAtMessageUuid
      // 消费一次后清除
      updateAgentSessionMeta(sessionId, { resumeAtMessageUuid: undefined })
      console.log(`[Agent 编排] 检测到回退 resume: resumeSessionAt=${rewindResumeAt}`)
    }

    console.log(`[Agent 编排] Resume 状态: sdkSessionId=${existingSdkSessionId || '无'}, proma sessionId=${sessionId}`)

    // 5. 持久化用户消息（SDKMessage 格式）
    const userSDKMsg: SDKMessage = {
      type: 'user',
      message: {
        content: [{ type: 'text', text: userMessage }],
      },
      parent_tool_use_id: null,
      _createdAt: Date.now(),
    } as unknown as SDKMessage
    appendSDKMessages(sessionId, [userSDKMsg])
    callbacks.onRunStarted?.({ startedAt: streamStartedAt })
    _diag('用户消息已持久化, onRunStarted 已触发')

    // 6. 状态初始化
    const accumulatedMessages: SDKMessage[] = []
    let resolvedModel = modelId || DEFAULT_MODEL_ID

    // Auto Mode：可切换渠道 local 副本
    let currentChannelId = channelId

    // Auto Mode 配置解析与初始模型确定
    _diag('开始 resolveAutoModeConfig (await)')
    const autoModeConfig = await resolveAutoModeConfig()
    _diag('resolveAutoModeConfig 完成')
    if (autoModeConfig.enabled && runRequiresVision) {
      const multimodalPool = filterCandidatePoolByCapabilities(autoModeConfig.candidatePool, { requiresMultimodal: true })
      const availableMultimodalPool = multimodalPool.filter((candidate) => autoModeConfig.availableModelIds.has(candidate.modelId))
      if (availableMultimodalPool.length === 0) {
        reportPreflightError({
          code: 'model_not_support_multimodal',
          title: 'Auto Mode 缺少多模态模型',
          message: '当前会话需要多模态模型，但 Auto Mode 候选池中没有可用的多模态模型。请在设置中加入支持图片理解的候选模型。',
          actions: [
            { key: 's', label: '打开 Agent 设置', action: 'open_agent_settings' },
          ],
          canRetry: false,
        })
        return
      }
    }
    if (!autoModeConfig.enabled && runRequiresVision && !getChannelModelSupportsMultimodal(channel, modelId || DEFAULT_MODEL_ID)) {
      reportPreflightError({
        code: 'model_not_support_multimodal',
        title: '当前模型不支持图片理解',
        message: '当前会话包含图片上下文，请切换到支持多模态的模型，或新建会话处理纯文本任务。',
        actions: [
          { key: 's', label: '切换模型', action: 'open_agent_settings' },
        ],
        canRetry: false,
      })
      return
    }
    const { activeModelId, state: autoModeState } = resolveInitialModel(
      sessionId,
      modelId,
      autoModeConfig,
      { requiresMultimodal: runRequiresVision },
    )

    if (autoModeConfig.enabled && activeModelId !== modelId) {
      console.log(`[Auto Mode] 初始模型切换: ${modelId || DEFAULT_MODEL_ID} -> ${activeModelId}`)
      const initialSwitchMessage = buildModelSwitchedSystemMessage('Auto', activeModelId)
      accumulatedMessages.push(initialSwitchMessage)
      this.eventBus.emit(sessionId, { kind: 'sdk_message', message: initialSwitchMessage })
      const candidateRef = autoModeConfig.candidatePool.find((c) => c.modelId === activeModelId)
      const chInfo = findChannelForModel(activeModelId, candidateRef?.channelId)
      if (chInfo && chInfo.channelId !== currentChannelId) {
        console.log(`[Auto Mode] 初始渠道切换: ${currentChannelId} -> ${chInfo.channelId} (模型: ${activeModelId})`)
        currentChannelId = chInfo.channelId
        channel = getChannelById(chInfo.channelId)!
        apiKey = chInfo.apiKey
        sdkEnv = await buildSdkEnv(apiKey, chInfo.baseUrl, chInfo.provider)
        const initRouting = resolveAgentModelRouting({ modelId: activeModelId, provider: chInfo.provider })
        applyAgentModelRoutingToEnv(sdkEnv, initRouting)
      }
    }
    resolvedModel = activeModelId


    let titleGenerationStarted = false
    let agentCwd: string | undefined
    let workspaceSlug: string | undefined
    let workspace: import('@proma/shared').AgentWorkspace | undefined

    try {
      // 8. 动态导入 SDK
      _diag('开始动态导入 SDK (await import)')
      const sdk = await import('@anthropic-ai/claude-agent-sdk')
      _diag('SDK 动态导入完成')

      // 9. 构建 SDK query
      _diag('开始 resolveSDKCliPath')
      const cliPath = resolveSDKCliPath()
      _diag(`resolveSDKCliPath 完成: ${cliPath}`)

      if (!existsSync(cliPath)) {
        const subpkg = `@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}`
        console.error(`[Agent 编排] SDK native binary 不存在: ${cliPath}`)
        reportPreflightError({
          code: 'claude_binary_not_found',
          title: 'Claude 核心未就绪',
          message:
            '应用安装包里缺少 Claude Agent SDK 的核心可执行文件（claude.exe）。这通常是打包时未包含当前平台的 SDK 组件导致。请重新下载最新安装包，或提交 issue 告知我们。',
          details: [
            `缺失文件: ${cliPath}`,
            `需要的子包: ${subpkg}`,
          ],
          actions: [
            {
              key: 'd',
              label: '下载最新安装包',
              action: 'open_external',
              payload: 'https://proma.cool/download',
            },
            {
              key: 'i',
              label: '报告问题',
              action: 'open_external',
              payload: 'https://github.com/ErlichLiu/Proma/issues/new',
            },
          ],
          canRetry: false,
        })
        return
      }

      console.log(
        `[Agent 编排] 启动 SDK — binary: ${cliPath}, 模型: ${modelId || DEFAULT_MODEL_ID}, resume: ${existingSdkSessionId ?? '无'}`,
      )

      // 确定 Agent 工作目录
      _diag('开始确定 Agent 工作目录')
      agentCwd = homedir()
      workspaceSlug = undefined
      workspace = undefined
      if (workspaceId) {
        const ws = getAgentWorkspace(workspaceId)
        if (ws) {
          agentCwd = getAgentSessionWorkspacePath(ws.slug, sessionId)
          workspaceSlug = ws.slug
          workspace = ws
          console.log(`[Agent 编排] 使用 session 级别 cwd: ${agentCwd} (${ws.name}/${sessionId})`)

          // 连接器：迁移旧 mcp.json + 同步预置连接器
          try {
            migrateMcpJsonToConnectors(ws.slug)
            syncDefaultConnectorsToWorkspace(ws.slug)
          } catch (err) {
            console.warn('[Agent 编排] 连接器同步失败:', err)
          }

          ensurePluginManifest(ws.slug, ws.name)

          if (existingSdkSessionId) {
            console.log(`[Agent 编排] 将尝试 resume: ${existingSdkSessionId}`)
          } else {
            console.log(`[Agent 编排] 无 sdkSessionId，将作为新会话启动（回填历史上下文）`)
          }
        }
      }

      // 9.4.1 Fork session JSONL 迁移已在 forkAgentSession 中完成，
      // fork 后的会话直接使用自己的 cwd，无需回退到源目录。
      // forkSourceDir 仅作为备用参考字段保留，不再影响 agentCwd。

      // 9.5 确保 SDK 项目设置（plansDirectory → .context）
      _diag('开始写入 SDK 项目设置 (.claude/settings.json)')
      {
        const claudeSettingsDir = join(agentCwd, '.claude')
        if (!existsSync(claudeSettingsDir)) mkdirSync(claudeSettingsDir, { recursive: true })
        const settingsPath = join(claudeSettingsDir, 'settings.json')
        let sdkProjectSettings: Record<string, unknown> = {}
        try {
          sdkProjectSettings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
        } catch { /* 文件不存在或解析失败 */ }
        let needsWrite = false
        if (sdkProjectSettings.plansDirectory !== '.context') {
          sdkProjectSettings.plansDirectory = '.context'
          needsWrite = true
        }
        if (sdkProjectSettings.skipWebFetchPreflight !== true) {
          sdkProjectSettings.skipWebFetchPreflight = true
          needsWrite = true
        }
        if (needsWrite) {
          writeFileSync(settingsPath, JSON.stringify(sdkProjectSettings, null, 2))
          console.log(`[Agent 编排] 已设置 SDK settings (plansDirectory, skipWebFetchPreflight)`)
        }
      }

      // 9.6 直接信任已保存的 sdkSessionId，跳过 listSessions 预验证
      // 原因：listSessions({ dir }) 基于 cwd 路径哈希查找，但 session 级别的 cwd
      // （如 ~/.proma/agent-workspaces/workspace-xxx/sessionId）与 SDK 内部存储的路径哈希可能不匹配，
      // 导致 listSessions 始终返回 0 个会话，误杀有效的 resume。
      // SDK 本身会优雅处理无效的 resume ID（回退为新会话），无需预验证。
      if (existingSdkSessionId) {
        console.log(`[Agent 编排] 将直接使用已保存的 sdkSessionId 进行 resume: ${existingSdkSessionId}`)
      }

// 10. 构建 MCP 服务器配置
      // 预读连接器配置一次，避免 buildMcpServers + collectConnectorDisabledTools 重复 I/O
      const connectorsConfig = workspaceSlug ? getWorkspaceConnectorsConfig(workspaceSlug) : { version: '1.0', connectors: {} }
      const mcpServers = buildMcpServers(workspaceSlug, connectorsConfig, selectedMcpServers)
      await injectMemoryTools(sdk, mcpServers)
      _diag('injectMemoryTools 完成, 开始 injectNanoBananaTools (await)')
      await injectNanoBananaTools(sdk, mcpServers, sessionId, agentCwd)
      _diag('injectNanoBananaTools 完成, 开始 injectWebSearchTools (await)')
      await injectWebSearchTools(sdk, mcpServers)
      _diag('injectWebSearchTools 完成, 开始 injectAutomationMcpServer (await)')
      await injectAutomationMcpServer(sdk, mcpServers, {
        sessionId,
        channelId,
        modelId,
        workspaceId,
        triggeredBy: input.triggeredBy,
      })
      _diag('injectAutomationMcpServer 完成')

      // 注入自定义 HTTP 工具（Tool Builder 创建的 customTools）
      const { injectHttpCustomMcpServer } = await import('./chat-tools/http-custom-mcp')
      await injectHttpCustomMcpServer(sdk, mcpServers)

      const expertRuntime = resolveExpertGroupRuntime({
        expertGroupId: sessionMeta?.expertGroupId,
        expertPluginId: sessionMeta?.expertPluginId,
      })

      if (expertRuntime) {
        Object.assign(mcpServers, expertRuntime.mcpServers)
        console.log(`[Agent 编排] 已加载专家团: ${expertRuntime.group.name}`)
      }

      // 合并外部注入的自定义 MCP 服务器（如飞书群聊工具）
      if (customMcpServers) {
        Object.assign(mcpServers, customMcpServers)
        console.log(`[Agent 编排] 已合并 ${Object.keys(customMcpServers).length} 个自定义 MCP 服务器`)
      }

      // 11. 构建动态上下文和最终 prompt
      _diag('开始 buildDynamicContext')
      const dynamicCtx = buildDynamicContext({
        workspaceName: workspace?.name,
        workspaceSlug,
        agentCwd,
      })

      // 11.5 注入 mention 引用指令（Skill/MCP/会话）— 仅影响 prompt，不影响持久化
      let enrichedMessage = userMessage
      const referencedSessionsBlock = buildReferencedSessionsPrompt(sessionId, mentionedSessionIds, workspaceId)
      if (referencedSessionsBlock) {
        enrichedMessage = `${referencedSessionsBlock}\n\n${enrichedMessage}`
        console.log(`[Agent 编排] 注入 referenced_sessions: ${mentionedSessionIds?.length ?? 0} sessions`)
      }
      if (mentionedSkills?.length) {
        const toolLines: string[] = ['用户在消息中明确引用了以下工具，请在本次回复中主动调用：']
        for (const slug of mentionedSkills ?? []) {
          const qualifiedName = workspaceSlug
            ? `proma-workspace-${workspaceSlug}:${slug}`
            : slug
          toolLines.push(`- Skill: ${qualifiedName}（请立即调用此 Skill）`)
        }
        enrichedMessage = `<mentioned_tools>\n${toolLines.join('\n')}\n</mentioned_tools>\n\n${userMessage}`
        console.log(`[Agent 编排] 注入 mentioned_tools: ${mentionedSkills?.length ?? 0} skills`)
      }

      const contextualMessage = `${dynamicCtx}\n\n${enrichedMessage}`

      const isCompactCommand = userMessage.trim() === '/compact'
      _diag('开始 buildContextPrompt')
      const finalPrompt = isCompactCommand
        ? '/compact'
        : existingSdkSessionId
          ? contextualMessage
          : buildContextPrompt(sessionId, contextualMessage, { agentCwd })
      const sdkPromptContent = runHasImageInput
        ? await buildAgentUserContent({ userMessage: finalPrompt, attachments })
        : undefined
      if (sdkPromptContent?.warnings.length) {
        console.warn(`[Agent 编排] 图片输入处理警告: ${sdkPromptContent.warnings.join('; ')}`)
      }

      if (existingSdkSessionId) {
        console.log(`[Agent 编排] 使用 resume 模式，SDK session ID: ${existingSdkSessionId}`)
      } else if (finalPrompt !== contextualMessage) {
        console.log(`[Agent 编排] 无 resume，已回填历史上下文（最近 ${MAX_CONTEXT_MESSAGES} 条消息）`)
      }

      // 12. 读取应用设置并确定权限模式
      // 权限模式只属于当前 session；新会话默认完全自动模式。
      const appSettings = getSettings()
      const initialPermissionMode: PromaPermissionMode = permissionModeOverride
        ?? PROMA_DEFAULT_PERMISSION_MODE
      // 注册到 Map，支持运行中动态切换
      this.sessionPermissionModes.set(sessionId, initialPermissionMode)
      console.log(`[Agent 编排] 权限模式: ${initialPermissionMode}${permissionModeOverride ? '（外部覆盖）' : ''}`)
      _diag('权限模式已确定, 开始构建 canUseTool 回调')

      const emitPlanModeChanged = (active: boolean, source: 'initial' | 'tool' | 'permission'): void => {
        this.eventBus.emit(sessionId, {
          kind: 'proma_event',
          event: { type: 'plan_mode_changed', sessionId, active, source },
        })
      }

      // 当初始模式为 plan 时，通知渲染进程展示计划模式 UI（如「Agent 正在规划」横幅）
      if (initialPermissionMode === 'plan') {
        this.eventBus.emit(sessionId, { kind: 'proma_event', event: { type: 'enter_plan_mode', sessionId } })
        emitPlanModeChanged(true, 'initial')
      }

      /** 读取当前会话的实时权限模式（支持运行中切换） */
      const getPermissionMode = (): PromaPermissionMode =>
        this.sessionPermissionModes.get(sessionId) ?? initialPermissionMode

      const canAutoSwitchToMultimodal = (): boolean => {
        if (!autoModeConfig.enabled) return false
        return autoModeConfig.candidatePool.some((candidate) =>
          candidate.supportsMultimodal === true &&
          autoModeConfig.availableModelIds.has(candidate.modelId) &&
          !autoModeState.triedModelIds.has(candidate.modelId),
        )
      }

      const runToolGuardContext: RunToolGuardContext = {
        supportsMultimodal: getChannelModelSupportsMultimodal(channel, resolvedModel),
        imagesProvidedAsMultimodal: (sdkPromptContent?.imageCount ?? 0) > 0,
        autoModeEnabled: autoModeConfig.enabled,
        runHasImageInput,
        sessionRequiresVisionContext: sessionMeta?.requiresVisionContext === true,
        cwd: agentCwd,
        canAutoSwitchToMultimodal,
      }

      const refreshRunToolGuardModelCapability = (): void => {
        runToolGuardContext.supportsMultimodal = getChannelModelSupportsMultimodal(channel, resolvedModel)
      }

      const getModelSupportsMultimodal = (targetModelId: string | undefined): boolean => {
        if (!targetModelId) return false
        const activeChannel = getChannelById(currentChannelId) ?? channel
        const activeModel = activeChannel?.models.find((item) => item.id === targetModelId)
        return activeModel?.supportsMultimodal === true
      }

      // ExitPlanMode 拦截器：plan 模式下走 UI 审批流程
      const handleExitPlanMode = (toolInput: Record<string, unknown>, signal: AbortSignal): Promise<ExitPlanPermissionResult> => {
        return exitPlanService.handleExitPlanMode(
          sessionId,
          toolInput,
          signal,
          (request: ExitPlanModeRequest) => {
            this.eventBus.emit(sessionId, { kind: 'proma_event', event: { type: 'exit_plan_mode_request', request } })
          },
        )
      }

      // 始终创建 auto 权限回调（运行中可能切换到 auto）
      const autoCanUseTool = permissionService.createCanUseTool(
        sessionId,
        (request: PermissionRequest) => {
          this.eventBus.emit(sessionId, { kind: 'proma_event', event: { type: 'permission_request', request } })
        },
        (sid, toolInput, signal, sendAskUser) => askUserService.handleAskUserQuestion(sid, toolInput, signal, sendAskUser),
        (request: AskUserRequest) => {
          this.eventBus.emit(sessionId, { kind: 'proma_event', event: { type: 'ask_user_request', request } })
        },
        runToolGuardContext,
      )

      /**
       * 判断 Bash 命令是否是只读的（计划模式下安全可执行）
       * 检测写操作特征：文件重定向、破坏性命令、包管理写操作、git 写操作等
       */
      const isBashCommandReadOnly = (command: string): boolean => {
        // 输出重定向：匹配未被数字或 & 前置的 > 符号（排除 2>/dev/null、&> 等 fd 重定向）
        if (/(?<![0-9&])>/.test(command)) return false
        // 破坏性文件操作
        if (/\b(rm|rmdir)\s/.test(command)) return false
        if (/\bsed\s+[^|&;]*-i/.test(command)) return false  // sed -i 原地编辑
        if (/\b(chmod|chown|chattr|truncate)\s/.test(command)) return false
        if (/\b(mv|cp)\s/.test(command)) return false
        if (/\b(mkdir|touch|mktemp)\s/.test(command)) return false
        // 包管理器写操作
        if (/\b(npm|pnpm|yarn|bun)\s+(install|i\b|add|remove|uninstall|update|upgrade|link|unlink)\b/.test(command)) return false
        if (/\bpip[23]?\s+(install|uninstall|upgrade)\b/.test(command)) return false
        if (/\b(apt|apt-get|brew|yum|dnf)\s+(install|remove|purge|uninstall|upgrade)\b/.test(command)) return false
        // Git 写操作
        if (/\bgit\s+(commit|push|checkout\s+-[bB]|branch\s+-[mMdD]|merge\b|rebase\b|reset\b|stash\s+(drop|pop)\b|add\b|apply\b|cherry-pick\b)/.test(command)) return false
        // 进程控制
        if (/\b(kill|killall|pkill)\s/.test(command)) return false
        // 脚本执行（具有潜在副作用，如 node script.js / python main.py）
        if (/\b(node|python[23]?|ruby|perl|php)\s+[^-]/.test(command)) return false
        return true
      }

      // Plan 模式下允许的只读工具（不包含 Write/Edit/Bash 等写操作）
      const PLAN_MODE_ALLOWED_TOOLS = new Set([
        'Read', 'Glob', 'Grep', 'WebFetch',
        'Agent', 'TodoRead', 'TodoWrite', 'TaskOutput',
        'TaskCreate', 'TaskUpdate', 'TaskList', 'TaskGet',
        'ListMcpResourcesTool', 'ReadMcpResourceTool',
      ])
      const DEFERRED_OR_PROACTIVE_TOOLS = new Set([
        'REPL', 'Workflow', 'ScheduleWakeup', 'Monitor', 'PushNotification',
        'CronCreate', 'CronDelete', 'RemoteTrigger',
      ])

      /** Plan 模式是否已被 Agent 进入（初始 plan 模式时天然为 true，其他模式需 EnterPlanMode 触发） */
      let planModeEntered = initialPermissionMode === 'plan'

      const syncPlanModeFromToolUse = (toolName: string): void => {
        if (toolName === 'EnterPlanMode') {
          planModeEntered = true
          emitPlanModeChanged(true, 'tool')
          return
        }
        if (toolName === 'ExitPlanMode' && getPermissionMode() === 'bypassPermissions') {
          planModeEntered = false
          emitPlanModeChanged(false, 'tool')
          return
        }
        // auto/plan 下 ExitPlanMode 只是发起退出计划的审批请求。
        // 真正退出由用户审批结果触发，不能在工具开始时提前清掉计划态。
      }

      // 动态 canUseTool：每次调用读取当前权限模式，支持运行中切换
      const canUseTool = async (toolName: string, input: Record<string, unknown>, options: CanUseToolOptions): Promise<PermissionResult> => {
        const currentMode = getPermissionMode()

        // ── 参数校验守卫（所有模式、所有工具，优先于权限检查） ──
        const validationFailure = validateToolInput(toolName, input)
        if (validationFailure) {
          console.warn(`[Agent 工具验证] 参数缺失: tool=${toolName}, mode=${currentMode}`)
          return validationFailure
        }

        const readGuardFailure = guardToolUseBeforePermission(toolName, input, runToolGuardContext)
        if (readGuardFailure) {
          const reason = readGuardFailure.behavior === 'deny' ? readGuardFailure.message : 'allow'
          console.warn(`[Agent 工具守卫] 拒绝错误读取通道: tool=${toolName}, mode=${currentMode}, reason=${reason}`)
          return readGuardFailure
        }

        // ── Write 大文件 token 截断防护 ──
        if (toolName === 'Write' && typeof input.content === 'string') {
          const estimatedTokens = estimateTokenCount(input.content)
          if (estimatedTokens > WRITE_CONTENT_TOKEN_THRESHOLD) {
            console.warn(
              `[Agent 工具验证] Write 内容过大: tokens≈${estimatedTokens}, chars=${input.content.length}, file=${String(input.file_path)}`,
            )
            return {
              behavior: 'deny' as const,
              message:
                `The content for Write tool (~${estimatedTokens} estimated tokens, ${input.content.length} chars) is too large and may be truncated. ` +
                `Please split the write into smaller sequential steps: write the first portion of the file now, then use Edit tool to append remaining sections incrementally.`,
            }
          }
        }

        // ── EnterPlanMode / ExitPlanMode 处理 ──

        // 完全自动模式：计划进入和退出都透明化，保持 bypassPermissions 的无人值守语义。
        if (currentMode === 'bypassPermissions' && (toolName === 'EnterPlanMode' || toolName === 'ExitPlanMode')) {
          const active = toolName === 'EnterPlanMode'
          planModeEntered = active
          emitPlanModeChanged(active, 'tool')
          return { behavior: 'allow' as const, updatedInput: input }
        }

        // ExitPlanMode：auto/plan 模式下必须让用户确认计划。
        if (toolName === 'ExitPlanMode') {
          console.log(`[canUseTool] ExitPlanMode: signal.aborted=${options.signal.aborted}, planModeEntered=${planModeEntered}, mode=${currentMode}`)
          const result = await handleExitPlanMode(input, options.signal)
          if (result.behavior === 'allow' && 'targetMode' in result && result.targetMode) {
            // 更新 Map，后续 canUseTool 调用使用新模式
            this.sessionPermissionModes.set(sessionId, result.targetMode)
            planModeEntered = false
            emitPlanModeChanged(false, 'permission')
            // 同步通知 SDK 侧切换权限模式
            if (this.adapter.setPermissionMode) {
              this.adapter.setPermissionMode(sessionId, sdkPermissionModeForPromaMode(result.targetMode)).catch((err: unknown) => {
                console.warn(`[Agent 编排] SDK 权限模式切换失败:`, err)
              })
            }
          }
          return result
        }

        // EnterPlanMode：标记进入状态，通知渲染进程
        if (toolName === 'EnterPlanMode') {
          planModeEntered = true
          emitPlanModeChanged(true, 'tool')
          this.eventBus.emit(sessionId, { kind: 'proma_event', event: { type: 'enter_plan_mode', sessionId } })
          return { behavior: 'allow' as const, updatedInput: input }
        }

        // AskUserQuestion：始终走交互式问答流程，不受权限模式影响
        if (toolName === 'AskUserQuestion') {
          return askUserService.handleAskUserQuestion(
            sessionId, input, options.signal,
            (request: AskUserRequest) => {
              this.eventBus.emit(sessionId, { kind: 'proma_event', event: { type: 'ask_user_request', request } })
            },
          )
        }

        // ── 普通工具的权限分派 ──

        switch (currentMode) {
          case 'bypassPermissions':
            return { behavior: 'allow' as const, updatedInput: input }

          case 'plan': {
            // Plan 模式：只允许只读工具 + Write/Edit 任意 .md 文件（计划文档）
            if (PLAN_MODE_ALLOWED_TOOLS.has(toolName)) {
              return { behavior: 'allow' as const, updatedInput: input }
            }
            // 允许 Write/Edit 到任意 .md 文件（计划文档一定是 markdown；非 .md 仍被拒）
            if (toolName === 'Write' || toolName === 'Edit') {
              const filePath = typeof input.file_path === 'string' ? input.file_path : ''
              if (filePath.toLowerCase().endsWith('.md')) {
                return { behavior: 'allow' as const, updatedInput: input }
              }
            }
            // Bash 工具：只读命令（find、grep、cat 等）允许执行，写操作拒绝
            if (toolName === 'Bash') {
              const command = typeof input.command === 'string' ? input.command : ''
              if (isBashCommandReadOnly(command)) {
                return { behavior: 'allow' as const, updatedInput: input }
              }
              return { behavior: 'deny' as const, message: '计划模式下不允许执行写操作，请在计划审批通过后再执行' }
            }
            // MCP 工具（以 mcp__ 开头）允许调用（调研用）
            if (toolName.startsWith('mcp__')) {
              return { behavior: 'allow' as const, updatedInput: input }
            }
            if (DEFERRED_OR_PROACTIVE_TOOLS.has(toolName)) {
              return { behavior: 'deny' as const, message: '计划模式下不允许启动后台、定时、通知或脚本执行能力，请在计划审批通过后再执行' }
            }
            // 其余工具拒绝
            return { behavior: 'deny' as const, message: '计划模式下不允许执行写操作，请在计划审批通过后再执行' }
          }

          case 'auto':
            return autoCanUseTool(toolName, input, options)

          default:
            return { behavior: 'allow' as const, updatedInput: input }
        }
      }

      // 13. 构建 Adapter 查询选项
      // 检测用户选用的模型是否为 Claude 系列，决定 SubAgent 是否使用独立模型分层
      const claudeAvailable = (resolvedModel || DEFAULT_MODEL_ID).toLowerCase().includes('claude')
      const maxTurns = appSettings.agentMaxTurns && appSettings.agentMaxTurns > 0
        ? appSettings.agentMaxTurns
        : undefined
      const queryOptions: ClaudeAgentQueryOptions = {
        sessionId,
        prompt: sdkPromptContent?.imageCount ? sdkPromptContent.content : finalPrompt,
        model: resolvedModel,
        cwd: agentCwd,
        sdkCliPath: cliPath,
        env: sdkEnv,
        ...(maxTurns != null && { maxTurns }),
        sdkPermissionMode: sdkPermissionModeForPromaMode(initialPermissionMode),
        // permissionMode 负责表达 auto/plan/bypassPermissions。
        // 当提供 canUseTool 回调时这里必须为 false，否则 CLI 同时收到
        // --allow-dangerously-skip-permissions 和 --permission-prompt-tool stdio
        // 两个矛盾的指令，导致 ExitPlanMode/AskUserQuestion 等交互式工具失败。
        // bypassPermissions 下 SDK 可能在 canUseTool 前直接放行工具，因此计划态还会
        // 从实际 tool_use 流里同步，避免 UI 停留在计划阶段。
        allowDangerouslySkipPermissions: !canUseTool,
        canUseTool,
        ...(sdkPermissionModeForPromaMode(initialPermissionMode) === 'auto' && { allowedTools: [...SAFE_TOOLS] }),
        // claude_code preset 提供基础环境信息（platform/shell/OS/git/model/知识截止日期等）
        // buildSystemPrompt 追加 Proma 特有指令（角色定义、SubAgent 策略、工作区信息等）
        systemPrompt: {
          type: 'preset',
          preset: 'claude_code',
          append: buildSystemPrompt({
            workspaceName: workspace?.name,
            workspaceSlug,
            sessionId,
            permissionMode: initialPermissionMode,
            memoryEnabled: (() => { const mc = getMemoryConfig(); return mc.enabled && !!mc.apiKey })(),
            claudeAvailable,
            deepSeekSubagentModel: modelRouting.subagentModel,
            expertRuntime,
          }) + (automationContext ? `\n\n## 定时任务执行上下文\n\n${automationContext}` : ''),
        },
        resumeSessionId: existingSdkSessionId,
        // 回退后 resume：从指定消息处继续（SDK 在同一 JSONL 内创建分支）
        ...(rewindResumeAt && { resumeSessionAt: rewindResumeAt }),
        ...(Object.keys(mcpServers).length > 0 && { mcpServers }),
        ...(() => {
          const plugins = [
            ...getAgentPluginPaths(workspaceSlug),
            ...(expertRuntime?.pluginPaths ?? []),
          ]
          return plugins.length > 0 ? { plugins } : {}
        })(),
        // 连接器 CLI Skill 扫描：外层 connectors.json 拿 enabled/type，
        // 内层 connectors/{name}/connector.json 拿 skillDirs
        ...(() => {
          const { getConnectorsDir } = require('./config-paths')
          const connectorsDir = workspaceSlug ? getConnectorsDir(workspaceSlug) : ''
          if (!connectorsDir) return {}

          const skillDirs: string[] = []
          try {
            const config = workspaceSlug ? getWorkspaceConnectorsConfig(workspaceSlug) : { version: '1.0', connectors: {} }
            for (const [name, connector] of Object.entries(config.connectors)) {
              if (!connector.enabled) continue
              if (connector.type !== 'cli') continue

              // 优先从 connectors/{name}/connector.json 读取 skillDirs（新格式）
              // 兜底从 connectors.json 的 skillDirs 字段读取（旧格式兼容）
              const dirs = readSkillDirsFromConnectorJson(connectorsDir, name) ?? connector.skillDirs ?? []
              for (const d of dirs) {
                skillDirs.push(join(connectorsDir, name, d))
              }
            }
          } catch { /* connectors/ 目录可能尚未同步 */ }

          return skillDirs.length > 0 ? { additionalSkillDirs: skillDirs } : {}
        })(),
        // 合并附加目录：用户当次输入 + 会话级 + 工作区级（详见 collectAttachedDirectories）
        ...(() => {
          const allDirs = collectAttachedDirectories({
            extraDirs: additionalDirectories,
            sessionMeta,
            workspaceSlug,
          })
          return allDirs.length > 0 ? { additionalDirectories: allDirs } : {}
        })(),
        // 启用文件检查点，支持 rewindFiles 回退
        enableFileCheckpointing: true,
        // SDK 0.2.52+ 新增选项（从 settings 读取）
        ...(appSettings.agentThinking && { thinking: appSettings.agentThinking }),
        effort: appSettings.agentEffort ?? 'high',
        ...(appSettings.agentMaxBudgetUsd != null && appSettings.agentMaxBudgetUsd > 0 && {
          maxBudgetUsd: appSettings.agentMaxBudgetUsd,
        }),
        disallowedTools: mergeDisallowedTools([
          ...(expertRuntime?.disallowedTools ?? []),
          ...collectConnectorDisabledTools(workspaceSlug, connectorsConfig),
        ]),
        // 1M context window: 支持的模型自动启用 beta（Claude: Sonnet 4+ / Opus 4.6+ / 4.7 / 4.8、DeepSeek V4 系列）
        // 未启用时 SDK 默认 200K 并在约 150K 触发压缩；启用后上限提升至 1M
        ...(supports1MContext(modelId || DEFAULT_MODEL_ID) && {
          betas: ['context-1m-2025-08-07'] as SdkBeta[],
        }),
        // 内置 SubAgent 定义（code-reviewer / explorer / researcher）
        // SubAgent 模型最终由 CLAUDE_CODE_SUBAGENT_MODEL 兜底控制：
        // DeepSeek 系列固定 deepseek-v4-flash，其它模型删除该 env，保留 SDK 默认解析。
        agents: buildAgentsForSession({ claudeAvailable, expertRuntime }),
        onStderr: (data: string) => {
          stderrChunks.push(data)
        },
        onSessionId: (sdkSessionId: string) => {
          // 仅在新 session ID 变更时保存（onSessionId 可能被多次回调但 ID 不变）
          if (sdkSessionId !== capturedSdkSessionId) {
            capturedSdkSessionId = sdkSessionId
            try {
              updateAgentSessionMeta(sessionId, { sdkSessionId })
              console.log(`[Agent 编排] 已保存 SDK session_id: ${sdkSessionId}`)
            } catch (err) {
              console.error(`[Agent 编排] 保存 SDK session_id 失败:`, err)
            }
          }

          // SDK 初始化完成后立即触发标题生成，使多会话并发时用户能快速区分
          if (!titleGenerationStarted) {
            titleGenerationStarted = true
            // Auto Mode 下 resolvedModel 可能不属于当前 channel，优先使用 channel 自身的模型
            const titleModel = channel?.models?.find(m => m.enabled)?.id || resolvedModel
            autoGenerateTitle(sessionId, userMessage, currentChannelId, titleModel, callbacks)
              .catch((err) => console.error('[Agent 编排] 标题生成未捕获异常:', err))
          }
        },
        onModelResolved: (model: string) => {
          resolvedModel = model
          console.log(`[Agent 编排] SDK 确认模型: ${resolvedModel}`)
          // 通知渲染进程更新流式状态中的模型信息
          this.eventBus.emit(sessionId, { kind: 'proma_event', event: { type: 'model_resolved', model } })
        },
        getModelSupportsMultimodal,
      }

      console.log(`[Agent 编排] 开始通过 Adapter 遍历事件流...`)
      _diag('queryOptions 构建完成, 即将进入重试循环')

      // 14. 遍历 Adapter 产出的 AgentEvent 流（含自动重试）
      let lastRetryableError: string | undefined
      let lastRetryableCategory: import('./orchestrator/error-classifier').ErrorCategory | undefined
      let retryDelayElapsedMs = 0
      let retryAttemptsScheduled = 0
      let retrySucceeded = false
      let skipNextRetryDelay = false
      let thinkingSignatureRecoveryAttempted = false
      let invisibleRecoveryAttempts = 0
      let lastAttempt = 0

      // Auto Mode：切换模型时同步切换渠道
      const switchChannelForModel = async (newModelId: string, preferredChannelId?: string): Promise<void> => {
        const chInfo = findChannelForModel(newModelId, preferredChannelId)
        if (!chInfo) {
          console.warn(`[Auto Mode] 找不到模型 ${newModelId} 所属的渠道，sdkEnv 保持不变`)
          return
        }
        if (chInfo.channelId === currentChannelId) return
        console.log(`[Auto Mode] 渠道切换: ${currentChannelId} (${channel!.provider}) -> ${chInfo.channelId} (${chInfo.provider}), baseUrl=${chInfo.baseUrl}`)
        currentChannelId = chInfo.channelId
        channel = getChannelById(chInfo.channelId)!
        apiKey = chInfo.apiKey
        sdkEnv = await buildSdkEnv(apiKey, chInfo.baseUrl, chInfo.provider)
        const newRouting = resolveAgentModelRouting({ modelId: newModelId, provider: chInfo.provider })
        applyAgentModelRoutingToEnv(sdkEnv, newRouting)
        queryOptions.env = sdkEnv
      }

      // Auto Mode：跨模型切换公共逻辑
      const trySwitchAutoModeModel = async (): Promise<boolean> => {
        if (autoModeState.sameModelAttempts <= MAX_SAME_MODEL_RETRIES) return true

        const excludeSet = new Set(autoModeState.triedModelIds)
        const nextCandidate = selectNextCandidateModel(
          autoModeState.activeModelId,
          autoModeConfig.candidatePool,
          excludeSet,
          autoModeConfig.availableModelIds,
          { requiresMultimodal: runRequiresVision },
        )
        if (nextCandidate) {
          const nextModel = nextCandidate.modelId
          console.log(`[Auto Mode] 切换模型: ${autoModeState.activeModelId} -> ${nextModel}${nextCandidate.channelId ? ` (渠道: ${nextCandidate.channelId})` : ''}`)
          const switchMessage = buildModelSwitchedSystemMessage(autoModeState.activeModelId, nextModel)
          accumulatedMessages.push(switchMessage)
          this.eventBus.emit(sessionId, { kind: 'sdk_message', message: switchMessage })
          this.eventBus.emit(sessionId, {
            kind: 'proma_event',
            event: { type: 'model_switched', fromModel: autoModeState.activeModelId, toModel: nextModel },
          })
          autoModeState.activeModelId = nextModel
          autoModeState.sameModelAttempts = 0
          autoModeState.triedModelIds.add(nextModel)
          try { updateAgentSessionMeta(sessionId, { activeModelId: nextModel } as Partial<AgentSessionMeta>) } catch { /* ignore */ }
          queryOptions.model = nextModel
          resolvedModel = nextModel
          if (existingSdkSessionId) {
            existingSdkSessionId = undefined
            capturedSdkSessionId = undefined
            queryOptions.resumeSessionId = undefined
          }
          await switchChannelForModel(nextModel, nextCandidate.channelId)
          refreshRunToolGuardModelCapability()
          skipNextRetryDelay = true
          return true
        }

        console.log(`[Auto Mode] 候选池已耗尽 (candidates=${autoModeConfig.candidatePool.length}, tried=[${[...autoModeState.triedModelIds].join(', ')}], available=${autoModeConfig.availableModelIds.size}, activeModel=${autoModeState.activeModelId})`)
        return false
      }

      const canAutoRetry = (attempt: number): boolean =>
        attempt <= getRetryLimitForCategory(lastRetryableCategory) && retryDelayElapsedMs < MAX_AUTO_RETRY_WAIT_MS

      /** 捕获到的 SDK session ID（用于 resume / recovery） */
      let capturedSdkSessionId = existingSdkSessionId
      const canTryThinkingSignatureRecovery = (attempt: number): boolean =>
        !thinkingSignatureRecoveryAttempted &&
        canAutoRetry(attempt) &&
        !!(existingSdkSessionId || capturedSdkSessionId || queryOptions.resumeSessionId)

      const queryStartedAt = Date.now()

      for (let attempt = 1; attempt <= MAX_AUTO_RETRIES + 1; attempt++) {
        lastAttempt = attempt
        // 非首次尝试：等待 + 发送重试事件到 UI
        if (attempt > 1) {
          if (skipNextRetryDelay) {
            skipNextRetryDelay = false
          } else {
            const retryAttempt = Math.max(1, attempt - 1 - invisibleRecoveryAttempts)
            const retryLimit = getRetryLimitForCategory(lastRetryableCategory)
            if (retryAttempt > retryLimit) {
              console.log(`[Agent 编排] 已达到当前错误的自动重试上限 (${retryLimit})，停止重试`)
              break
            }
            const delayMs = getRetryDelayMs(retryAttempt, retryDelayElapsedMs)
            if (delayMs <= 0) {
              console.log(`[Agent 编排] 自动重试等待预算已耗尽 (${MAX_AUTO_RETRY_WAIT_MS}ms)，停止重试`)
              break
            }
            retryDelayElapsedMs += delayMs
            retryAttemptsScheduled = retryAttempt
            const delaySec = delayMs / 1000
            const attemptData: RetryAttempt = {
              attempt: retryAttempt,
              timestamp: Date.now(),
              reason: lastRetryableError ?? '未知错误',
              errorMessage: lastRetryableError ?? '',
              delaySeconds: delaySec,
            }

            this.eventBus.emit(sessionId, {
              kind: 'proma_event',
              event: { type: 'retry', status: 'starting', attempt: retryAttempt, maxAttempts: retryLimit, delaySeconds: delaySec, reason: lastRetryableError ?? '未知错误' },
            })
            this.eventBus.emit(sessionId, {
              kind: 'proma_event',
              event: { type: 'retry', status: 'attempt', attemptData },
            })

            await new Promise((r) => setTimeout(r, delayMs))

            // 等待期间如果会话被中止，退出
            if (!this.activeSessions.has(sessionId)) {
              const wasStoppedByUser = this.consumeStoppedByUser(sessionId)
              persistSDKMessages(sessionId, accumulatedMessages, Date.now() - queryStartedAt)
              try { updateAgentSessionMeta(sessionId, { stoppedByUser: wasStoppedByUser }) } catch { /* 会话可能已删除 */ }
              completeRun(getAgentSessionMessages(sessionId), { stoppedByUser: wasStoppedByUser, startedAt: streamStartedAt })
              return
            }
          }
        }

        let shouldRetryFromError = false

          // 委托给 sdkRunSingleAttempt（模式特定行为通过 callbacks 注入）

          const ctx: SdkRunContext = {
            sessionId, existingSdkSessionId, capturedSdkSessionId,
            queryOptions, resolvedModel,
            activeModelId,
            accumulatedMessages, stderrChunks,
            contextualMessage, agentCwd,
            retryDelayElapsedMs, retryAttemptsScheduled,
            skipNextRetryDelay,
            thinkingSignatureRecoveryAttempted, invisibleRecoveryAttempts,
            planModeEntered,
          }

          const sdkCallbacks: SdkRunCallbacks = {
            onApiRetry: async (retryError: string) => {
              if (autoModeConfig.enabled && autoModeConfig.candidatePool.length > 0) {
                const es = Math.round((Date.now() - queryStartedAt) / 1000)
                console.log(`[Auto Mode] 检测到 SDK api_retry (attempt ${attempt}, t+${es}s, error=${retryError})，中断并触发切换`)
                autoModeState.sameModelAttempts = MAX_SAME_MODEL_RETRIES
                return 'retry'
              }
              // 非自动模式：api_retry 直接终止
              const es = Math.round((Date.now() - queryStartedAt) / 1000)
              console.log(`[Agent 编排] 检测到 SDK api_retry (attempt ${attempt}, t+${es}s, error=${retryError})，提前终止`)
              return 'throw'
            },
            onSyncPlanMode: syncPlanModeFromToolUse,
          }

          const sdkDeps: SdkRunnerDeps = {
            isActive: (sid: string) => this.activeSessions.has(sid),
            abort: (sid: string) => this.adapter.abort(sid),
            emit: (sid: string, event: any) => this.eventBus.emit(sid, event),
            persistMessages: (sid: string, messages: SDKMessage[], elapsedMs: number) => persistSDKMessages(sid, messages, elapsedMs),
            query: (opts: ClaudeAgentQueryOptions) => this.adapter.query(opts),
          }

          _diag(`即将调用 sdkRunSingleAttempt, attempt=${attempt}, model=${ctx.resolvedModel}, resume=${ctx.existingSdkSessionId || '无'}`)
          const result = await sdkRunSingleAttempt(ctx, sdkDeps, sdkCallbacks, attempt, queryStartedAt)
          _diag(`sdkRunSingleAttempt 返回, kind=${result.kind}, shouldRetry=${result.shouldRetryFromError}, recoveryType=${result.recoveryType}`)

          // 同步回 mutable 状态
          capturedSdkSessionId = ctx.capturedSdkSessionId
          thinkingSignatureRecoveryAttempted = ctx.thinkingSignatureRecoveryAttempted
          invisibleRecoveryAttempts = ctx.invisibleRecoveryAttempts
          planModeEntered = ctx.planModeEntered

          if (result.kind === 'success') {
            const capturedResultSubtype = result.capturedResultSubtype
            const wasStoppedByUser = this.consumeStoppedByUser(sessionId)

            if (!wasStoppedByUser && retryAttemptsScheduled > 0) {
              lastRetryableError = undefined
            lastRetryableCategory = undefined
              this.eventBus.emit(sessionId, { kind: 'proma_event', event: { type: 'retry', status: 'cleared' } })
            }

            retrySucceeded = true

            if (autoModeConfig.enabled && autoModeState.activeModelId) {
              try { updateAgentSessionMeta(sessionId, { activeModelId: autoModeState.activeModelId } as Partial<AgentSessionMeta>) } catch { /* ignore */ }
            }
            if (runHasImageInput && sessionMeta?.requiresVisionContext !== true) {
              try { updateAgentSessionMeta(sessionId, { requiresVisionContext: true }) } catch { /* ignore */ }
            }

            if (initialPermissionMode === 'plan' && planModeEntered && this.activeSessions.has(sessionId)) {
              this.eventBus.emit(sessionId, {
                kind: 'sdk_message',
                message: { type: 'prompt_suggestion', suggestion: '请执行该计划' } as unknown as SDKMessage,
              })
            }

            completeRun(getAgentSessionMessages(sessionId), { stoppedByUser: wasStoppedByUser, startedAt: streamStartedAt, resultSubtype: capturedResultSubtype })
            break  // 成功完成，退出重试循环
          }

          if (result.kind === 'stopped_by_user') {
            const wasStoppedByUser = this.consumeStoppedByUser(sessionId)
            console.log(`[Agent 编排] 会话 ${sessionId} 已被用户中止`)
            persistSDKMessages(sessionId, accumulatedMessages, Date.now() - queryStartedAt)
            try { updateAgentSessionMeta(sessionId, { stoppedByUser: wasStoppedByUser }) } catch { /* ignore */ }
            completeRun(getAgentSessionMessages(sessionId), { stoppedByUser: wasStoppedByUser, startedAt: streamStartedAt })
            return
          }

          // error_break — 模式特定处理
          if (result.shouldRetryFromError) {
            if (result.retryReason) {
              lastRetryableError = result.retryReason
              lastRetryableCategory = result.retryCategory
            }

            // Session 不存在恢复
            if (result.recoveryType === 'session_not_found' && existingSdkSessionId) {
              existingSdkSessionId = undefined
              capturedSdkSessionId = undefined
              lastRetryableError = prepareSessionNotFoundRecovery(sessionId, queryOptions, contextualMessage, agentCwd, accumulatedMessages, queryStartedAt)
              lastRetryableCategory = 'session_not_found'
              stderrChunks.length = 0
              continue
            }

            // Thinking signature 恢复
            if (result.recoveryType === 'thinking_signature' && canTryThinkingSignatureRecovery(attempt)) {
              thinkingSignatureRecoveryAttempted = true
              invisibleRecoveryAttempts += 1
              existingSdkSessionId = undefined
              capturedSdkSessionId = undefined
              skipNextRetryDelay = true
              lastRetryableError = prepareResumeFallbackRecovery(
                sessionId, queryOptions, contextualMessage, agentCwd,
                accumulatedMessages, queryStartedAt,
                '检测到 thinking signature 不兼容，清除 sdkSessionId 并切换到上下文回填模式',
                '思考签名不兼容，切换到上下文回填模式',
              )
              lastRetryableCategory = 'thinking_signature'
              stderrChunks.length = 0
              continue
            }

            // API 失败：Auto Mode 尝试切换模型，非 Auto 直接 continue
            if (autoModeConfig.enabled && autoModeConfig.candidatePool.length > 0) {
              autoModeState.sameModelAttempts++
              console.log(`[Auto Mode] 模型失败计数: ${autoModeState.activeModelId} -> ${autoModeState.sameModelAttempts}/${MAX_SAME_MODEL_RETRIES} (attempt ${attempt})`)
              if (!await trySwitchAutoModeModel()) {
                lastRetryableError = `Auto Mode 候选池已耗尽，已尝试模型: ${[...autoModeState.triedModelIds].join(', ')}`
                lastRetryableCategory = undefined
                break
              }
            }

            continue
          }

          // 不可重试 — 使用 fatalError.display 直接展示
          const fatalDisplay = result.fatalError!.display
          const fatalIsMalformed = result.fatalError!.isMalformedResponse
          const fatalRawMsg = result.fatalError!.rawErrorMessage
          console.error(`[Agent 编排] 不可重试错误 (session=${sessionId}): code=${fatalDisplay.errorCode} title=${fatalDisplay.errorTitle} raw=${fatalRawMsg.slice(0, 200)}`)
          // stderr 全文由下方 logStderr 输出

          // 保存已累积的部分内容
          if (accumulatedMessages.length > 0) {
            try {
              persistSDKMessages(sessionId, accumulatedMessages, Date.now() - queryStartedAt)
            } catch (saveError) {
              console.error('[Agent 编排] 保存部分内容失败:', saveError)
            }
          }

          // 打印 stderr
          logStderr(stderrChunks)

          // malformed 响应：写入文件方便排查
          const stderrText = stderrChunks.join('').trim()
          if (fatalIsMalformed && stderrText.length > 0 && agentCwd) {
            try {
              const stderrLogPath = join(agentCwd, 'stderr-output.txt')
              writeFileSync(stderrLogPath, `// 网关返回的原始响应 (${new Date().toISOString()})\n${stderrText}\n`, 'utf-8')
              console.log(`[Agent 编排] 已将网关原始响应写入: ${stderrLogPath} (${stderrText.length} 字符)`)
            } catch { /* 忽略 */ }
          }

          // 保存错误消息
          try {
            const errMsg = buildErrorSDKMessage(fatalDisplay)
            appendSDKMessages(sessionId, [errMsg])
          } catch (saveError) {
            console.error('[Agent 编排] 保存错误消息失败:', saveError)
          }

          // 重试记录
          if (retryAttemptsScheduled > 0 && lastRetryableError) {
            this.eventBus.emit(sessionId, {
              kind: 'proma_event',
              event: { type: 'retry', status: 'failed', attemptData: { attempt: retryAttemptsScheduled, timestamp: Date.now(), reason: lastRetryableError, errorMessage: fatalDisplay.errorContent, delaySeconds: 0 } },
            })
          }

          failRun(fatalDisplay.errorContent, getAgentSessionMessages(sessionId), { startedAt: streamStartedAt })

          // 根据错误类型决定 sdkSessionId
          const apiError = result.fatalError!.apiError
          if (existingSdkSessionId && shouldClearSDKSessionId(apiError)) {
            try {
              updateAgentSessionMeta(sessionId, { sdkSessionId: undefined })
            } catch { /* 忽略 */ }
          }

          return
      }

      // 重试循环结束（达到最大次数仍失败）
      if (!retrySucceeded && lastRetryableError) {
        const isPoolExhausted = lastRetryableError.includes('候选池已耗尽')
        const retryFailureMessage = isPoolExhausted
          ? lastRetryableError
          : retryDelayElapsedMs >= MAX_AUTO_RETRY_WAIT_MS
            ? '重试等待已达到 5 分钟后仍然失败'
            : `重试 ${lastAttempt - 1} 次后仍然失败`
        this.eventBus.emit(sessionId, {
          kind: 'proma_event',
          event: { type: 'retry', status: 'failed', attemptData: { attempt: isPoolExhausted ? lastAttempt : retryAttemptsScheduled || lastAttempt - 1, timestamp: Date.now(), reason: lastRetryableError, errorMessage: retryFailureMessage, delaySeconds: 0 } },
        })

        // 保存错误消息
        const retryErrorContent = isPoolExhausted
          ? lastRetryableError
          : `${retryFailureMessage}: ${lastRetryableError}`
        const retryErrorSDKMsg: SDKMessage = {
          type: 'assistant',
          message: {
            content: [{ type: 'text', text: retryErrorContent }],
          },
          parent_tool_use_id: null,
          error: { message: retryErrorContent, errorType: 'unknown_error' },
          _createdAt: Date.now(),
          _errorCode: 'unknown_error',
          _errorTitle: '重试失败',
        } as unknown as SDKMessage
        appendSDKMessages(sessionId, [retryErrorSDKMsg])

        failRun(`${retryFailureMessage}: ${lastRetryableError}`, getAgentSessionMessages(sessionId), { startedAt: streamStartedAt })
      }

    } finally {
      // 只在 generation 匹配时才清理，防止旧流的 finally 误删新流的注册
      _diag('sendMessage finally 块执行, 清理资源')
      releaseActiveRun()
      permissionService.clearSessionPending(sessionId)
      // askUserService 不在 turn 结束时清理——AskUserQuestion 的生命周期由用户交互决定，
      // 仅在会话真正删除时（DELETE_SESSION IPC）才清理。
      exitPlanService.clearSessionPending(sessionId)
    }
  }

  /**
   * 中止指定会话的 Agent 执行
   *
   * 先从 activeSessions 移除（供 sendMessage catch 块检测用户中止），
   * 再调用 adapter.abort() 中止底层 SDK 进程。
   */
  stop(sessionId: string): void {
    this.activeSessions.delete(sessionId)
    this.sessionPermissionModes.delete(sessionId)
    this.stoppedBySessions.add(sessionId)
    this.queuedMessageUuids.delete(sessionId)
    this.adapter.abort(sessionId)
    console.log(`[Agent 编排] 已中止会话: ${sessionId}`)
  }

  /** 检查指定会话是否正在处理中 */
  isActive(sessionId: string): boolean {
    return this.activeSessions.has(sessionId)
  }

  /**
   * 运行中动态切换会话的权限模式
   *
   * 同时更新 Proma 侧（canUseTool 闭包读取的 Map）和 SDK 侧（query.setPermissionMode）。
   * 典型场景：用户在 Agent 运行中通过 PermissionModeSelector 切换模式。
   */
  async updateSessionPermissionMode(sessionId: string, mode: PromaPermissionMode): Promise<void> {
    if (!this.activeSessions.has(sessionId)) return
    this.sessionPermissionModes.set(sessionId, mode)
    this.eventBus.emit(sessionId, {
      kind: 'proma_event',
      event: { type: 'plan_mode_changed', sessionId, active: mode === 'plan', source: 'permission' },
    })
    // 同步通知 SDK 侧
    if (this.adapter.setPermissionMode) {
      await this.adapter.setPermissionMode(sessionId, sdkPermissionModeForPromaMode(mode))
    }
    console.log(`[Agent 编排] 运行中权限模式已切换: sessionId=${sessionId}, mode=${mode}`)
  }

  // ===== 标题生成 =====

  /**
   * 生成 Agent 会话标题
   *
   * 委托给 orchestrator/title-generator.ts
   */
  async generateTitle(input: AgentGenerateTitleInput): Promise<string | null> {
    return generateTitle(input)
  }

  // ===== 快照回退 =====

  /**
   * 回退会话到指定消息点
   *
   * 委托给 orchestrator/rewind.ts
   */
  async rewindSession(
    sessionId: string,
    assistantMessageUuid: string,
  ): Promise<RewindSessionResult> {
    return rewindSessionImpl(sessionId, assistantMessageUuid, this.activeSessions)
  }

  /** 中止所有活跃的 Agent 会话（应用退出时调用） */
  stopAll(): void {
    if (this.activeSessions.size > 0) {
      console.log(`[Agent 编排] 正在中止所有活跃会话 (${this.activeSessions.size} 个)...`)
    }
    // 即便 activeSessions 为空，也要调 dispose 清理可能残留的 pidMap / 子进程
    this.adapter.dispose()
    this.activeSessions.clear()
    this.sessionPermissionModes.clear()
    this.queuedMessageUuids.clear()
  }

  // ===== 队列消息管理 =====

  /**
   * 流式追加消息
   *
   * 在 Agent 运行中注入用户消息到 SDK，使用 'now' 优先级立即处理。
   * 消息立即持久化到 JSONL。
   *
   * @returns 消息 UUID
   */
  async queueMessage(
    sessionId: string,
    text: string,
    _priority?: string,
    presetUuid?: string,
    opts?: { interrupt?: boolean },
  ): Promise<string> {
    if (!this.activeSessions.has(sessionId)) {
      throw new Error(`[Agent 编排] 会话未运行，无法追加消息: ${sessionId}`)
    }

    if (!this.adapter.sendQueuedMessage) {
      throw new Error('[Agent 编排] 当前适配器不支持流式追加消息')
    }

    const uuid = presetUuid || randomUUID()

    // 防重记录
    const uuids = this.queuedMessageUuids.get(sessionId) ?? new Set<string>()
    uuids.add(uuid)
    this.queuedMessageUuids.set(sessionId, uuids)

    // 构造 SDKUserMessage 并注入（强制 'now' 优先级）
    const sdkMessage = {
      type: 'user' as const,
      message: { role: 'user' as const, content: text },
      parent_tool_use_id: null,
      priority: 'now' as const,
      uuid,
      session_id: sessionId,
    }

    try {
      // 用户希望"立即打断当前输出并续跑新消息"：先软中断，再把消息压入通道
      // - interrupt() 让 SDK 结束当前 turn 并 yield 一个 aborted result
      // - 随后通道里的 'now' 消息会作为下一轮 turn 的用户输入被消费
      if (opts?.interrupt && this.adapter.interruptQuery) {
        try {
          await this.adapter.interruptQuery(sessionId)
        } catch (error) {
          console.warn(`[Agent 编排] 软中断失败（将继续追加消息）:`, error)
        }
      }

      await this.adapter.sendQueuedMessage(sessionId, sdkMessage)

      // 立即持久化到 JSONL
      const persistMsg: SDKMessage = {
        type: 'user',
        uuid,
        message: {
          content: [{ type: 'text', text }],
        },
        parent_tool_use_id: null,
        _createdAt: Date.now(),
      } as unknown as SDKMessage
      appendSDKMessages(sessionId, [persistMsg])
    } catch (error) {
      uuids.delete(uuid)
      throw error
    }

    return uuid
  }
}
