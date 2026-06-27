/**
 * Preload 脚本
 *
 * 通过 contextBridge 安全地将 API 暴露给渲染进程
 * 使用上下文隔离确保安全性
 */

// 启动耗时追踪
const PRELOAD_START_MS = Date.now()
function preloadElapsed(label: string): void {
  console.log(`[启动耗时-preload] +${((Date.now() - PRELOAD_START_MS) / 1000).toFixed(2)}s | ${label}`)
}
preloadElapsed('preload 脚本开始执行')

import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { IPC_CHANNELS, CHANNEL_IPC_CHANNELS, CHAT_IPC_CHANNELS, AGENT_IPC_CHANNELS, EXPERT_IPC_CHANNELS, ENVIRONMENT_IPC_CHANNELS, INSTALLER_IPC_CHANNELS, PROXY_IPC_CHANNELS, GITHUB_RELEASE_IPC_CHANNELS, SYSTEM_PROMPT_IPC_CHANNELS, MEMORY_IPC_CHANNELS, CHAT_TOOL_IPC_CHANNELS, FEISHU_IPC_CHANNELS, DINGTALK_IPC_CHANNELS, WECHAT_IPC_CHANNELS, AUTOMATION_IPC_CHANNELS, SYSTEM_LOG_IPC_CHANNELS } from '@proma/shared'
import { USER_PROFILE_IPC_CHANNELS, SETTINGS_IPC_CHANNELS, LOCAL_API_IPC_CHANNELS, SCRATCH_PAD_IPC_CHANNELS, APP_ICON_IPC_CHANNELS, DOCK_BADGE_IPC_CHANNELS, STORAGE_IPC_CHANNELS } from '../types'
import type {
  RuntimeStatus,
  GitRepoStatus,
  Channel,
  ChannelCreateInput,
  ChannelUpdateInput,
  ChannelTestResult,
  ChannelModelTestInput,
  ChannelModelTestResult,
  FetchModelsInput,
  FetchModelsResult,
  ConversationMeta,
  ChatMessage,
  ChatSendInput,
  GenerateTitleInput,
  StreamChunkEvent,
  StreamReasoningEvent,
  StreamCompleteEvent,
  StreamErrorEvent,
  StreamToolActivityEvent,
  StreamRetryEvent,
  StreamRetryAttemptEvent,
  StreamRetryClearedEvent,
  StreamRetryFailedEvent,
  AttachmentSaveInput,
  AttachmentSaveResult,
  FileDialogResult,
  RecentMessagesResult,
  MessageSearchResult,
  AgentSessionMeta,
  SDKMessage,
  AgentSendInput,
  AgentStreamEvent,
  AgentStreamCompletePayload,
  AgentWorkspace,
  AgentGenerateTitleInput,
  AgentSaveFilesInput,
  AgentSaveWorkspaceFilesInput,
  AgentCopyExternalPathsInput,
  AgentCopyExternalPathsResult,
  AgentSavedFile,
  AgentAttachDirectoryInput,
  AgentAttachFileInput,
  WorkspaceAttachDirectoryInput,
  WorkspaceAttachFileInput,
  GetTaskOutputInput,
  GetTaskOutputResult,
  StopTaskInput,
  WorkspaceMcpConfig,
  ConnectorInitProgressEvent,
  InitializeDefaultConnectorInput,
  InitializeDefaultConnectorResult,
  FeishuCliAuthState,
  FeishuCliDeviceCodeData,
  FeishuCliPollResult,
  ConnectorsConfig,
  AgentSlashCommand,
  SkillMeta,
  OtherWorkspaceSkillsGroup,
  WorkspaceCapabilities,
  HtSkillHubSkill,
  HtSkillHubSkillPage,
  HtSkillHubInstallResult,
  AgentPluginInfo,
  AgentPluginMarketplace,
  AgentPluginMarketplacePlugin,
  AgentPluginMarketplaceDetail,
  AgentPluginCapabilitySummary,
  AgentPluginInstallInput,
  AgentPluginInstallProgress,
  AgentPluginInstallResult,
  AgentPluginMarketplaceType,
  AgentExpertGroupInfo,
  ServerExpertGroupSummary,
  FeaturedScene,
  RemoteDownloadProgress,
  EnsureExpertGroupLatestResult,
  FileEntry,
  CreateFileEntryInput,
  FileSearchResult,
  EnvironmentCheckResult,
  InstallerManifest,
  InstallerDownloadRequest,
  InstallerDownloadResult,
  InstallerProgressPayload,
  ProxyConfig,
  SystemProxyDetectResult,
  GitHubRelease,
  GitHubReleaseListOptions,
  PermissionRequest,
  PermissionResponse,
  PromaPermissionMode,
  AskUserRequest,
  AskUserResponse,
  ExitPlanModeResponse,
  SystemPromptConfig,
  SystemPrompt,
  SystemPromptCreateInput,
  SystemPromptUpdateInput,
  MemoryConfig,
  ChatToolInfo,
  ChatToolState,
  ChatToolMeta,
  MoveSessionToWorkspaceInput,
  ForkSessionInput,
  RewindSessionInput,
  RewindSessionResult,
  AgentMessageSearchResult,
  AgentSessionReferenceSearchInput,
  AgentSessionReferenceSearchResult,
  DetachedPreviewWindowData,
  DetachedPreviewWindowInput,
  HtmlPreviewResult,
  FeishuConfig,
  FeishuConfigInput,
  FeishuBridgeState,
  FeishuTestResult,
  FeishuChatBinding,
  FeishuPresenceReport,
  FeishuUpdateBindingInput,
  DingTalkConfig,
  DingTalkConfigInput,
  DingTalkBridgeState,
  DingTalkTestResult,
  WeChatConfig,
  WeChatBridgeState,
  AgentQueueMessageInput,
  PendingRequestsSnapshot,
  Automation,
  CreateAutomationInput,
  UpdateAutomationInput,
  SystemLogReadInput,
  SystemLogReadResult,
  CreateCubeResult,
  QueryCubeResult,
} from '@proma/shared'
import type {
  UserProfile,
  AppSettings,
  ConfigRootInfo,
  QuickTaskSubmitInput,
  QuickTaskOpenSessionData,
  VoiceDictationAudioChunkInput,
  VoiceDictationCommitInput,
  VoiceDictationCommitResult,
  VoiceDictationResizeInput,
  VoiceDictationSettings,
  VoiceDictationSettingsUpdate,
  VoiceDictationStartInput,
  VoiceDictationStateEvent,
  VoiceDictationStopInput,
  VoiceDictationTestResult,
  VoiceDictationTranscriptEvent,
  MicPermissionResult,
  TrayCreateSessionData,
  TrayOpenAgentSessionData,
} from '../types'
import type { LocalApiPublicSettings, LocalApiSettings, LocalApiTokenResetResult } from '../main/lib/local-api-types'
import { QUICK_TASK_IPC_CHANNELS, TRAY_IPC_CHANNELS, VOICE_DICTATION_IPC_CHANNELS } from '../types'
import { createAuthPreloadApi } from '../auth'
import { createPlatformModelsPreloadApi } from './platform-models'
import type { PlatformModelsElectronAPI } from './platform-models'

/**
 * 暴露给渲染进程的 API 接口定义
 */
export interface ElectronAPI {
  // ===== WorkMate 认证 =====
  auth: ReturnType<typeof createAuthPreloadApi>['auth']
  // ===== WorkMate 平台模型 =====
  platformModels: PlatformModelsElectronAPI

  // ===== WorkMate 观测上报 =====
  /** 上报渲染进程错误到主进程观测服务 */
  reportRendererError: (payload: { name: string; message: string; stack?: string; componentStack?: string }) => Promise<void>

  // ===== 运行时相关 =====

  /**
   * 获取运行时状态
   * @returns 运行时状态，包含 Bun、Git 等信息
   */
  getRuntimeStatus: () => Promise<RuntimeStatus | null>

  /**
   * 订阅后台运行时检测完成的推送
   * @param callback 收到最新运行时状态时回调
   * @returns 取消订阅函数
   */
  onRuntimeStatusUpdated: (callback: (status: RuntimeStatus) => void) => () => void

  /**
   * 重新初始化运行时状态（重新跑 Node / Bun / Git / Shell 检测）
   * 用户安装完 Git / Node 后触发，强制刷新缓存
   */
  reinitRuntime: () => Promise<RuntimeStatus>

  /**
   * 获取指定目录的 Git 仓库状态
   * @param dirPath - 目录路径
   * @returns Git 仓库状态
   */
  getGitRepoStatus: (dirPath: string) => Promise<GitRepoStatus | null>

  /** 获取未暂存的变更文件列表 */
  getUnstagedChanges: (dirPath: string, sessionPath?: string, workspaceFilesPath?: string, extraPaths?: string[], sessionId?: string) => Promise<import('@proma/shared').UnstagedChangesResult>
  /** 获取单个文件的 diff */
  getFileDiff: (input: import('@proma/shared').GetFileDiffInput) => Promise<string>
  /** 获取未追踪文件内容 */
  getUntrackedContent: (input: import('@proma/shared').GetFileDiffInput) => Promise<string>
  /** 还原文件变更 */
  revertFile: (input: import('@proma/shared').RevertFileInput) => Promise<void>
  /** 获取文件新旧版本内容 */
  getDiffContents: (input: import('@proma/shared').GetFileDiffInput) => Promise<{ oldContent: string; newContent: string } | null>
  /** 列出 Git Worktree */
  listWorktrees: (repoPath: string, sessionId: string) => Promise<import('@proma/shared').WorktreeInfo[]>
  /** 获取 Worktree 相对于基准分支的全量变更 */
  getWorktreeChanges: (worktreePath: string, baseBranch: string, sessionId: string) => Promise<import('@proma/shared').UnstagedChangesResult>
  /** 在独立窗口打开当前文件预览 */
  openDetachedPreview: (input: DetachedPreviewWindowInput) => Promise<string | null>
  /** 获取独立预览窗口数据 */
  getDetachedPreviewData: (previewId: string) => Promise<DetachedPreviewWindowData | null>

  // ===== 通用工具 =====

  /** 在系统默认浏览器中打开外部链接 */
  openExternal: (url: string) => Promise<void>

  /** 读取应用系统日志 */
  readSystemLog: (input: SystemLogReadInput) => Promise<SystemLogReadResult>

  /** 打开应用系统日志目录 */
  openSystemLogDir: () => Promise<void>

  /** 上报系统日志到服务端 */
  uploadSystemLog: () => Promise<
    | { success: true; fileName: string; fileSize?: number; uploadedAt?: string }
    | { success: false; error: string }
  >

  /** 提交问题反馈 */
  submitIssue: (input: {
    description: string
    files: Array<{ name: string; data: number[]; mimeType: string }>
  }) => Promise<
    | { success: true; id: number; imageCount: number }
    | { success: false; error: string }
  >

  // ===== 窗口控制（Windows 自定义标题栏）=====

  /** 最小化窗口 */
  windowMinimize: () => Promise<void>
  /** 最大化/还原窗口 */
  windowMaximize: () => Promise<void>
  /** 关闭窗口 */
  windowClose: () => Promise<void>
  /** 窗口是否处于最大化状态 */
  windowIsMaximized: () => Promise<boolean>
  /** 订阅窗口最大化/还原事件 */
  onWindowResize: (callback: () => void) => () => void

  // ===== 渠道管理相关 =====

  /** 获取所有渠道列表（apiKey 保持加密态） */
  listChannels: () => Promise<Channel[]>

  /** 创建渠道（apiKey 为明文，主进程加密） */
  createChannel: (input: ChannelCreateInput) => Promise<Channel>

  /** 更新渠道 */
  updateChannel: (id: string, input: ChannelUpdateInput) => Promise<Channel>

  /** 删除渠道 */
  deleteChannel: (id: string) => Promise<void>

  /** 解密获取明文 API Key（仅在用户查看时调用） */
  decryptApiKey: (channelId: string) => Promise<string>

  /** 测试渠道连接 */
  testChannel: (channelId: string) => Promise<ChannelTestResult>

  /** 直接测试连接（无需已保存渠道，传入明文凭证） */
  testChannelDirect: (input: FetchModelsInput) => Promise<ChannelTestResult>

  /** 直接测试单个模型（无需已保存渠道，传入明文凭证和模型 ID） */
  testChannelModelDirect: (input: ChannelModelTestInput) => Promise<ChannelModelTestResult>

  /** 从供应商拉取可用模型列表（直接传入凭证，无需已保存渠道） */
  fetchModels: (input: FetchModelsInput) => Promise<FetchModelsResult>

  // ===== 对话管理相关 =====

  /** 获取对话列表 */
  listConversations: () => Promise<ConversationMeta[]>

  /** 创建对话 */
  createConversation: (title?: string, modelId?: string, channelId?: string) => Promise<ConversationMeta>

  /** 获取对话消息 */
  getConversationMessages: (id: string) => Promise<ChatMessage[]>

  /** 获取对话最近 N 条消息（分页加载） */
  getRecentMessages: (id: string, limit: number) => Promise<RecentMessagesResult>

  /** 更新对话标题 */
  updateConversationTitle: (id: string, title: string) => Promise<ConversationMeta>

  /** 更新对话使用的模型/渠道 */
  updateConversationModel: (id: string, modelId: string, channelId: string) => Promise<ConversationMeta>

  /** 删除对话 */
  deleteConversation: (id: string) => Promise<void>

  /** 切换对话置顶状态 */
  togglePinConversation: (id: string) => Promise<ConversationMeta>

  /** 切换对话归档状态 */
  toggleArchiveConversation: (id: string) => Promise<ConversationMeta>

  /** 搜索对话消息内容 */
  searchConversationMessages: (query: string) => Promise<MessageSearchResult[]>

  // ===== 教程 =====

  /** 获取教程内容 */
  getTutorialContent: () => Promise<string | null>

  /** 创建欢迎对话（含教程附件） */
  createWelcomeConversation: () => Promise<ConversationMeta | null>

  // ===== 使用手册 =====

  manual: {
    /** 检查更新并获取手册内容（三级降级） */
    checkAndGet: () => Promise<import('@proma/shared').ManualContent | null>
    /** 获取图文版手册并在浏览器中打开 */
    openHtmlManual: () => Promise<void>
  }

  // ===== 消息发送 =====

  /** 发送消息（触发 AI 流式响应） */
  sendMessage: (input: ChatSendInput) => Promise<void>

  /** 中止生成 */
  stopGeneration: (conversationId: string) => Promise<void>

  /** 删除指定消息 */
  deleteMessage: (conversationId: string, messageId: string) => Promise<ChatMessage[]>

  /** 从指定消息开始截断（包含该消息） */
  truncateMessagesFrom: (
    conversationId: string,
    messageId: string,
    preserveFirstMessageAttachments?: boolean,
  ) => Promise<ChatMessage[]>

  /** 更新上下文分隔线 */
  updateContextDividers: (conversationId: string, dividers: string[]) => Promise<ConversationMeta>

  /** 生成对话标题 */
  generateTitle: (input: GenerateTitleInput) => Promise<string | null>

  // ===== 附件管理相关 =====

  /** 保存附件到本地 */
  saveAttachment: (input: AttachmentSaveInput) => Promise<AttachmentSaveResult>

  /** 读取附件（返回 base64 字符串） */
  readAttachment: (localPath: string) => Promise<string>

  /** 另存图片到用户选择的位置（原生 Save As 对话框） */
  saveImageAs: (localPath: string, defaultFilename: string) => Promise<boolean>

  /** 保存应用内置资源文件到用户选择的位置（原生 Save As 对话框） */
  saveResourceFileAs: (resourceRelativePath: string, defaultFilename: string) => Promise<boolean>

  /** 删除附件 */
  deleteAttachment: (localPath: string) => Promise<void>

  /** 打开文件选择对话框 */
  openFileDialog: () => Promise<FileDialogResult>

  /** 提取附件文档的文本内容 */
  extractAttachmentText: (localPath: string) => Promise<string>

  // ===== 用户档案相关 =====

  /** 获取用户档案 */
  getUserProfile: () => Promise<UserProfile>

  /** 更新用户档案 */
  updateUserProfile: (updates: Partial<UserProfile>) => Promise<UserProfile>

  // ===== 应用设置相关 =====

  /** 获取应用设置 */
  getSettings: () => Promise<AppSettings>

  /** 更新应用设置 */
  updateSettings: (updates: Partial<AppSettings>) => Promise<AppSettings>

  /** 同步更新应用设置（用于 beforeunload 场景） */
  updateSettingsSync: (updates: Partial<AppSettings>) => boolean

  /** 获取应用数据目录信息 */
  getConfigRootInfo: () => Promise<ConfigRootInfo>

  /** 打开目录选择器并设置应用数据目录（重启后生效） */
  chooseConfigRoot: () => Promise<ConfigRootInfo | null>

  /** 设置应用数据目录（重启后生效） */
  setConfigRoot: (dirPath: string) => Promise<ConfigRootInfo>

  /** 恢复默认应用数据目录 */
  resetConfigRoot: () => Promise<ConfigRootInfo>

  /** 完整重启应用 */
  relaunchApp: () => Promise<void>

  /** 获取系统主题（是否深色模式） */
  getSystemTheme: () => Promise<boolean>

  /** 获取本地 API 服务公开设置 */
  getLocalApiSettings: () => Promise<LocalApiPublicSettings>

  /** 更新本地 API 服务设置 */
  updateLocalApiSettings: (updates: Partial<LocalApiSettings>) => Promise<LocalApiPublicSettings>

  /** 重置本地 API Token，明文 token 只在本次响应返回 */
  resetLocalApiToken: () => Promise<LocalApiTokenResetResult>

  /** 获取本地 API Server 当前运行状态 */
  getLocalApiStatus: () => Promise<{ running: boolean; url: string | null }>

  /** 订阅系统主题变化事件（返回清理函数） */
  onSystemThemeChanged: (callback: (isDark: boolean) => void) => () => void

  /** 订阅用户手动切换主题事件（跨窗口同步，返回清理函数） */
  onThemeSettingsChanged: (callback: (payload: { themeMode: string; themeStyle: string }) => void) => () => void

  // ===== Scratch Pad =====

  /** 从磁盘加载 scratch-pad.md */
  loadScratchPad: () => Promise<string>

  /** 异步保存内容到 scratch-pad.md */
  saveScratchPad: (content: string) => Promise<boolean>

  /** 同步保存内容到 scratch-pad.md（beforeunload 场景） */
  saveScratchPadSync: (content: string) => boolean

  /** 导出 ScratchPad 内容为 Markdown 文件到指定目录 */
  exportScratchPad: (markdown: string, dirPath: string, filename: string) => Promise<string>

  /** 打开原生保存对话框，返回用户选择的路径 */
  chooseExportPath: (defaultName: string) => Promise<string | null>

  // ===== 应用图标切换 =====

  /** 设置应用图标变体（传入 variant ID，如 'blue'、'cyberpunk'，'default' 恢复默认） */
  setAppIcon: (variantId: string) => Promise<boolean>

  /** 设置 Dock/Launcher 角标数量（0 表示清除） */
  setDockBadgeCount: (count: number) => Promise<boolean>

  // ===== 环境检测相关 =====

  /** 执行环境检测 */
  checkEnvironment: () => Promise<EnvironmentCheckResult>

  // ===== 第三方安装包（Git / Node.js）相关 =====

  /** 获取安装包清单（远程，失败回退内置） */
  fetchInstallerManifest: () => Promise<InstallerManifest>

  /** 开始下载指定安装包，resolve 时文件已落地并通过 sha256 校验 */
  downloadInstaller: (req: InstallerDownloadRequest) => Promise<InstallerDownloadResult>

  /** 取消指定 key 的进行中下载 */
  cancelInstallerDownload: (key: string) => Promise<boolean>

  /** 拉起已下载的安装程序（等效双击） */
  launchInstaller: (filePath: string) => Promise<void>

  /** 订阅下载进度事件，返回取消订阅函数 */
  onInstallerProgress: (
    callback: (payload: InstallerProgressPayload) => void,
  ) => () => void

  // ===== 代理配置相关 =====

  /** 获取代理配置 */
  getProxySettings: () => Promise<ProxyConfig>

  /** 更新代理配置 */
  updateProxySettings: (config: ProxyConfig) => Promise<void>

  /** 检测系统代理 */
  detectSystemProxy: () => Promise<SystemProxyDetectResult>

  // ===== 流式事件订阅（返回清理函数） =====

  /** 订阅内容片段事件 */
  onStreamChunk: (callback: (event: StreamChunkEvent) => void) => () => void

  /** 订阅推理片段事件 */
  onStreamReasoning: (callback: (event: StreamReasoningEvent) => void) => () => void

  /** 订阅流式完成事件 */
  onStreamComplete: (callback: (event: StreamCompleteEvent) => void) => () => void

  /** 订阅流式错误事件 */
  onStreamError: (callback: (event: StreamErrorEvent) => void) => () => void

  /** 订阅流式工具活动事件 */
  onStreamToolActivity: (callback: (event: StreamToolActivityEvent) => void) => () => void

  /** 订阅 Chat 重试开始事件 */
  onStreamRetrying: (callback: (event: StreamRetryEvent) => void) => () => void
  /** 订阅 Chat 重试尝试记录事件 */
  onStreamRetryAttempt: (callback: (event: StreamRetryAttemptEvent) => void) => () => void
  /** 订阅 Chat 重试清除事件 */
  onStreamRetryCleared: (callback: (event: StreamRetryClearedEvent) => void) => () => void
  /** 订阅 Chat 重试失败事件 */
  onStreamRetryFailed: (callback: (event: StreamRetryFailedEvent) => void) => () => void

  // ===== Agent 会话管理相关 =====

  /** 获取 Agent 会话列表 */
  listAgentSessions: () => Promise<AgentSessionMeta[]>

  /** 创建 Agent 会话 */
  createAgentSession: (
    title?: string,
    channelId?: string,
    workspaceId?: string,
    expertGroupId?: string,
    expertPluginId?: string,
    expertIntroduction?: string,
  ) => Promise<AgentSessionMeta>

  /** 获取 Agent 会话 SDKMessage（Phase 4 新格式） */
  getAgentSessionSDKMessages: (id: string) => Promise<SDKMessage[]>

  /** 更新 Agent 会话标题 */
  updateAgentSessionTitle: (id: string, title: string) => Promise<AgentSessionMeta>

  /** 删除 Agent 会话 */
  deleteAgentSession: (id: string) => Promise<void>

  /** 迁移 Chat 对话记录到 Agent 会话 */
  migrateChatToAgent: (conversationId: string, agentSessionId: string) => Promise<void>

  /** 切换 Agent 会话置顶状态 */
  togglePinAgentSession: (id: string) => Promise<AgentSessionMeta>

  /** 清除 Agent 会话完成状态（兼容清除旧版 manualWorking） */
  clearAgentCompletionState: (id: string) => Promise<AgentSessionMeta>

  /** 切换 Agent 会话归档状态 */
  toggleArchiveAgentSession: (id: string) => Promise<AgentSessionMeta>

  /** 搜索 Agent 会话消息内容 */
  searchAgentSessionMessages: (query: string) => Promise<AgentMessageSearchResult[]>

  /** 搜索当前工作区可引用的 Agent 会话 */
  searchAgentSessionReferences: (input: AgentSessionReferenceSearchInput) => Promise<AgentSessionReferenceSearchResult[]>

  /** 迁移 Agent 会话到另一个工作区 */
  moveAgentSessionToWorkspace: (input: MoveSessionToWorkspaceInput) => Promise<AgentSessionMeta>

  /** 分叉 Agent 会话 */
  forkAgentSession: (input: ForkSessionInput) => Promise<AgentSessionMeta>

  /** 快照回退（同一会话内回退到指定点，恢复文件 + 截断对话） */
  rewindSession: (input: RewindSessionInput) => Promise<RewindSessionResult>

  /** 生成 Agent 会话标题 */
  generateAgentTitle: (input: AgentGenerateTitleInput) => Promise<string | null>

  /** 发送 Agent 消息 */
  sendAgentMessage: (input: AgentSendInput) => Promise<void>

  /** 中止 Agent 执行 */
  stopAgent: (sessionId: string) => Promise<void>

  // ===== Agent 队列消息 =====

  /** 流式追加发送 Agent 消息（Agent 运行中） */
  queueAgentMessage: (input: AgentQueueMessageInput) => Promise<string>

  // ===== Agent 后台任务管理 =====

  /** 获取任务输出 */
  getTaskOutput: (input: GetTaskOutputInput) => Promise<GetTaskOutputResult>

  /** 停止任务 */
  stopTask: (input: StopTaskInput) => Promise<void>

  /** 获取工作区 Slash Command 列表 */
  listAgentSlashCommands: (workspaceSlug: string) => Promise<AgentSlashCommand[]>

  /** 列出 Agent 插件 */
  listAgentPlugins: () => Promise<AgentPluginInfo[]>
  /** 设置 Agent 插件启用状态 */
  setAgentPluginEnabled: (pluginId: string, enabled: boolean) => Promise<void>
  /** 卸载用户安装的 Agent 插件 */
  uninstallAgentPlugin: (pluginId: string) => Promise<void>
  /** 从 zip 包直接安装用户 Agent 插件 */
  installAgentPluginZip: () => Promise<AgentPluginInfo | null>
  /** 列出插件市场 */
  listAgentPluginMarketplaces: () => Promise<AgentPluginMarketplace[]>
  /** 添加插件市场 */
  addAgentPluginMarketplace: (input: { id: string; name: string; source: string; type: AgentPluginMarketplaceType; branch?: string; auth?: { type: 'none' | 'token'; token?: string } }) => Promise<AgentPluginMarketplace>
  /** 更新插件市场 */
  updateAgentPluginMarketplace: (id: string, updates: Partial<Omit<AgentPluginMarketplace, 'id' | 'addedAt'>>) => Promise<AgentPluginMarketplace>
  /** 删除插件市场 */
  removeAgentPluginMarketplace: (id: string) => Promise<void>
  /** 刷新插件市场 */
  refreshAgentPluginMarketplace: (id: string) => Promise<AgentPluginMarketplace>
  /** 搜索插件市场 */
  searchAgentPluginMarketplace: (query: string) => Promise<AgentPluginMarketplacePlugin[]>
  /** 获取插件市场插件详情 */
  getAgentPluginMarketplaceDetail: (marketplaceId: string, pluginName: string) => Promise<AgentPluginMarketplaceDetail>
  /** 安装插件市场插件 */
  installAgentMarketplacePlugin: (input: AgentPluginInstallInput) => Promise<AgentPluginInstallResult>
  /** 订阅插件市场插件安装进度（返回清理函数） */
  onAgentPluginInstallProgress: (callback: (progress: AgentPluginInstallProgress) => void) => () => void
  /** 获取 Agent 插件能力摘要 */
  getAgentPluginCapabilities: () => Promise<AgentPluginCapabilitySummary>
  /** 列出 Agent 专家团 */
  listAgentExpertGroups: () => Promise<AgentExpertGroupInfo[]>
  /** 获取 Agent 专家团详情 */
  getAgentExpertGroup: (input: { expertGroupId: string; expertPluginId?: string }) => Promise<AgentExpertGroupInfo | undefined>
  /** 配置插件 MCP 环境变量 */
  configureAgentPluginMcpEnv: (serverId: string, env: Record<string, string>) => Promise<void>
  /** 测试插件 MCP */
  testAgentPluginMcp: (serverId: string) => Promise<{ success: boolean; message: string }>

  // ===== 专家团服务端化 =====

  /** 获取服务端专家团列表 */
  fetchServerExpertGroups: () => Promise<ServerExpertGroupSummary[]>
  /** 获取精选场景分类 */
  fetchFeaturedScenes: () => Promise<FeaturedScene[]>
  /** 下载并安装远程专家团 */
  downloadRemoteExpert: (groupId: string) => Promise<AgentPluginInfo>
  /** 取消远程专家团下载 */
  cancelRemoteDownload: (groupId: string) => Promise<void>
  /** 获取服务端专家团分类列表 */
  fetchServerExpertGroupCategories: () => Promise<string[]>
  /** 订阅下载进度事件（返回清理函数） */
  onExpertDownloadProgress: (callback: (progress: RemoteDownloadProgress) => void) => () => void
  /** 召唤前确保专家团为最新版（静默检查 group-detail 版本，按需覆盖下载；失败降级本地版） */
  ensureExpertGroupLatest: (groupId: string, localVersion: string) => Promise<EnsureExpertGroupLatestResult>

  // ===== Agent 工作区管理相关 =====

  /** 获取 Agent 工作区列表 */
  listAgentWorkspaces: () => Promise<AgentWorkspace[]>

  /** 创建 Agent 工作区 */
  createAgentWorkspace: (name: string) => Promise<AgentWorkspace>

  /** 更新 Agent 工作区 */
  updateAgentWorkspace: (id: string, updates: { name: string }) => Promise<AgentWorkspace>

  /** 删除 Agent 工作区 */
  deleteAgentWorkspace: (id: string) => Promise<void>

  /** 重排工作区顺序 */
  reorderAgentWorkspaces: (orderedIds: string[]) => Promise<AgentWorkspace[]>

  // ===== 工作区能力（MCP + Skill） =====

  /** 获取工作区能力摘要 */
  getWorkspaceCapabilities: (workspaceSlug: string) => Promise<WorkspaceCapabilities>

  /** 获取工作区 MCP 配置 */
  getWorkspaceMcpConfig: (workspaceSlug: string) => Promise<WorkspaceMcpConfig>

  /** 保存工作区 MCP 配置 */
  saveWorkspaceMcpConfig: (workspaceSlug: string, config: WorkspaceMcpConfig) => Promise<void>

  /** 测试 MCP 服务器连接 */
  testMcpServer: (name: string, entry: import('@proma/shared').McpServerEntry) => Promise<{ success: boolean; message: string }>

  /** 初始化内置连接器 */
  initializeDefaultConnector: (workspaceSlug: string, input: InitializeDefaultConnectorInput) => Promise<InitializeDefaultConnectorResult>
  /** 订阅内置连接器初始化进度 */
  onConnectorInitProgress: (callback: (event: ConnectorInitProgressEvent) => void) => () => void
  /** 获取飞书 CLI 授权状态 */
  getFeishuCliAuthStatus: () => Promise<FeishuCliAuthState>
  /** 注册飞书 CLI 应用（SDK registerApp，阻塞直至用户扫码完成） */
  registerFeishuCliApp: () => Promise<{ appId: string; appSecret: string }>
  /** 取消飞书 CLI 注册 */
  cancelFeishuCliRegister: () => Promise<void>
  /** 监听注册 QR 码就绪 */
  onFeishuCliRegisterQrcode: (callback: (payload: { url: string; expireIn: number }) => void) => () => void
  /** 监听注册状态变更 */
  onFeishuCliRegisterStatus: (callback: (payload: { status: string; interval?: number }) => void) => () => void
  /** 发起设备授权（获取 device_code + verification_uri） */
  startFeishuDeviceAuth: (appId: string, appSecret: string) => Promise<FeishuCliDeviceCodeData>
  /** 轮询设备授权 Token（含两阶段认证） */
  pollFeishuDeviceAuth: (appId: string, appSecret: string, deviceCode: string, phase: number) => Promise<FeishuCliPollResult>
  /** 解绑飞书 CLI（清除凭据） */
  unbindFeishuCli: () => Promise<boolean>

  /** 获取工作区连接器配置 */
  getConnectorsConfig: (workspaceSlug: string) => Promise<ConnectorsConfig>
  /** 保存工作区连接器配置 */
  saveConnectorsConfig: (workspaceSlug: string, config: ConnectorsConfig) => Promise<void>
  /** 注册用户创建的连接器（创建目录 + connector.json + mcp.json + connectors.json） */
  registerUserConnector: (workspaceSlug: string, name: string, entry: import('@proma/shared').McpServerEntry, displayName?: string) => Promise<void>
  /** 注销用户创建的连接器（删除目录 + connectors.json 条目 + mcp.json 条目） */
  unregisterUserConnector: (workspaceSlug: string, name: string) => Promise<void>

  /** 同步预置连接器到指定工作区（补齐缺失的 skill 文件等） */
  syncDefaultConnectors: (workspaceSlug: string) => Promise<void>

  /** 获取工作区 Skill 列表（含活跃和不活跃） */
  getWorkspaceSkills: (workspaceSlug: string) => Promise<SkillMeta[]>

  /** 获取工作区 Skills 目录绝对路径 */
  getWorkspaceSkillsDir: (workspaceSlug: string) => Promise<string>

  /** 删除工作区 Skill */
  deleteWorkspaceSkill: (workspaceSlug: string, skillSlug: string) => Promise<void>

  /** 切换工作区 Skill 启用/禁用 */
  toggleWorkspaceSkill: (workspaceSlug: string, skillSlug: string, enabled: boolean) => Promise<void>

  /** 获取其他工作区的 Skill 列表 */
  getOtherWorkspaceSkills: (currentSlug: string) => Promise<OtherWorkspaceSkillsGroup[]>

  /** 获取默认 Skills 的 slug 列表（来自 ~/.proma/default-skills/） */
  getDefaultSkillSlugs: () => Promise<string[]>

  /** 从其他工作区导入 Skill */
  importSkillFromWorkspace: (targetSlug: string, sourceSlug: string, skillSlug: string) => Promise<SkillMeta>

  /** 上传 zip 包安装 Skill */
  installSkillZip: (workspaceSlug: string) => Promise<SkillMeta | null>

  /** 从源工作区同步更新已导入的 Skill */
  updateSkillFromSource: (targetSlug: string, skillSlug: string) => Promise<SkillMeta>

  /** 读取 SKILL.md 全文内容 */
  readSkillContent: (workspaceSlug: string, skillSlug: string) => Promise<string>

  /** 写入 SKILL.md 全文内容 */
  writeSkillContent: (workspaceSlug: string, skillSlug: string, content: string) => Promise<void>

  /** 列出 Skill 目录下的子文件树（不含 SKILL.md） */
  listSkillFiles: (workspaceSlug: string, skillSlug: string) => Promise<import('@proma/shared').SkillFileNode[]>

  /** 读取 Skill 目录下的子文件内容 */
  readSkillFile: (workspaceSlug: string, skillSlug: string, relativePath: string) => Promise<import('@proma/shared').SkillFileContent>

  /** 写入 Skill 目录下的子文件内容（文本） */
  writeSkillFile: (workspaceSlug: string, skillSlug: string, relativePath: string, content: string) => Promise<void>

  /** 在 Skill 目录下创建文件或目录 */
  createSkillEntry: (workspaceSlug: string, skillSlug: string, relativePath: string, type: 'file' | 'directory') => Promise<void>

  /** 删除 Skill 目录下的文件或目录 */
  deleteSkillEntry: (workspaceSlug: string, skillSlug: string, relativePath: string) => Promise<void>

  /** 重命名/移动 Skill 目录下的文件或目录 */
  renameSkillEntry: (workspaceSlug: string, skillSlug: string, fromRelative: string, toRelative: string) => Promise<void>

  /** 获取华泰 SkillHub 清单 */
  getHtSkillHubSkills: (workspaceSlug: string, page?: number, keyword?: string, category?: string, pageSize?: number) => Promise<HtSkillHubSkillPage>

  /** 读取华泰 SkillHub 远端 SKILL.md */
  readHtSkillHubSkill: (skillName: string) => Promise<string>

  /** 安装华泰 SkillHub Skill 到当前工作区 */
  installHtSkillHubSkill: (workspaceSlug: string, skillName: string, overwrite: boolean) => Promise<HtSkillHubInstallResult>

  /** SkillHub 认证状态查询 */
  getSkillHubAuthStatus: () => Promise<{ authenticated: boolean; expiresAt?: number; remainingSeconds?: number }>

  /** SkillHub 认证（换票） */
  skillHubAuthenticate: () => Promise<void>

  /** 卸载 SkillHub Skill */
  uninstallHtSkillHubSkill: (workspaceSlug: string, skillName: string) => Promise<void>

  /** 检查 Skill 更新 */
  checkSkillUpdates: (workspaceSlug: string) => Promise<Array<{ skillName: string; currentVersion?: string; latestVersion?: string; hasUpdate: boolean }>>

  /** 批量安装 SkillHub Skill */
  batchInstallHtSkillHubSkills: (workspaceSlug: string, skillNames: string[], overwrite?: boolean) => Promise<Array<{ skillName: string; status: 'installed' | 'overwritten'; enabled: boolean }>>

  /** 批量卸载 SkillHub Skill */
  batchUninstallHtSkillHubSkills: (workspaceSlug: string, skillNames: string[]) => Promise<void>

  /** 订阅 Agent 流式事件（返回清理函数） */
  onAgentStreamEvent: (callback: (event: AgentStreamEvent) => void) => () => void

  /** 订阅 Agent 流式完成事件 */
  onAgentStreamComplete: (callback: (data: AgentStreamCompletePayload) => void) => () => void

  /** 订阅 Agent 流式错误事件 */
  onAgentStreamError: (callback: (data: { sessionId: string; error: string }) => void) => () => void

  /** 订阅 Agent 标题自动更新事件 */
  onAgentTitleUpdated: (callback: (data: { sessionId: string; title: string }) => void) => () => void

  // ===== Agent 权限系统 =====

  /** 响应权限请求 */
  respondPermission: (response: PermissionResponse) => Promise<void>

  /** 热切换指定会话的权限模式（运行中生效，仅影响该 session） */
  updateSessionPermissionMode: (sessionId: string, mode: PromaPermissionMode) => Promise<void>

  /** 获取全局记忆配置 */
  getMemoryConfig: () => Promise<MemoryConfig>

  /** 保存全局记忆配置 */
  setMemoryConfig: (config: MemoryConfig) => Promise<void>

  /** 测试记忆连接（查询当前立方偏好和事实） */
  testMemoryConnection: () => Promise<{ success: boolean; message: string; data?: QueryCubeResult }>

  /** 创建记忆立方 */
  createMemoryCube: () => Promise<CreateCubeResult>

  /** 查询记忆立方内容（偏好和事实） */
  queryMemoryCube: () => Promise<QueryCubeResult>

  // ===== Chat 工具管理 =====

  /** 获取所有工具信息 */
  getChatTools: () => Promise<ChatToolInfo[]>

  /** 获取工具凭据 */
  getChatToolCredentials: (toolId: string) => Promise<Record<string, string>>

  /** 更新工具开关状态 */
  updateChatToolState: (toolId: string, state: ChatToolState) => Promise<void>

  /** 更新工具凭据 */
  updateChatToolCredentials: (toolId: string, credentials: Record<string, string>) => Promise<void>

  /** 创建自定义工具 */
  createCustomChatTool: (meta: ChatToolMeta) => Promise<void>

  /** 删除自定义工具 */
  deleteCustomChatTool: (toolId: string) => Promise<void>

  /** 监听自定义工具配置变更 */
  onCustomToolChanged: (callback: () => void) => () => void

  /** 测试工具连接 */
  testChatTool: (toolId: string, options?: { query?: string; timeRange?: 'OneDay' | 'OneWeek' | 'OneMonth' | 'OneYear' }) => Promise<{ success: boolean; message: string; details?: string }>

  // ===== AskUserQuestion 交互式问答 =====

  /** 响应 AskUser 请求 */
  respondAskUser: (response: AskUserResponse) => Promise<void>

  // ===== ExitPlanMode 计划审批 =====

  /** 响应 ExitPlanMode 请求 */
  respondExitPlanMode: (response: ExitPlanModeResponse) => Promise<void>

  /** 获取所有待处理的交互请求快照（渲染进程重载后恢复状态） */
  getPendingRequests: () => Promise<PendingRequestsSnapshot>

  // ===== Agent 附件 =====

  /** 保存文件到 Agent session 工作目录 */
  saveFilesToAgentSession: (input: AgentSaveFilesInput) => Promise<AgentSavedFile[]>

  /** 保存文件到工作区文件目录 */
  saveFilesToWorkspaceFiles: (input: AgentSaveWorkspaceFilesInput) => Promise<AgentSavedFile[]>

  /** 复制外部文件/文件夹到托管目录（支持文件夹递归） */
  copyExternalPathsIntoManagedDir: (input: AgentCopyExternalPathsInput) => Promise<AgentCopyExternalPathsResult>

  /** 获取工作区文件目录路径 */
  getWorkspaceFilesPath: (workspaceSlug: string) => Promise<string>

  /** 打开文件夹选择对话框 */
  openFolderDialog: () => Promise<{ path: string; name: string } | null>

  /** 附加外部目录到 Agent 会话 */
  attachDirectory: (input: AgentAttachDirectoryInput) => Promise<string[]>

  /** 移除会话的附加目录 */
  detachDirectory: (input: AgentAttachDirectoryInput) => Promise<string[]>

  /** 附加外部文件到 Agent 会话 */
  attachFile: (input: AgentAttachFileInput) => Promise<string[]>

  /** 移除会话的附加文件 */
  detachFile: (input: AgentAttachFileInput) => Promise<string[]>

  /** 附加外部目录到工作区（所有会话可访问） */
  attachWorkspaceDirectory: (input: WorkspaceAttachDirectoryInput) => Promise<string[]>

  /** 移除工作区的附加目录 */
  detachWorkspaceDirectory: (input: WorkspaceAttachDirectoryInput) => Promise<string[]>

  /** 附加外部文件到工作区（所有会话可访问） */
  attachWorkspaceFile: (input: WorkspaceAttachFileInput) => Promise<string[]>

  /** 移除工作区的附加文件 */
  detachWorkspaceFile: (input: WorkspaceAttachFileInput) => Promise<string[]>

  /** 获取工作区附加目录列表 */
  getWorkspaceDirectories: (workspaceSlug: string) => Promise<string[]>

  /** 获取工作区附加文件列表 */
  getWorkspaceAttachedFiles: (workspaceSlug: string) => Promise<string[]>
  /** 获取工作区 worktree 仓库配置列表 */
  getWorktreeRepos: (workspaceSlug: string) => Promise<import('@proma/shared').WorkspaceWorktreeRepo[]>
  /** 添加 worktree 仓库到工作区配置 */
  addWorktreeRepo: (workspaceSlug: string, repo: import('@proma/shared').WorkspaceWorktreeRepo) => Promise<import('@proma/shared').WorkspaceWorktreeRepo[]>
  /** 从工作区配置移除 worktree 仓库 */
  removeWorktreeRepo: (workspaceSlug: string, repoPath: string) => Promise<import('@proma/shared').WorkspaceWorktreeRepo[]>

  // ===== Agent 文件系统操作 =====

  /** 获取 session 工作路径 */
  getAgentSessionPath: (workspaceId: string, sessionId: string) => Promise<string | null>

  /** 列出目录内容 */
  listDirectory: (dirPath: string) => Promise<FileEntry[]>

  /** 在托管文件目录下新建文件或文件夹 */
  createFileEntry: (input: CreateFileEntryInput) => Promise<FileEntry>

  /** 删除文件/目录 */
  deleteFile: (filePath: string) => Promise<void>

  /** 用系统默认应用打开文件 */
  openFile: (filePath: string) => Promise<void>

  /** 将剪贴板文本写入临时预览文件并返回绝对路径 */
  writeClipboardPreview: (filename: string, content: string) => Promise<string>

  /** 用系统默认应用打开任意文件（无工作区限制） */
  systemOpenFile: (filePath: string, appName?: string, access?: import('@proma/shared').FileAccessOptions) => Promise<void>

  /** 扫描系统中可用的编辑器应用（仅 macOS） */
  scanEditors: () => Promise<import('@proma/shared').EditorApp[]>

  /** 查询本机为该文件类型注册的默认打开应用（含图标 dataURL） */
  getDefaultAppForFile: (filePath: string, access?: import('@proma/shared').FileAccessOptions) => Promise<import('@proma/shared').DefaultAppInfo | null>

  /** 在系统文件管理器中显示文件 */
  showInFolder: (filePath: string) => Promise<void>

  /** 在系统文件管理器中打开插件目录 */
  showPluginInFolder: (pluginPath: string) => Promise<void>

  /** 打开用户插件本地命名空间目录（user-plugins/local），供手动放入自定义专家 */
  openUserPluginsLocalDir: () => Promise<void>

  /** 打开默认 Skill 模板目录（default-skills），供手动放入自定义技能 */
  openDefaultSkillsDir: () => Promise<void>

  /** 解析文件路径并读取内容（供内联预览使用） */
  resolveAndReadFile: (filePath: string, access?: import('@proma/shared').FileAccessOptions) => Promise<import('@proma/shared').FilePreviewReadResult>

  /** 写入文本文件（供 Markdown 内联编辑使用） */
  writeTextFile: (filePath: string, content: string, access?: import('@proma/shared').FileAccessOptions) => Promise<boolean>

  /** 仅解析文件路径（供 PDF/图片等用 file:// 加载） */
  resolveFilePath: (filePath: string, access?: import('@proma/shared').FileAccessOptions) => Promise<import('@proma/shared').ResolvedFileUrl | null>

  /** 为内联 PDF 预览生成临时 HTML 文件，返回文件路径 */
  preparePdfPreview: (filePath: string, access?: import('@proma/shared').FileAccessOptions) => Promise<{ tmpHtmlUrl: string } | null>

  /** 准备静态 HTML 内联预览 URL */
  prepareHtmlPreview: (filePath: string, access?: import('@proma/shared').FileAccessOptions) => Promise<HtmlPreviewResult | null>

  /** 读取文件为 base64（带路径校验，供内联图片预览等） */
  readBinaryBase64: (filePath: string, access?: import('@proma/shared').FileAccessOptions, maxSize?: number) => Promise<string | null>

  /** DOCX 转 HTML（内联预览） */
  docxToHtml: (filePath: string, access?: import('@proma/shared').FileAccessOptions) => Promise<{ resolvedPath: string; html: string } | null>

  /** XLSX/PPTX 转 HTML（内联预览） */
  officeToHtml: (filePath: string, access?: import('@proma/shared').FileAccessOptions) => Promise<import('@proma/shared').OfficePreviewResult | null>

  /** 截图导出：将 HTML 渲染为 PNG 并复制到剪贴板或保存文件 */
  screenshotCapture: (input: { html: string; isDark: boolean; width?: number; mode: 'clipboard' | 'file'; css?: string; themeClass?: string }) => Promise<{ success: boolean; message: string; filePath?: string }>

  /** 重命名文件/目录 */
  renameFile: (filePath: string, newName: string) => Promise<void>

  /** 移动文件/目录到目标目录 */
  moveFile: (filePath: string, targetDir: string) => Promise<void>

  /** 复制文件/目录到目标目录（返回新文件路径） */
  copyFile: (sourcePath: string, targetDir: string) => Promise<string>

  /** 清除系统剪贴板（用于内部文件复制时清除残留文件对象） */
  clearSystemClipboard: () => Promise<void>
  /** 将文件路径写入系统剪贴板（支持在外部资源管理器/Finder 中粘贴） */
  writePathsToSystemClipboard: (paths: string[]) => Promise<void>

  /** 列出附加目录内容 */
  listAttachedDirectory: (dirPath: string, access?: import('@proma/shared').FileAccessOptions) => Promise<FileEntry[]>

  /** 读取附加目录文件内容为 base64（限制在已附加目录范围内） */
  readAttachedFile: (filePath: string, sessionId?: string, workspaceSlug?: string) => Promise<string>

  /** 在文件管理器中显示附加目录文件 */
  showAttachedInFolder: (filePath: string, access?: import('@proma/shared').FileAccessOptions) => Promise<void>

  /** 重命名附加目录文件/目录（无工作区路径限制） */
  renameAttachedFile: (filePath: string, newName: string, access?: import('@proma/shared').FileAccessOptions) => Promise<void>

  /** 移动附加目录文件/目录（无工作区路径限制） */
  moveAttachedFile: (filePath: string, targetDir: string, access?: import('@proma/shared').FileAccessOptions) => Promise<void>

  /** 检查路径类型（文件 or 目录），用于拖拽检测 */
  checkPathsType: (paths: string[]) => Promise<{ directories: string[]; files: string[] }>

  /** 获取拖拽文件的本地路径（替代已废弃的 File.path） */
  getPathForFile: (file: File) => string

  /** 搜索工作区文件（用于 @ 引用，支持附加目录） */
  searchWorkspaceFiles: (rootPath: string, query: string, limit?: number, additionalPaths?: string[], sessionPaths?: string[]) => Promise<FileSearchResult>

  // ===== 系统提示词管理 =====

  /** 获取系统提示词配置 */
  getSystemPromptConfig: () => Promise<SystemPromptConfig>

  /** 创建提示词 */
  createSystemPrompt: (input: SystemPromptCreateInput) => Promise<SystemPrompt>

  /** 更新提示词 */
  updateSystemPrompt: (id: string, input: SystemPromptUpdateInput) => Promise<SystemPrompt>

  /** 删除提示词 */
  deleteSystemPrompt: (id: string) => Promise<void>

  /** 更新追加日期时间和用户名开关 */
  updateAppendSetting: (enabled: boolean) => Promise<void>

  /** 设置默认提示词 */
  setDefaultPrompt: (id: string | null) => Promise<void>

  // ===== 自动更新 =====

  /** 更新 API */
  updater?: {
    checkForUpdates: (opts?: { silent?: boolean }) => Promise<void>
    getStatus: () => Promise<{
      status: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'not-available' | 'error'
      version?: string
      releaseNotes?: string
      progress?: { percent: number; transferred: number; total: number; bytesPerSecond: number }
      error?: string
      hint?: string
      forceUpdate?: boolean
      releaseType?: 'UPGRADE' | 'ROLLBACK'
      downloadUrl?: string
    }>
    onStatusChanged: (callback: (status: {
      status: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'not-available' | 'error'
      version?: string
      releaseNotes?: string
      progress?: { percent: number; transferred: number; total: number; bytesPerSecond: number }
      error?: string
      hint?: string
      forceUpdate?: boolean
      releaseType?: 'UPGRADE' | 'ROLLBACK'
      downloadUrl?: string
    }) => void) => () => void
    quitAndInstall: () => Promise<void>
  }

  // GitHub Release
  getLatestRelease: () => Promise<GitHubRelease | null>
  listReleases: (options?: GitHubReleaseListOptions) => Promise<GitHubRelease[]>
  getReleaseByTag: (tag: string) => Promise<GitHubRelease | null>

  // 工作区文件变化通知
  onCapabilitiesChanged: (callback: () => void) => () => void
  onWorkspaceFilesChanged: (callback: () => void) => () => void

  // ===== 飞书集成 =====

  /** 获取飞书配置 */
  getFeishuConfig: () => Promise<FeishuConfig>
  /** 获取解密后的 App Secret */
  getDecryptedFeishuSecret: () => Promise<string>
  /** 保存飞书配置（appSecret 为明文） */
  saveFeishuConfig: (input: FeishuConfigInput) => Promise<FeishuConfig>
  /** 测试飞书连接 */
  testFeishuConnection: (appId: string, appSecret: string) => Promise<FeishuTestResult>
  /** 启动飞书 Bridge */
  startFeishuBridge: () => Promise<void>
  /** 停止飞书 Bridge */
  stopFeishuBridge: () => Promise<void>
  /** 获取飞书 Bridge 状态 */
  getFeishuStatus: () => Promise<FeishuBridgeState>
  /** 获取活跃绑定列表 */
  listFeishuBindings: () => Promise<FeishuChatBinding[]>
  /** 更新绑定（修改工作区/会话） */
  updateFeishuBinding: (input: FeishuUpdateBindingInput) => Promise<FeishuChatBinding | null>
  /** 移除绑定 */
  removeFeishuBinding: (chatId: string) => Promise<boolean>
  /** 上报用户在场状态 */
  reportFeishuPresence: (report: FeishuPresenceReport) => Promise<void>
  /** 订阅飞书 Bridge 状态变化 */
  onFeishuStatusChanged: (callback: (state: FeishuBridgeState) => void) => () => void

  // --- 多 Bot v2 API ---

  /** 获取多 Bot 配置 */
  getFeishuMultiConfig: () => Promise<import('@proma/shared').FeishuMultiBotConfig>
  /** 保存单个 Bot 配置 */
  saveFeishuBotConfig: (input: import('@proma/shared').FeishuBotConfigInput) => Promise<import('@proma/shared').FeishuBotConfig>
  /** 获取单个 Bot 解密后的 App Secret */
  getDecryptedFeishuBotSecret: (botId: string) => Promise<string>
  /** 删除 Bot */
  removeFeishuBot: (botId: string) => Promise<boolean>
  /** 启动单个 Bot */
  startFeishuBot: (botId: string) => Promise<void>
  /** 停止单个 Bot */
  stopFeishuBot: (botId: string) => Promise<void>
  /** 获取多 Bot 状态 */
  getFeishuMultiStatus: () => Promise<import('@proma/shared').FeishuMultiBridgeState>

  // --- 扫码注册 ---

  /** 启动扫码注册流程，等待用户扫码 + 飞书确认后返回 App ID/Secret */
  registerFeishuApp: () => Promise<import('@proma/shared').FeishuRegisterAppResult>
  /** 取消正在进行的扫码注册流程 */
  cancelFeishuRegistration: () => Promise<void>
  /** 监听二维码 URL 生成 */
  onFeishuRegisterQrcode: (callback: (payload: import('@proma/shared').FeishuRegisterAppQRCode) => void) => () => void
  /** 监听注册流程状态变化 */
  onFeishuRegisterStatus: (callback: (payload: import('@proma/shared').FeishuRegisterAppStatus) => void) => () => void

  // ===== 钉钉集成 =====

  /** 获取钉钉配置 */
  getDingTalkConfig: () => Promise<DingTalkConfig>
  /** 获取解密后的 Client Secret */
  getDecryptedDingTalkSecret: () => Promise<string>
  /** 保存钉钉配置（clientSecret 为明文） */
  saveDingTalkConfig: (input: DingTalkConfigInput) => Promise<DingTalkConfig>
  /** 测试钉钉连接 */
  testDingTalkConnection: (clientId: string, clientSecret: string) => Promise<DingTalkTestResult>
  /** 启动钉钉 Bridge */
  startDingTalkBridge: () => Promise<void>
  /** 停止钉钉 Bridge */
  stopDingTalkBridge: () => Promise<void>
  /** 获取钉钉 Bridge 状态 */
  getDingTalkStatus: () => Promise<DingTalkBridgeState>
  /** 订阅钉钉 Bridge 状态变化 */
  onDingTalkStatusChanged: (callback: (state: DingTalkBridgeState) => void) => () => void

  // --- 钉钉多 Bot v2 API ---

  /** 获取多 Bot 配置 */
  getDingTalkMultiConfig: () => Promise<import('@proma/shared').DingTalkMultiBotConfig>
  /** 保存单个 Bot 配置 */
  saveDingTalkBotConfig: (input: import('@proma/shared').DingTalkBotConfigInput) => Promise<import('@proma/shared').DingTalkBotConfig>
  /** 获取单个 Bot 解密后的 Client Secret */
  getDecryptedDingTalkBotSecret: (botId: string) => Promise<string>
  /** 删除 Bot */
  removeDingTalkBot: (botId: string) => Promise<boolean>
  /** 启动单个 Bot */
  startDingTalkBot: (botId: string) => Promise<void>
  /** 停止单个 Bot */
  stopDingTalkBot: (botId: string) => Promise<void>
  /** 获取多 Bot 状态 */
  getDingTalkMultiStatus: () => Promise<import('@proma/shared').DingTalkMultiBridgeState>

  // ===== 微信集成 =====

  /** 获取微信配置 */
  getWeChatConfig: () => Promise<WeChatConfig>
  /** 开始扫码登录 */
  startWeChatLogin: () => Promise<void>
  /** 登出微信 */
  logoutWeChat: () => Promise<void>
  /** 启动微信 Bridge（用已有凭证） */
  startWeChatBridge: () => Promise<void>
  /** 停止微信 Bridge */
  stopWeChatBridge: () => Promise<void>
  /** 获取微信 Bridge 状态 */
  getWeChatStatus: () => Promise<WeChatBridgeState>
  /** 订阅微信 Bridge 状态变化 */
  onWeChatStatusChanged: (callback: (state: WeChatBridgeState) => void) => () => void

  /** 订阅菜单关闭标签页事件（Cmd+W 被菜单拦截后转发） */
  onMenuCloseTab: (callback: () => void) => () => void

  // ===== 快速任务窗口 =====

  /** 提交快速任务 */
  submitQuickTask: (input: QuickTaskSubmitInput) => Promise<void>
  /** 隐藏快速任务窗口 */
  hideQuickTask: () => Promise<void>
  /** 重新注册全局快捷键（设置变更后） */
  reregisterGlobalShortcuts: () => Promise<Record<string, boolean>>
  /** 订阅快速任务窗口聚焦事件 */
  onQuickTaskFocus: (callback: () => void) => () => void
  /** 订阅快速任务打开会话事件（主窗口接收，由渲染进程负责创建会话） */
  onQuickTaskOpenSession: (callback: (data: QuickTaskOpenSessionData) => void) => () => void

  // ===== 语音输入 =====

  /** 获取语音输入设置 */
  getVoiceDictationSettings: () => Promise<VoiceDictationSettings>
  /** 更新语音输入设置 */
  updateVoiceDictationSettings: (updates: VoiceDictationSettingsUpdate) => Promise<VoiceDictationSettings>
  /** 测试语音输入连接 */
  testVoiceDictationConnection: (updates?: VoiceDictationSettingsUpdate) => Promise<VoiceDictationTestResult>
  /** 唤起或停止语音输入浮窗 */
  toggleVoiceDictation: () => Promise<void>
  /** 开始语音输入会话 */
  startVoiceDictation: (input: VoiceDictationStartInput) => Promise<void>
  /** 发送语音音频分片 */
  sendVoiceDictationAudio: (input: VoiceDictationAudioChunkInput) => Promise<void>
  /** 停止语音输入会话 */
  stopVoiceDictation: (input: VoiceDictationStopInput) => Promise<void>
  /** 取消语音输入会话 */
  cancelVoiceDictation: (input: VoiceDictationStopInput) => Promise<void>
  /** 输出最终语音文本 */
  commitVoiceDictation: (input: VoiceDictationCommitInput) => Promise<VoiceDictationCommitResult>
  /** 隐藏语音输入窗口 */
  hideVoiceDictation: () => Promise<void>
  /** 调整语音输入窗口高度 */
  resizeVoiceDictation: (input: VoiceDictationResizeInput) => Promise<void>
  /** 订阅语音输入窗口显示事件 */
  onVoiceDictationShown: (callback: () => void) => () => void
  /** 订阅语音输入停止请求事件 */
  onVoiceDictationToggleStop: (callback: () => void) => () => void
  /** 订阅语音输入转写事件 */
  onVoiceDictationTranscript: (callback: (event: VoiceDictationTranscriptEvent) => void) => () => void
  /** 订阅语音输入状态事件 */
  onVoiceDictationState: (callback: (event: VoiceDictationStateEvent) => void) => () => void
  /** 订阅主窗口插入语音文本事件 */
  onVoiceDictationInsertText: (callback: (data: { text: string }) => void) => () => void

  /** 检查麦克风权限状态 */
  checkMicrophonePermission: () => Promise<MicPermissionResult>
  /** 请求麦克风权限（仅 macOS 有效） */
  requestMicrophonePermission: () => Promise<MicPermissionResult>

  // ===== 菜单栏 =====

  /** 订阅菜单栏打开 Agent 会话事件 */
  onTrayOpenAgentSession: (callback: (data: TrayOpenAgentSessionData) => void) => () => void
  /** 订阅菜单栏创建会话事件 */
  onTrayCreateSession: (callback: (data: TrayCreateSessionData) => void) => () => void

  // ===== 数据迁移 =====

  /** 获取工作区导出预览信息 */
  migrationGetExportPreview: (workspaceId: string) => Promise<unknown>
  /** 获取所有工作区的 Skills/MCP 预览（团队分发模式） */
  migrationGetShareExportPreview: () => Promise<unknown>
  /** 执行导出 */
  migrationExport: (options: unknown) => Promise<MigrationExportResult>
  /** 执行 v2 多工作区导出 */
  migrationExportV2: (options: unknown) => Promise<MigrationExportResult>
  /** 解析导入文件，返回预览信息 */
  migrationParseImportFile: (filePath: string) => Promise<unknown>
  /** 确认导入 */
  migrationConfirmImport: (options: unknown) => Promise<{ success: boolean }>
  /** 打开文件选择对话框（选择 .proma-backup 或 .proma-share） */
  migrationOpenFileDialog: () => Promise<string | null>
  /** 打开文件保存对话框（选择导出路径） */
  migrationSaveFileDialog: (mode: string) => Promise<string | null>
  /** 订阅双击迁移文件触发的导入事件 */
  onMigrationOpenImportFile: (callback: (data: { filePath: string }) => void) => () => void

  // ===== 存储管理 =====

  /** 获取各目录存储统计 */
  getStorageStats: () => Promise<unknown>
  /** 按选项清理存储 */
  cleanupStorage: (options: unknown) => Promise<unknown>
  /** 清理临时文件（快速） */
  cleanupTempStorage: () => Promise<unknown>
  /** 取消迁移导入（清理临时解压目录） */
  migrationCancelImport: (tempDir: string) => Promise<void>

  // ===== 定时任务（Automation）=====
  /** 获取全部定时任务 */
  listAutomations: () => Promise<Automation[]>
  /** 创建定时任务 */
  createAutomation: (input: CreateAutomationInput) => Promise<Automation>
  /** 更新定时任务 */
  updateAutomation: (input: UpdateAutomationInput) => Promise<Automation | undefined>
  /** 删除定时任务 */
  deleteAutomation: (id: string) => Promise<boolean>
  /** 切换启用/暂停 */
  toggleAutomation: (id: string, active: boolean) => Promise<Automation | undefined>
  /** 立即运行一次 */
  runAutomationNow: (id: string) => Promise<void>
  /** 订阅任务列表变更事件 */
  onAutomationChanged: (callback: () => void) => () => void
}

interface MigrationExportResult {
  success: boolean
  filePath: string
  warnings?: string[]
}

/**
 * 实现 ElectronAPI 接口
 */
const electronAPI: ElectronAPI = {
  // 运行时
  getRuntimeStatus: () => {
    return ipcRenderer.invoke(IPC_CHANNELS.GET_RUNTIME_STATUS)
  },

  reinitRuntime: () => {
    return ipcRenderer.invoke(IPC_CHANNELS.REINIT_RUNTIME)
  },

  onRuntimeStatusUpdated: (callback: (status: RuntimeStatus) => void) => {
    const listener = (_: unknown, status: RuntimeStatus): void => callback(status)
    ipcRenderer.on(IPC_CHANNELS.RUNTIME_STATUS_UPDATED, listener)
    return () => { ipcRenderer.removeListener(IPC_CHANNELS.RUNTIME_STATUS_UPDATED, listener) }
  },

  getGitRepoStatus: (dirPath: string) => {
    return ipcRenderer.invoke(IPC_CHANNELS.GET_GIT_REPO_STATUS, dirPath)
  },

  getUnstagedChanges: (dirPath: string, sessionPath?: string, workspaceFilesPath?: string, extraPaths?: string[], sessionId?: string) => {
    return ipcRenderer.invoke(IPC_CHANNELS.GET_UNSTAGED_CHANGES, dirPath, sessionPath, workspaceFilesPath, extraPaths, sessionId)
  },

  getFileDiff: (input: import('@proma/shared').GetFileDiffInput) => {
    return ipcRenderer.invoke(IPC_CHANNELS.GET_FILE_DIFF, input)
  },

  getUntrackedContent: (input: import('@proma/shared').GetFileDiffInput) => {
    return ipcRenderer.invoke(IPC_CHANNELS.GET_UNTRACKED_CONTENT, input)
  },

  revertFile: (input: import('@proma/shared').RevertFileInput) => {
    return ipcRenderer.invoke(IPC_CHANNELS.REVERT_FILE, input)
  },

  getDiffContents: (input: import('@proma/shared').GetFileDiffInput) => {
    return ipcRenderer.invoke(IPC_CHANNELS.GET_DIFF_CONTENTS, input)
  },

  listWorktrees: (repoPath: string, sessionId: string) => {
    return ipcRenderer.invoke(IPC_CHANNELS.LIST_WORKTREES, repoPath, sessionId)
  },

  getWorktreeChanges: (worktreePath: string, baseBranch: string, sessionId: string) => {
    return ipcRenderer.invoke(IPC_CHANNELS.GET_WORKTREE_CHANGES, worktreePath, baseBranch, sessionId)
  },

  openDetachedPreview: (input: DetachedPreviewWindowInput) => {
    return ipcRenderer.invoke(IPC_CHANNELS.OPEN_DETACHED_PREVIEW, input) as Promise<string | null>
  },

  getDetachedPreviewData: (previewId: string) => {
    return ipcRenderer.invoke(IPC_CHANNELS.GET_DETACHED_PREVIEW_DATA, previewId) as Promise<DetachedPreviewWindowData | null>
  },

  // 通用工具
  openExternal: (url: string) => {
    return ipcRenderer.invoke(IPC_CHANNELS.OPEN_EXTERNAL, url)
  },

  readSystemLog: (input: SystemLogReadInput) => {
    return ipcRenderer.invoke(SYSTEM_LOG_IPC_CHANNELS.READ, input)
  },

  openSystemLogDir: () => {
    return ipcRenderer.invoke(SYSTEM_LOG_IPC_CHANNELS.OPEN_DIR)
  },

  uploadSystemLog: () => {
    return ipcRenderer.invoke('system-log:upload')
  },

  submitIssue: (input) => {
    return ipcRenderer.invoke('issue:submit', input)
  },

  // 窗口控制
  windowMinimize: () => {
    return ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MINIMIZE)
  },

  windowMaximize: () => {
    return ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MAXIMIZE)
  },

  windowClose: () => {
    return ipcRenderer.invoke(IPC_CHANNELS.WINDOW_CLOSE)
  },

  windowIsMaximized: () => {
    return ipcRenderer.invoke(IPC_CHANNELS.WINDOW_IS_MAXIMIZED)
  },

  onWindowResize: (callback: () => void) => {
    const handler = (): void => callback()
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  },

  // 渠道管理
  listChannels: () => {
    return ipcRenderer.invoke(CHANNEL_IPC_CHANNELS.LIST)
  },

  createChannel: (input: ChannelCreateInput) => {
    return ipcRenderer.invoke(CHANNEL_IPC_CHANNELS.CREATE, input)
  },

  updateChannel: (id: string, input: ChannelUpdateInput) => {
    return ipcRenderer.invoke(CHANNEL_IPC_CHANNELS.UPDATE, id, input)
  },

  deleteChannel: (id: string) => {
    return ipcRenderer.invoke(CHANNEL_IPC_CHANNELS.DELETE, id)
  },

  decryptApiKey: (channelId: string) => {
    return ipcRenderer.invoke(CHANNEL_IPC_CHANNELS.DECRYPT_KEY, channelId)
  },

  testChannel: (channelId: string) => {
    return ipcRenderer.invoke(CHANNEL_IPC_CHANNELS.TEST, channelId)
  },

  testChannelDirect: (input: FetchModelsInput) => {
    return ipcRenderer.invoke(CHANNEL_IPC_CHANNELS.TEST_DIRECT, input)
  },

  testChannelModelDirect: (input: ChannelModelTestInput) => {
    return ipcRenderer.invoke(CHANNEL_IPC_CHANNELS.TEST_MODEL_DIRECT, input)
  },

  fetchModels: (input: FetchModelsInput) => {
    return ipcRenderer.invoke(CHANNEL_IPC_CHANNELS.FETCH_MODELS, input)
  },

  // 对话管理
  listConversations: () => {
    return ipcRenderer.invoke(CHAT_IPC_CHANNELS.LIST_CONVERSATIONS)
  },

  createConversation: (title?: string, modelId?: string, channelId?: string) => {
    return ipcRenderer.invoke(CHAT_IPC_CHANNELS.CREATE_CONVERSATION, title, modelId, channelId)
  },

  getConversationMessages: (id: string) => {
    return ipcRenderer.invoke(CHAT_IPC_CHANNELS.GET_MESSAGES, id)
  },

  getRecentMessages: (id: string, limit: number) => {
    return ipcRenderer.invoke(CHAT_IPC_CHANNELS.GET_RECENT_MESSAGES, id, limit)
  },

  updateConversationTitle: (id: string, title: string) => {
    return ipcRenderer.invoke(CHAT_IPC_CHANNELS.UPDATE_TITLE, id, title)
  },

  updateConversationModel: (id: string, modelId: string, channelId: string) => {
    return ipcRenderer.invoke(CHAT_IPC_CHANNELS.UPDATE_MODEL, id, modelId, channelId)
  },

  deleteConversation: (id: string) => {
    return ipcRenderer.invoke(CHAT_IPC_CHANNELS.DELETE_CONVERSATION, id)
  },

  togglePinConversation: (id: string) => {
    return ipcRenderer.invoke(CHAT_IPC_CHANNELS.TOGGLE_PIN, id)
  },

  toggleArchiveConversation: (id: string) => {
    return ipcRenderer.invoke(CHAT_IPC_CHANNELS.TOGGLE_ARCHIVE, id)
  },

  searchConversationMessages: (query: string) => {
    return ipcRenderer.invoke(CHAT_IPC_CHANNELS.SEARCH_MESSAGES, query)
  },

  // 教程
  getTutorialContent: () => {
    return ipcRenderer.invoke(CHAT_IPC_CHANNELS.GET_TUTORIAL_CONTENT)
  },

  createWelcomeConversation: () => {
    return ipcRenderer.invoke(CHAT_IPC_CHANNELS.CREATE_WELCOME_CONVERSATION)
  },

  // 使用手册
  manual: {
    checkAndGet: () => {
      return ipcRenderer.invoke('manual:check-and-get')
    },
    openHtmlManual: () => {
      return ipcRenderer.invoke('manual:open-html')
    },
  },

  // 消息发送
  sendMessage: (input: ChatSendInput) => {
    return ipcRenderer.invoke(CHAT_IPC_CHANNELS.SEND_MESSAGE, input)
  },

  stopGeneration: (conversationId: string) => {
    return ipcRenderer.invoke(CHAT_IPC_CHANNELS.STOP_GENERATION, conversationId)
  },

  deleteMessage: (conversationId: string, messageId: string) => {
    return ipcRenderer.invoke(CHAT_IPC_CHANNELS.DELETE_MESSAGE, conversationId, messageId)
  },

  truncateMessagesFrom: (
    conversationId: string,
    messageId: string,
    preserveFirstMessageAttachments = false,
  ) => {
    return ipcRenderer.invoke(
      CHAT_IPC_CHANNELS.TRUNCATE_MESSAGES_FROM,
      conversationId,
      messageId,
      preserveFirstMessageAttachments,
    )
  },

  updateContextDividers: (conversationId: string, dividers: string[]) => {
    return ipcRenderer.invoke(CHAT_IPC_CHANNELS.UPDATE_CONTEXT_DIVIDERS, conversationId, dividers)
  },

  generateTitle: (input: GenerateTitleInput) => {
    return ipcRenderer.invoke(CHAT_IPC_CHANNELS.GENERATE_TITLE, input)
  },

  // 附件管理
  saveAttachment: (input: AttachmentSaveInput) => {
    return ipcRenderer.invoke(CHAT_IPC_CHANNELS.SAVE_ATTACHMENT, input)
  },

  readAttachment: (localPath: string) => {
    return ipcRenderer.invoke(CHAT_IPC_CHANNELS.READ_ATTACHMENT, localPath)
  },

  saveImageAs: (localPath: string, defaultFilename: string) => {
    return ipcRenderer.invoke(CHAT_IPC_CHANNELS.SAVE_IMAGE_AS, localPath, defaultFilename)
  },

  saveResourceFileAs: (resourceRelativePath: string, defaultFilename: string) => {
    return ipcRenderer.invoke(CHAT_IPC_CHANNELS.SAVE_RESOURCE_FILE_AS, resourceRelativePath, defaultFilename)
  },

  deleteAttachment: (localPath: string) => {
    return ipcRenderer.invoke(CHAT_IPC_CHANNELS.DELETE_ATTACHMENT, localPath)
  },

  openFileDialog: () => {
    return ipcRenderer.invoke(CHAT_IPC_CHANNELS.OPEN_FILE_DIALOG)
  },

  extractAttachmentText: (localPath: string) => {
    return ipcRenderer.invoke(CHAT_IPC_CHANNELS.EXTRACT_ATTACHMENT_TEXT, localPath)
  },

  // 用户档案
  getUserProfile: () => {
    return ipcRenderer.invoke(USER_PROFILE_IPC_CHANNELS.GET)
  },

  updateUserProfile: (updates: Partial<UserProfile>) => {
    return ipcRenderer.invoke(USER_PROFILE_IPC_CHANNELS.UPDATE, updates)
  },

  // 应用设置
  getSettings: () => {
    return ipcRenderer.invoke(SETTINGS_IPC_CHANNELS.GET)
  },

  updateSettings: (updates: Partial<AppSettings>) => {
    return ipcRenderer.invoke(SETTINGS_IPC_CHANNELS.UPDATE, updates)
  },

  updateSettingsSync: (updates: Partial<AppSettings>) => {
    return ipcRenderer.sendSync(SETTINGS_IPC_CHANNELS.UPDATE_SYNC, updates)
  },

  getConfigRootInfo: () => {
    return ipcRenderer.invoke(SETTINGS_IPC_CHANNELS.GET_CONFIG_ROOT)
  },

  chooseConfigRoot: () => {
    return ipcRenderer.invoke(SETTINGS_IPC_CHANNELS.CHOOSE_CONFIG_ROOT)
  },

  setConfigRoot: (dirPath: string) => {
    return ipcRenderer.invoke(SETTINGS_IPC_CHANNELS.SET_CONFIG_ROOT, dirPath)
  },

  resetConfigRoot: () => {
    return ipcRenderer.invoke(SETTINGS_IPC_CHANNELS.RESET_CONFIG_ROOT)
  },

  relaunchApp: () => {
    return ipcRenderer.invoke(SETTINGS_IPC_CHANNELS.RELAUNCH_APP)
  },

  getSystemTheme: () => {
    return ipcRenderer.invoke(SETTINGS_IPC_CHANNELS.GET_SYSTEM_THEME)
  },

  getLocalApiSettings: () => {
    return ipcRenderer.invoke(LOCAL_API_IPC_CHANNELS.GET_SETTINGS)
  },

  updateLocalApiSettings: (updates: Partial<LocalApiSettings>) => {
    return ipcRenderer.invoke(LOCAL_API_IPC_CHANNELS.UPDATE_SETTINGS, updates)
  },

  resetLocalApiToken: () => {
    return ipcRenderer.invoke(LOCAL_API_IPC_CHANNELS.RESET_TOKEN)
  },

  getLocalApiStatus: () => {
    return ipcRenderer.invoke(LOCAL_API_IPC_CHANNELS.GET_STATUS)
  },

  onSystemThemeChanged: (callback: (isDark: boolean) => void) => {
    const listener = (_: unknown, isDark: boolean): void => callback(isDark)
    ipcRenderer.on(SETTINGS_IPC_CHANNELS.ON_SYSTEM_THEME_CHANGED, listener)
    return () => { ipcRenderer.removeListener(SETTINGS_IPC_CHANNELS.ON_SYSTEM_THEME_CHANGED, listener) }
  },

  onThemeSettingsChanged: (callback: (payload: { themeMode: string; themeStyle: string }) => void) => {
    const listener = (_: unknown, payload: { themeMode: string; themeStyle: string }): void => callback(payload)
    ipcRenderer.on(SETTINGS_IPC_CHANNELS.ON_THEME_SETTINGS_CHANGED, listener)
    return () => { ipcRenderer.removeListener(SETTINGS_IPC_CHANNELS.ON_THEME_SETTINGS_CHANGED, listener) }
  },

  // Scratch Pad 持久化
  loadScratchPad: () => {
    return ipcRenderer.invoke(SCRATCH_PAD_IPC_CHANNELS.LOAD)
  },

  saveScratchPad: (content: string) => {
    return ipcRenderer.invoke(SCRATCH_PAD_IPC_CHANNELS.SAVE, content)
  },

  saveScratchPadSync: (content: string) => {
    return ipcRenderer.sendSync(SCRATCH_PAD_IPC_CHANNELS.SAVE_SYNC, content)
  },

  exportScratchPad: (markdown: string, dirPath: string, filename: string) => {
    return ipcRenderer.invoke(SCRATCH_PAD_IPC_CHANNELS.EXPORT, markdown, dirPath, filename)
  },

  chooseExportPath: (defaultName: string) => {
    return ipcRenderer.invoke(SCRATCH_PAD_IPC_CHANNELS.CHOOSE_EXPORT_PATH, defaultName)
  },

  // 应用图标切换
  setAppIcon: (variantId: string) => {
    return ipcRenderer.invoke(APP_ICON_IPC_CHANNELS.SET, variantId)
  },

  // Dock/Launcher 角标
  setDockBadgeCount: (count: number) => {
    return ipcRenderer.invoke(DOCK_BADGE_IPC_CHANNELS.SET_COUNT, count)
  },

  // 环境检测
  checkEnvironment: () => {
    return ipcRenderer.invoke(ENVIRONMENT_IPC_CHANNELS.CHECK)
  },

  // 第三方安装包（Git / Node.js）
  fetchInstallerManifest: () => {
    return ipcRenderer.invoke(INSTALLER_IPC_CHANNELS.MANIFEST)
  },
  downloadInstaller: (req: InstallerDownloadRequest) => {
    return ipcRenderer.invoke(INSTALLER_IPC_CHANNELS.DOWNLOAD, req)
  },
  cancelInstallerDownload: (key: string) => {
    return ipcRenderer.invoke(INSTALLER_IPC_CHANNELS.CANCEL, key)
  },
  launchInstaller: (filePath: string) => {
    return ipcRenderer.invoke(INSTALLER_IPC_CHANNELS.LAUNCH, filePath)
  },
  onInstallerProgress: (callback: (payload: InstallerProgressPayload) => void) => {
    const listener = (_: unknown, payload: InstallerProgressPayload) => callback(payload)
    ipcRenderer.on(INSTALLER_IPC_CHANNELS.PROGRESS, listener)
    return () => ipcRenderer.off(INSTALLER_IPC_CHANNELS.PROGRESS, listener)
  },

  // 代理配置
  getProxySettings: () => {
    return ipcRenderer.invoke(PROXY_IPC_CHANNELS.GET_SETTINGS)
  },

  updateProxySettings: (config: ProxyConfig) => {
    return ipcRenderer.invoke(PROXY_IPC_CHANNELS.UPDATE_SETTINGS, config)
  },

  detectSystemProxy: () => {
    return ipcRenderer.invoke(PROXY_IPC_CHANNELS.DETECT_SYSTEM)
  },

  // 流式事件订阅
  onStreamChunk: (callback: (event: StreamChunkEvent) => void) => {
    const listener = (_: unknown, event: StreamChunkEvent): void => callback(event)
    ipcRenderer.on(CHAT_IPC_CHANNELS.STREAM_CHUNK, listener)
    return () => { ipcRenderer.removeListener(CHAT_IPC_CHANNELS.STREAM_CHUNK, listener) }
  },

  onStreamReasoning: (callback: (event: StreamReasoningEvent) => void) => {
    const listener = (_: unknown, event: StreamReasoningEvent): void => callback(event)
    ipcRenderer.on(CHAT_IPC_CHANNELS.STREAM_REASONING, listener)
    return () => { ipcRenderer.removeListener(CHAT_IPC_CHANNELS.STREAM_REASONING, listener) }
  },

  onStreamComplete: (callback: (event: StreamCompleteEvent) => void) => {
    const listener = (_: unknown, event: StreamCompleteEvent): void => callback(event)
    ipcRenderer.on(CHAT_IPC_CHANNELS.STREAM_COMPLETE, listener)
    return () => { ipcRenderer.removeListener(CHAT_IPC_CHANNELS.STREAM_COMPLETE, listener) }
  },

  onStreamError: (callback: (event: StreamErrorEvent) => void) => {
    const listener = (_: unknown, event: StreamErrorEvent): void => callback(event)
    ipcRenderer.on(CHAT_IPC_CHANNELS.STREAM_ERROR, listener)
    return () => { ipcRenderer.removeListener(CHAT_IPC_CHANNELS.STREAM_ERROR, listener) }
  },

  onStreamToolActivity: (callback: (event: StreamToolActivityEvent) => void) => {
    const listener = (_: unknown, event: StreamToolActivityEvent): void => callback(event)
    ipcRenderer.on(CHAT_IPC_CHANNELS.STREAM_TOOL_ACTIVITY, listener)
    return () => { ipcRenderer.removeListener(CHAT_IPC_CHANNELS.STREAM_TOOL_ACTIVITY, listener) }
  },

  // Chat 重试事件
  onStreamRetrying: (callback: (event: StreamRetryEvent) => void) => {
    const listener = (_: unknown, event: StreamRetryEvent): void => callback(event)
    ipcRenderer.on(CHAT_IPC_CHANNELS.STREAM_RETRYING, listener)
    return () => { ipcRenderer.removeListener(CHAT_IPC_CHANNELS.STREAM_RETRYING, listener) }
  },

  onStreamRetryAttempt: (callback: (event: StreamRetryAttemptEvent) => void) => {
    const listener = (_: unknown, event: StreamRetryAttemptEvent): void => callback(event)
    ipcRenderer.on(CHAT_IPC_CHANNELS.STREAM_RETRY_ATTEMPT, listener)
    return () => { ipcRenderer.removeListener(CHAT_IPC_CHANNELS.STREAM_RETRY_ATTEMPT, listener) }
  },

  onStreamRetryCleared: (callback: (event: StreamRetryClearedEvent) => void) => {
    const listener = (_: unknown, event: StreamRetryClearedEvent): void => callback(event)
    ipcRenderer.on(CHAT_IPC_CHANNELS.STREAM_RETRY_CLEARED, listener)
    return () => { ipcRenderer.removeListener(CHAT_IPC_CHANNELS.STREAM_RETRY_CLEARED, listener) }
  },

  onStreamRetryFailed: (callback: (event: StreamRetryFailedEvent) => void) => {
    const listener = (_: unknown, event: StreamRetryFailedEvent): void => callback(event)
    ipcRenderer.on(CHAT_IPC_CHANNELS.STREAM_RETRY_FAILED, listener)
    return () => { ipcRenderer.removeListener(CHAT_IPC_CHANNELS.STREAM_RETRY_FAILED, listener) }
  },

  // Agent 会话管理
  listAgentSessions: () => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.LIST_SESSIONS)
  },

  createAgentSession: (
    title?: string,
    channelId?: string,
    workspaceId?: string,
    expertGroupId?: string,
    expertPluginId?: string,
    expertIntroduction?: string,
  ) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.CREATE_SESSION, title, channelId, workspaceId, expertGroupId, expertPluginId, expertIntroduction)
  },

  getAgentSessionSDKMessages: (id: string) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.GET_SDK_MESSAGES, id)
  },

  updateAgentSessionTitle: (id: string, title: string) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.UPDATE_TITLE, id, title)
  },

  deleteAgentSession: (id: string) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.DELETE_SESSION, id)
  },

  migrateChatToAgent: (conversationId: string, agentSessionId: string) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.MIGRATE_CHAT_TO_AGENT, conversationId, agentSessionId)
  },

  togglePinAgentSession: (id: string) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.TOGGLE_PIN, id)
  },

  clearAgentCompletionState: (id: string) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.CLEAR_COMPLETION_STATE, id)
  },

  toggleArchiveAgentSession: (id: string) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.TOGGLE_ARCHIVE, id)
  },

  searchAgentSessionMessages: (query: string) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.SEARCH_MESSAGES, query)
  },

  searchAgentSessionReferences: (input: AgentSessionReferenceSearchInput) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.SEARCH_SESSION_REFERENCES, input)
  },

  moveAgentSessionToWorkspace: (input: MoveSessionToWorkspaceInput) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.MOVE_SESSION_TO_WORKSPACE, input)
  },

  forkAgentSession: (input: ForkSessionInput) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.FORK_SESSION, input)
  },

  rewindSession: (input: RewindSessionInput) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.REWIND_SESSION, input)
  },

  generateAgentTitle: (input: AgentGenerateTitleInput) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.GENERATE_TITLE, input)
  },

  sendAgentMessage: (input: AgentSendInput) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.SEND_MESSAGE, input)
  },

  stopAgent: (sessionId: string) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.STOP_AGENT, sessionId)
  },

  // Agent 队列消息
  queueAgentMessage: (input: AgentQueueMessageInput) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.QUEUE_MESSAGE, input)
  },

  // Agent 后台任务管理
  getTaskOutput: (input: GetTaskOutputInput) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.GET_TASK_OUTPUT, input)
  },

  stopTask: (input: StopTaskInput) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.STOP_TASK, input)
  },

  // Agent 工作区管理
  listAgentWorkspaces: () => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.LIST_WORKSPACES)
  },

  createAgentWorkspace: (name: string) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.CREATE_WORKSPACE, name)
  },

  updateAgentWorkspace: (id: string, updates: { name: string }) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.UPDATE_WORKSPACE, id, updates)
  },

  deleteAgentWorkspace: (id: string) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.DELETE_WORKSPACE, id)
  },

  reorderAgentWorkspaces: (orderedIds: string[]) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.REORDER_WORKSPACES, orderedIds)
  },

  // 工作区能力（MCP + Skill）
  listAgentSlashCommands: (workspaceSlug: string) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.LIST_SLASH_COMMANDS, workspaceSlug)
  },

  listAgentPlugins: () => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.LIST_PLUGINS)
  },

  setAgentPluginEnabled: (pluginId: string, enabled: boolean) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.SET_PLUGIN_ENABLED, pluginId, enabled)
  },

  uninstallAgentPlugin: (pluginId: string) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.UNINSTALL_PLUGIN, pluginId)
  },

  installAgentPluginZip: () => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.INSTALL_PLUGIN_ZIP)
  },

  listAgentPluginMarketplaces: () => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.LIST_PLUGIN_MARKETPLACES)
  },

  addAgentPluginMarketplace: (input: { id: string; name: string; source: string; type: AgentPluginMarketplaceType; branch?: string; auth?: { type: 'none' | 'token'; token?: string } }) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.ADD_PLUGIN_MARKETPLACE, input)
  },

  updateAgentPluginMarketplace: (id: string, updates: Partial<Omit<AgentPluginMarketplace, 'id' | 'addedAt'>>) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.UPDATE_PLUGIN_MARKETPLACE, id, updates)
  },

  removeAgentPluginMarketplace: (id: string) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.REMOVE_PLUGIN_MARKETPLACE, id)
  },

  refreshAgentPluginMarketplace: (id: string) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.REFRESH_PLUGIN_MARKETPLACE, id)
  },

  searchAgentPluginMarketplace: (query: string) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.SEARCH_PLUGIN_MARKETPLACE, query)
  },

  getAgentPluginMarketplaceDetail: (marketplaceId: string, pluginName: string) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.GET_PLUGIN_MARKETPLACE_DETAIL, marketplaceId, pluginName)
  },

  installAgentMarketplacePlugin: (input: AgentPluginInstallInput) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.INSTALL_MARKETPLACE_PLUGIN, input)
  },

  onAgentPluginInstallProgress: (callback: (progress: AgentPluginInstallProgress) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: AgentPluginInstallProgress) => callback(progress)
    ipcRenderer.on(AGENT_IPC_CHANNELS.PLUGIN_INSTALL_PROGRESS, listener)
    return () => { ipcRenderer.removeListener(AGENT_IPC_CHANNELS.PLUGIN_INSTALL_PROGRESS, listener) }
  },

  getAgentPluginCapabilities: () => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.GET_PLUGIN_CAPABILITIES)
  },

  listAgentExpertGroups: () => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.LIST_EXPERT_GROUPS)
  },

  getAgentExpertGroup: (input: { expertGroupId: string; expertPluginId?: string }) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.GET_EXPERT_GROUP, input)
  },

  configureAgentPluginMcpEnv: (serverId: string, env: Record<string, string>) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.CONFIGURE_PLUGIN_MCP_ENV, serverId, env)
  },

  testAgentPluginMcp: (serverId: string) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.TEST_PLUGIN_MCP, serverId)
  },

  // ===== 专家团服务端化 =====

  fetchServerExpertGroups: () => {
    return ipcRenderer.invoke(EXPERT_IPC_CHANNELS.FETCH_SERVER_EXPERT_GROUPS)
  },

  fetchFeaturedScenes: () => {
    return ipcRenderer.invoke(EXPERT_IPC_CHANNELS.FETCH_FEATURED_SCENES)
  },

  downloadRemoteExpert: (groupId: string) => {
    return ipcRenderer.invoke(EXPERT_IPC_CHANNELS.DOWNLOAD_REMOTE_EXPERT, groupId)
  },

  cancelRemoteDownload: (groupId: string) => {
    return ipcRenderer.invoke(EXPERT_IPC_CHANNELS.CANCEL_DOWNLOAD, groupId)
  },

  fetchServerExpertGroupCategories: () => {
    return ipcRenderer.invoke(EXPERT_IPC_CHANNELS.FETCH_CATEGORIES)
  },

  ensureExpertGroupLatest: (groupId: string, localVersion: string) => {
    return ipcRenderer.invoke(EXPERT_IPC_CHANNELS.ENSURE_LATEST, groupId, localVersion)
  },

  onExpertDownloadProgress: (callback: (progress: RemoteDownloadProgress) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: RemoteDownloadProgress) => callback(progress)
    ipcRenderer.on(EXPERT_IPC_CHANNELS.DOWNLOAD_PROGRESS, listener)
    return () => { ipcRenderer.removeListener(EXPERT_IPC_CHANNELS.DOWNLOAD_PROGRESS, listener) }
  },

  getWorkspaceCapabilities: (workspaceSlug: string) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.GET_CAPABILITIES, workspaceSlug)
  },

  getWorkspaceMcpConfig: (workspaceSlug: string) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.GET_MCP_CONFIG, workspaceSlug)
  },

  saveWorkspaceMcpConfig: (workspaceSlug: string, config: WorkspaceMcpConfig) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.SAVE_MCP_CONFIG, workspaceSlug, config)
  },

  testMcpServer: (name: string, entry: import('@proma/shared').McpServerEntry) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.TEST_MCP_SERVER, name, entry) as Promise<{ success: boolean; message: string }>
  },

  initializeDefaultConnector: (workspaceSlug: string, input: InitializeDefaultConnectorInput) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.INITIALIZE_DEFAULT_CONNECTOR, workspaceSlug, input)
  },

  onConnectorInitProgress: (callback: (event: ConnectorInitProgressEvent) => void) => {
    const listener = (_: unknown, event: ConnectorInitProgressEvent): void => callback(event)
    ipcRenderer.on(AGENT_IPC_CHANNELS.CONNECTOR_INIT_PROGRESS, listener)
    return () => { ipcRenderer.removeListener(AGENT_IPC_CHANNELS.CONNECTOR_INIT_PROGRESS, listener) }
  },

  getFeishuCliAuthStatus: () => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.GET_FEISHU_CLI_AUTH_STATUS)
  },

  registerFeishuCliApp: () => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.REGISTER_FEISHU_APP)
  },
  cancelFeishuCliRegister: () => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.CANCEL_FEISHU_CLI_REGISTER)
  },
  onFeishuCliRegisterQrcode: (callback) => {
    const listener = (_: unknown, payload: { url: string; expireIn: number }) => callback(payload)
    ipcRenderer.on(AGENT_IPC_CHANNELS.FEISHU_CLI_REGISTER_QRCODE, listener)
    return () => { ipcRenderer.removeListener(AGENT_IPC_CHANNELS.FEISHU_CLI_REGISTER_QRCODE, listener) }
  },
  onFeishuCliRegisterStatus: (callback) => {
    const listener = (_: unknown, payload: { status: string; interval?: number }) => callback(payload)
    ipcRenderer.on(AGENT_IPC_CHANNELS.FEISHU_CLI_REGISTER_STATUS, listener)
    return () => { ipcRenderer.removeListener(AGENT_IPC_CHANNELS.FEISHU_CLI_REGISTER_STATUS, listener) }
  },
  startFeishuDeviceAuth: (appId: string, appSecret: string) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.START_FEISHU_DEVICE_AUTH, appId, appSecret)
  },
  pollFeishuDeviceAuth: (appId: string, appSecret: string, deviceCode: string, phase: number) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.POLL_FEISHU_DEVICE_AUTH, appId, appSecret, deviceCode, phase)
  },

  unbindFeishuCli: () => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.UNBIND_FEISHU_CLI)
  },

  getConnectorsConfig: (workspaceSlug: string) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.GET_CONNECTORS_CONFIG, workspaceSlug)
  },

  saveConnectorsConfig: (workspaceSlug: string, config: ConnectorsConfig) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.SAVE_CONNECTORS_CONFIG, workspaceSlug, config)
  },

  registerUserConnector: (workspaceSlug: string, name: string, entry: import('@proma/shared').McpServerEntry, displayName?: string) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.REGISTER_USER_CONNECTOR, workspaceSlug, name, entry, displayName)
  },

  unregisterUserConnector: (workspaceSlug: string, name: string) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.UNREGISTER_USER_CONNECTOR, workspaceSlug, name)
  },

  syncDefaultConnectors: (workspaceSlug: string) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.SYNC_DEFAULT_CONNECTORS, workspaceSlug)
  },

  getWorkspaceSkills: (workspaceSlug: string) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.GET_SKILLS, workspaceSlug)
  },

  getWorkspaceSkillsDir: (workspaceSlug: string) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.GET_SKILLS_DIR, workspaceSlug)
  },

  deleteWorkspaceSkill: (workspaceSlug: string, skillSlug: string) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.DELETE_SKILL, workspaceSlug, skillSlug)
  },

  toggleWorkspaceSkill: (workspaceSlug: string, skillSlug: string, enabled: boolean) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.TOGGLE_SKILL, workspaceSlug, skillSlug, enabled)
  },

  getOtherWorkspaceSkills: (currentSlug: string) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.GET_OTHER_WORKSPACE_SKILLS, currentSlug)
  },

  getDefaultSkillSlugs: () => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.GET_DEFAULT_SKILL_SLUGS)
  },

  importSkillFromWorkspace: (targetSlug: string, sourceSlug: string, skillSlug: string) => {
    return ipcRenderer.invoke(
      AGENT_IPC_CHANNELS.IMPORT_SKILL_FROM_WORKSPACE,
      targetSlug,
      sourceSlug,
      skillSlug,
    )
  },

  installSkillZip: (workspaceSlug: string) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.INSTALL_SKILL_ZIP, workspaceSlug)
  },

  updateSkillFromSource: (targetSlug: string, skillSlug: string) => {
    return ipcRenderer.invoke(
      AGENT_IPC_CHANNELS.UPDATE_SKILL_FROM_SOURCE,
      targetSlug,
      skillSlug,
    )
  },

  readSkillContent: (workspaceSlug: string, skillSlug: string) => {
    return ipcRenderer.invoke(
      AGENT_IPC_CHANNELS.READ_SKILL_CONTENT,
      workspaceSlug,
      skillSlug,
    )
  },

  writeSkillContent: (workspaceSlug: string, skillSlug: string, content: string) => {
    return ipcRenderer.invoke(
      AGENT_IPC_CHANNELS.WRITE_SKILL_CONTENT,
      workspaceSlug,
      skillSlug,
      content,
    )
  },

  listSkillFiles: (workspaceSlug: string, skillSlug: string) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.LIST_SKILL_FILES, workspaceSlug, skillSlug)
  },

  readSkillFile: (workspaceSlug: string, skillSlug: string, relativePath: string) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.READ_SKILL_FILE, workspaceSlug, skillSlug, relativePath)
  },

  writeSkillFile: (workspaceSlug: string, skillSlug: string, relativePath: string, content: string) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.WRITE_SKILL_FILE, workspaceSlug, skillSlug, relativePath, content)
  },

  createSkillEntry: (workspaceSlug: string, skillSlug: string, relativePath: string, type: 'file' | 'directory') => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.CREATE_SKILL_ENTRY, workspaceSlug, skillSlug, relativePath, type)
  },

  deleteSkillEntry: (workspaceSlug: string, skillSlug: string, relativePath: string) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.DELETE_SKILL_ENTRY, workspaceSlug, skillSlug, relativePath)
  },

  renameSkillEntry: (workspaceSlug: string, skillSlug: string, fromRelative: string, toRelative: string) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.RENAME_SKILL_ENTRY, workspaceSlug, skillSlug, fromRelative, toRelative)
  },

  getHtSkillHubSkills: (workspaceSlug: string, page?: number, keyword?: string, category?: string, pageSize?: number) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.GET_HT_SKILLHUB_SKILLS, workspaceSlug, page, keyword, category, pageSize)
  },

  readHtSkillHubSkill: (skillName: string) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.READ_HT_SKILLHUB_SKILL, skillName)
  },

  installHtSkillHubSkill: (workspaceSlug: string, skillName: string, overwrite: boolean) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.INSTALL_HT_SKILLHUB_SKILL, workspaceSlug, skillName, overwrite)
  },

  getSkillHubAuthStatus: () => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.SKILLHUB_AUTH_STATUS)
  },

  skillHubAuthenticate: () => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.SKILLHUB_AUTHENTICATE)
  },

  uninstallHtSkillHubSkill: (workspaceSlug: string, skillName: string) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.UNINSTALL_HT_SKILLHUB_SKILL, workspaceSlug, skillName)
  },

  checkSkillUpdates: (workspaceSlug: string) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.CHECK_SKILL_UPDATES, workspaceSlug)
  },

  batchInstallHtSkillHubSkills: (workspaceSlug: string, skillNames: string[], overwrite?: boolean) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.BATCH_INSTALL_HT_SKILLHUB, workspaceSlug, skillNames, overwrite)
  },

  batchUninstallHtSkillHubSkills: (workspaceSlug: string, skillNames: string[]) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.BATCH_UNINSTALL_HT_SKILLHUB, workspaceSlug, skillNames)
  },

  onAgentStreamEvent: (callback: (event: AgentStreamEvent) => void) => {
    const listener = (_: unknown, event: AgentStreamEvent): void => callback(event)
    ipcRenderer.on(AGENT_IPC_CHANNELS.STREAM_EVENT, listener)
    return () => { ipcRenderer.removeListener(AGENT_IPC_CHANNELS.STREAM_EVENT, listener) }
  },

  onAgentStreamComplete: (callback: (data: AgentStreamCompletePayload) => void) => {
    const listener = (_: unknown, data: AgentStreamCompletePayload): void => callback(data)
    ipcRenderer.on(AGENT_IPC_CHANNELS.STREAM_COMPLETE, listener)
    return () => { ipcRenderer.removeListener(AGENT_IPC_CHANNELS.STREAM_COMPLETE, listener) }
  },

  onAgentStreamError: (callback: (data: { sessionId: string; error: string }) => void) => {
    const listener = (_: unknown, data: { sessionId: string; error: string }): void => callback(data)
    ipcRenderer.on(AGENT_IPC_CHANNELS.STREAM_ERROR, listener)
    return () => { ipcRenderer.removeListener(AGENT_IPC_CHANNELS.STREAM_ERROR, listener) }
  },

  // 标题自动更新通知
  onAgentTitleUpdated: (callback: (data: { sessionId: string; title: string }) => void) => {
    const listener = (_: unknown, data: { sessionId: string; title: string }): void => callback(data)
    ipcRenderer.on(AGENT_IPC_CHANNELS.TITLE_UPDATED, listener)
    return () => { ipcRenderer.removeListener(AGENT_IPC_CHANNELS.TITLE_UPDATED, listener) }
  },

  // Agent 权限系统
  respondPermission: (response: PermissionResponse) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.PERMISSION_RESPOND, response)
  },

  updateSessionPermissionMode: (sessionId: string, mode: PromaPermissionMode) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.UPDATE_SESSION_PERMISSION_MODE, sessionId, mode)
  },

  getMemoryConfig: () => {
    return ipcRenderer.invoke(MEMORY_IPC_CHANNELS.GET_CONFIG)
  },

  setMemoryConfig: (config: MemoryConfig) => {
    return ipcRenderer.invoke(MEMORY_IPC_CHANNELS.SET_CONFIG, config)
  },

  testMemoryConnection: () => {
    return ipcRenderer.invoke(MEMORY_IPC_CHANNELS.TEST_CONNECTION)
  },

  createMemoryCube: () => {
    return ipcRenderer.invoke(MEMORY_IPC_CHANNELS.CREATE_CUBE)
  },

  queryMemoryCube: () => {
    return ipcRenderer.invoke(MEMORY_IPC_CHANNELS.QUERY_CUBE)
  },

  // Chat 工具管理
  getChatTools: () => {
    return ipcRenderer.invoke(CHAT_TOOL_IPC_CHANNELS.GET_ALL_TOOLS)
  },

  getChatToolCredentials: (toolId: string) => {
    return ipcRenderer.invoke(CHAT_TOOL_IPC_CHANNELS.GET_TOOL_CREDENTIALS, toolId)
  },

  updateChatToolState: (toolId: string, state: ChatToolState) => {
    return ipcRenderer.invoke(CHAT_TOOL_IPC_CHANNELS.UPDATE_TOOL_STATE, toolId, state)
  },

  updateChatToolCredentials: (toolId: string, credentials: Record<string, string>) => {
    return ipcRenderer.invoke(CHAT_TOOL_IPC_CHANNELS.UPDATE_TOOL_CREDENTIALS, toolId, credentials)
  },

  createCustomChatTool: (meta: ChatToolMeta) => {
    return ipcRenderer.invoke(CHAT_TOOL_IPC_CHANNELS.CREATE_CUSTOM_TOOL, meta)
  },

  deleteCustomChatTool: (toolId: string) => {
    return ipcRenderer.invoke(CHAT_TOOL_IPC_CHANNELS.DELETE_CUSTOM_TOOL, toolId)
  },

  onCustomToolChanged: (callback: () => void) => {
    const listener = (): void => callback()
    ipcRenderer.on(CHAT_TOOL_IPC_CHANNELS.CUSTOM_TOOL_CHANGED, listener)
    return () => { ipcRenderer.removeListener(CHAT_TOOL_IPC_CHANNELS.CUSTOM_TOOL_CHANGED, listener) }
  },

  testChatTool: (toolId: string, options?: { query?: string; timeRange?: 'OneDay' | 'OneWeek' | 'OneMonth' | 'OneYear' }) => {
    return ipcRenderer.invoke(CHAT_TOOL_IPC_CHANNELS.TEST_TOOL, toolId, options)
  },

  // AskUserQuestion 交互式问答
  respondAskUser: (response: AskUserResponse) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.ASK_USER_RESPOND, response)
  },

  // ExitPlanMode 计划审批
  respondExitPlanMode: (response: ExitPlanModeResponse) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.EXIT_PLAN_MODE_RESPOND, response)
  },

  // 待处理请求恢复
  getPendingRequests: () => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.GET_PENDING_REQUESTS)
  },

  // 工作区文件变化通知
  onCapabilitiesChanged: (callback: () => void) => {
    const listener = (): void => callback()
    ipcRenderer.on(AGENT_IPC_CHANNELS.CAPABILITIES_CHANGED, listener)
    return () => { ipcRenderer.removeListener(AGENT_IPC_CHANNELS.CAPABILITIES_CHANGED, listener) }
  },

  onWorkspaceFilesChanged: (callback: () => void) => {
    const listener = (): void => callback()
    ipcRenderer.on(AGENT_IPC_CHANNELS.WORKSPACE_FILES_CHANGED, listener)
    return () => { ipcRenderer.removeListener(AGENT_IPC_CHANNELS.WORKSPACE_FILES_CHANGED, listener) }
  },

  // Agent 附件
  saveFilesToAgentSession: (input: AgentSaveFilesInput) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.SAVE_FILES_TO_SESSION, input)
  },

  saveFilesToWorkspaceFiles: (input: AgentSaveWorkspaceFilesInput) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.SAVE_FILES_TO_WORKSPACE, input)
  },

  copyExternalPathsIntoManagedDir: (input: AgentCopyExternalPathsInput) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.COPY_EXTERNAL_PATHS, input)
  },

  getWorkspaceFilesPath: (workspaceSlug: string) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.GET_WORKSPACE_FILES_PATH, workspaceSlug)
  },

  openFolderDialog: () => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.OPEN_FOLDER_DIALOG)
  },

  attachDirectory: (input: AgentAttachDirectoryInput) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.ATTACH_DIRECTORY, input)
  },

  detachDirectory: (input: AgentAttachDirectoryInput) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.DETACH_DIRECTORY, input)
  },

  attachFile: (input: AgentAttachFileInput) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.ATTACH_FILE, input)
  },

  detachFile: (input: AgentAttachFileInput) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.DETACH_FILE, input)
  },

  attachWorkspaceDirectory: (input: WorkspaceAttachDirectoryInput) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.ATTACH_WORKSPACE_DIRECTORY, input)
  },

  detachWorkspaceDirectory: (input: WorkspaceAttachDirectoryInput) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.DETACH_WORKSPACE_DIRECTORY, input)
  },

  attachWorkspaceFile: (input: WorkspaceAttachFileInput) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.ATTACH_WORKSPACE_FILE, input)
  },

  detachWorkspaceFile: (input: WorkspaceAttachFileInput) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.DETACH_WORKSPACE_FILE, input)
  },

  getWorkspaceDirectories: (workspaceSlug: string) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.GET_WORKSPACE_DIRECTORIES, workspaceSlug)
  },

  getWorkspaceAttachedFiles: (workspaceSlug: string) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.GET_WORKSPACE_ATTACHED_FILES, workspaceSlug)
  },

  getWorktreeRepos: (workspaceSlug: string) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.GET_WORKTREE_REPOS, workspaceSlug)
  },

  addWorktreeRepo: (workspaceSlug: string, repo: import('@proma/shared').WorkspaceWorktreeRepo) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.ADD_WORKTREE_REPO, workspaceSlug, repo)
  },

  removeWorktreeRepo: (workspaceSlug: string, repoPath: string) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.REMOVE_WORKTREE_REPO, workspaceSlug, repoPath)
  },

  // Agent 文件系统操作
  getAgentSessionPath: (workspaceId: string, sessionId: string) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.GET_SESSION_PATH, workspaceId, sessionId)
  },

  listDirectory: (dirPath: string) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.LIST_DIRECTORY, dirPath)
  },

  createFileEntry: (input: CreateFileEntryInput) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.CREATE_FILE_ENTRY, input)
  },

  deleteFile: (filePath: string) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.DELETE_FILE, filePath)
  },

  openFile: (filePath: string) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.OPEN_FILE, filePath)
  },

  writeClipboardPreview: (filename: string, content: string) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.WRITE_CLIPBOARD_PREVIEW, filename, content)
  },

  systemOpenFile: (filePath: string, appName?: string, access?: import('@proma/shared').FileAccessOptions) => {
    return ipcRenderer.invoke(IPC_CHANNELS.SYSTEM_OPEN_FILE, filePath, appName, access)
  },

  scanEditors: () => {
    return ipcRenderer.invoke(IPC_CHANNELS.SCAN_EDITORS)
  },

  getDefaultAppForFile: (filePath: string, access?: import('@proma/shared').FileAccessOptions) => {
    return ipcRenderer.invoke(IPC_CHANNELS.GET_DEFAULT_APP_FOR_FILE, filePath, access) as Promise<import('@proma/shared').DefaultAppInfo | null>
  },

  showInFolder: (filePath: string) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.SHOW_IN_FOLDER, filePath)
  },
  showPluginInFolder: (pluginPath: string) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.SHOW_PLUGIN_IN_FOLDER, pluginPath)
  },

  openUserPluginsLocalDir: () => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.OPEN_USER_PLUGINS_LOCAL_DIR)
  },
  openDefaultSkillsDir: () => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.OPEN_DEFAULT_SKILLS_DIR)
  },

  resolveAndReadFile: (filePath: string, access?: import('@proma/shared').FileAccessOptions) => {
    return ipcRenderer.invoke('file:resolve-and-read', filePath, access) as Promise<import('@proma/shared').FilePreviewReadResult>
  },

  writeTextFile: (filePath: string, content: string, access?: import('@proma/shared').FileAccessOptions) => {
    return ipcRenderer.invoke('file:write-text', filePath, content, access) as Promise<boolean>
  },

  resolveFilePath: (filePath: string, access?: import('@proma/shared').FileAccessOptions) => {
    return ipcRenderer.invoke('file:resolve-path', filePath, access) as Promise<import('@proma/shared').ResolvedFileUrl | null>
  },

  preparePdfPreview: (filePath: string, access?: import('@proma/shared').FileAccessOptions) => {
    return ipcRenderer.invoke('file:prepare-pdf-preview', filePath, access) as Promise<{ tmpHtmlUrl: string } | null>
  },

  prepareHtmlPreview: (filePath: string, access?: import('@proma/shared').FileAccessOptions) => {
    return ipcRenderer.invoke(IPC_CHANNELS.PREPARE_HTML_PREVIEW, filePath, access) as Promise<HtmlPreviewResult | null>
  },

  readBinaryBase64: (filePath: string, access?: import('@proma/shared').FileAccessOptions, maxSize?: number) => {
    return ipcRenderer.invoke('file:read-binary-base64', filePath, access, maxSize) as Promise<string | null>
  },

  docxToHtml: (filePath: string, access?: import('@proma/shared').FileAccessOptions) => {
    return ipcRenderer.invoke('file:docx-to-html', filePath, access) as Promise<{ resolvedPath: string; html: string } | null>
  },

  officeToHtml: (filePath: string, access?: import('@proma/shared').FileAccessOptions) => {
    return ipcRenderer.invoke('file:office-to-html', filePath, access) as Promise<import('@proma/shared').OfficePreviewResult | null>
  },

  screenshotCapture: (input: { html: string; isDark: boolean; width?: number; mode: 'clipboard' | 'file'; css?: string; themeClass?: string }) => {
    return ipcRenderer.invoke(IPC_CHANNELS.SCREENSHOT_CAPTURE, input) as Promise<{ success: boolean; message: string; filePath?: string }>
  },

  renameFile: (filePath: string, newName: string) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.RENAME_FILE, filePath, newName)
  },

  moveFile: (filePath: string, targetDir: string) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.MOVE_FILE, filePath, targetDir)
  },

  copyFile: (sourcePath: string, targetDir: string) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.COPY_FILE, sourcePath, targetDir)
  },

  clearSystemClipboard: () => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.CLEAR_SYSTEM_CLIPBOARD)
  },

  writePathsToSystemClipboard: (paths: string[]) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.WRITE_PATHS_TO_SYSTEM_CLIPBOARD, paths)
  },

  listAttachedDirectory: (dirPath: string, access?: import('@proma/shared').FileAccessOptions) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.LIST_ATTACHED_DIRECTORY, dirPath, access)
  },

  readAttachedFile: (filePath: string, sessionId?: string, workspaceSlug?: string) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.READ_ATTACHED_FILE, filePath, sessionId, workspaceSlug)
  },

  showAttachedInFolder: (filePath: string, access?: import('@proma/shared').FileAccessOptions) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.SHOW_ATTACHED_IN_FOLDER, filePath, access)
  },

  renameAttachedFile: (filePath: string, newName: string, access?: import('@proma/shared').FileAccessOptions) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.RENAME_ATTACHED_FILE, filePath, newName, access)
  },

  moveAttachedFile: (filePath: string, targetDir: string, access?: import('@proma/shared').FileAccessOptions) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.MOVE_ATTACHED_FILE, filePath, targetDir, access)
  },

  checkPathsType: (paths: string[]) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.CHECK_PATHS_TYPE, paths)
  },

  getPathForFile: (file: File) => {
    return webUtils.getPathForFile(file)
  },

  searchWorkspaceFiles: (rootPath: string, query: string, limit = 20, additionalPaths?: string[], sessionPaths?: string[]) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.SEARCH_WORKSPACE_FILES, rootPath, query, limit, additionalPaths, sessionPaths)
  },

  // 系统提示词管理
  getSystemPromptConfig: () => {
    return ipcRenderer.invoke(SYSTEM_PROMPT_IPC_CHANNELS.GET_CONFIG)
  },

  createSystemPrompt: (input: SystemPromptCreateInput) => {
    return ipcRenderer.invoke(SYSTEM_PROMPT_IPC_CHANNELS.CREATE, input)
  },

  updateSystemPrompt: (id: string, input: SystemPromptUpdateInput) => {
    return ipcRenderer.invoke(SYSTEM_PROMPT_IPC_CHANNELS.UPDATE, id, input)
  },

  deleteSystemPrompt: (id: string) => {
    return ipcRenderer.invoke(SYSTEM_PROMPT_IPC_CHANNELS.DELETE, id)
  },

  updateAppendSetting: (enabled: boolean) => {
    return ipcRenderer.invoke(SYSTEM_PROMPT_IPC_CHANNELS.UPDATE_APPEND_SETTING, enabled)
  },

  setDefaultPrompt: (id: string | null) => {
    return ipcRenderer.invoke(SYSTEM_PROMPT_IPC_CHANNELS.SET_DEFAULT, id)
  },

  // 自动更新
  updater: {
    checkForUpdates: (opts) => ipcRenderer.invoke('updater:check', opts),
    getStatus: () => ipcRenderer.invoke('updater:get-status'),
    onStatusChanged: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, status: Parameters<typeof callback>[0]): void => callback(status)
      ipcRenderer.on('updater:status-changed', listener)
      return () => { ipcRenderer.removeListener('updater:status-changed', listener) }
    },
    quitAndInstall: () => ipcRenderer.invoke('updater:quit-and-install'),
  },

  // GitHub Release
  getLatestRelease: () => {
    return ipcRenderer.invoke(GITHUB_RELEASE_IPC_CHANNELS.GET_LATEST_RELEASE)
  },

  listReleases: (options) => {
    return ipcRenderer.invoke(GITHUB_RELEASE_IPC_CHANNELS.LIST_RELEASES, options)
  },

  getReleaseByTag: (tag) => {
    return ipcRenderer.invoke(GITHUB_RELEASE_IPC_CHANNELS.GET_RELEASE_BY_TAG, tag)
  },

  // ===== 飞书集成 =====

  getFeishuConfig: () => {
    return ipcRenderer.invoke(FEISHU_IPC_CHANNELS.GET_CONFIG)
  },

  getDecryptedFeishuSecret: () => {
    return ipcRenderer.invoke(FEISHU_IPC_CHANNELS.GET_DECRYPTED_SECRET)
  },

  saveFeishuConfig: (input: FeishuConfigInput) => {
    return ipcRenderer.invoke(FEISHU_IPC_CHANNELS.SAVE_CONFIG, input)
  },

  testFeishuConnection: (appId: string, appSecret: string) => {
    return ipcRenderer.invoke(FEISHU_IPC_CHANNELS.TEST_CONNECTION, appId, appSecret)
  },

  startFeishuBridge: () => {
    return ipcRenderer.invoke(FEISHU_IPC_CHANNELS.START_BRIDGE)
  },

  stopFeishuBridge: () => {
    return ipcRenderer.invoke(FEISHU_IPC_CHANNELS.STOP_BRIDGE)
  },

  getFeishuStatus: () => {
    return ipcRenderer.invoke(FEISHU_IPC_CHANNELS.GET_STATUS)
  },

  listFeishuBindings: () => {
    return ipcRenderer.invoke(FEISHU_IPC_CHANNELS.LIST_BINDINGS)
  },

  updateFeishuBinding: (input: FeishuUpdateBindingInput) => {
    return ipcRenderer.invoke(FEISHU_IPC_CHANNELS.UPDATE_BINDING, input)
  },

  removeFeishuBinding: (chatId: string) => {
    return ipcRenderer.invoke(FEISHU_IPC_CHANNELS.REMOVE_BINDING, chatId)
  },

  reportFeishuPresence: (report: FeishuPresenceReport) => {
    return ipcRenderer.invoke(FEISHU_IPC_CHANNELS.REPORT_PRESENCE, report)
  },

  onFeishuStatusChanged: (callback: (state: FeishuBridgeState) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: FeishuBridgeState): void => callback(state)
    ipcRenderer.on(FEISHU_IPC_CHANNELS.STATUS_CHANGED, listener)
    return () => { ipcRenderer.removeListener(FEISHU_IPC_CHANNELS.STATUS_CHANGED, listener) }
  },

  // --- 多 Bot v2 API ---

  getFeishuMultiConfig: () => {
    return ipcRenderer.invoke(FEISHU_IPC_CHANNELS.GET_MULTI_CONFIG)
  },

  saveFeishuBotConfig: (input: import('@proma/shared').FeishuBotConfigInput) => {
    return ipcRenderer.invoke(FEISHU_IPC_CHANNELS.SAVE_BOT_CONFIG, input)
  },

  getDecryptedFeishuBotSecret: (botId: string) => {
    return ipcRenderer.invoke(FEISHU_IPC_CHANNELS.GET_BOT_DECRYPTED_SECRET, botId)
  },

  removeFeishuBot: (botId: string) => {
    return ipcRenderer.invoke(FEISHU_IPC_CHANNELS.REMOVE_BOT, botId)
  },

  startFeishuBot: (botId: string) => {
    return ipcRenderer.invoke(FEISHU_IPC_CHANNELS.START_BOT, botId)
  },

  stopFeishuBot: (botId: string) => {
    return ipcRenderer.invoke(FEISHU_IPC_CHANNELS.STOP_BOT, botId)
  },

  getFeishuMultiStatus: () => {
    return ipcRenderer.invoke(FEISHU_IPC_CHANNELS.GET_MULTI_STATUS)
  },

  // --- 扫码注册 ---

  registerFeishuApp: () => {
    return ipcRenderer.invoke(FEISHU_IPC_CHANNELS.REGISTER_APP_START)
  },

  cancelFeishuRegistration: () => {
    return ipcRenderer.invoke(FEISHU_IPC_CHANNELS.REGISTER_APP_CANCEL)
  },

  onFeishuRegisterQrcode: (callback: (payload: import('@proma/shared').FeishuRegisterAppQRCode) => void) => {
    const listener = (_: unknown, payload: import('@proma/shared').FeishuRegisterAppQRCode) => callback(payload)
    ipcRenderer.on(FEISHU_IPC_CHANNELS.REGISTER_APP_QRCODE, listener)
    return () => { ipcRenderer.removeListener(FEISHU_IPC_CHANNELS.REGISTER_APP_QRCODE, listener) }
  },

  onFeishuRegisterStatus: (callback: (payload: import('@proma/shared').FeishuRegisterAppStatus) => void) => {
    const listener = (_: unknown, payload: import('@proma/shared').FeishuRegisterAppStatus) => callback(payload)
    ipcRenderer.on(FEISHU_IPC_CHANNELS.REGISTER_APP_STATUS, listener)
    return () => { ipcRenderer.removeListener(FEISHU_IPC_CHANNELS.REGISTER_APP_STATUS, listener) }
  },

  // ===== 微信集成 =====

  getWeChatConfig: () => {
    return ipcRenderer.invoke(WECHAT_IPC_CHANNELS.GET_CONFIG)
  },

  startWeChatLogin: () => {
    return ipcRenderer.invoke(WECHAT_IPC_CHANNELS.START_LOGIN)
  },

  logoutWeChat: () => {
    return ipcRenderer.invoke(WECHAT_IPC_CHANNELS.LOGOUT)
  },

  startWeChatBridge: () => {
    return ipcRenderer.invoke(WECHAT_IPC_CHANNELS.START_BRIDGE)
  },

  stopWeChatBridge: () => {
    return ipcRenderer.invoke(WECHAT_IPC_CHANNELS.STOP_BRIDGE)
  },

  getWeChatStatus: () => {
    return ipcRenderer.invoke(WECHAT_IPC_CHANNELS.GET_STATUS)
  },

  onWeChatStatusChanged: (callback: (state: WeChatBridgeState) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: WeChatBridgeState): void => callback(state)
    ipcRenderer.on(WECHAT_IPC_CHANNELS.STATUS_CHANGED, listener)
    return () => { ipcRenderer.removeListener(WECHAT_IPC_CHANNELS.STATUS_CHANGED, listener) }
  },

  // ===== 钉钉集成 =====

  getDingTalkConfig: () => {
    return ipcRenderer.invoke(DINGTALK_IPC_CHANNELS.GET_CONFIG)
  },

  getDecryptedDingTalkSecret: () => {
    return ipcRenderer.invoke(DINGTALK_IPC_CHANNELS.GET_DECRYPTED_SECRET)
  },

  saveDingTalkConfig: (input: DingTalkConfigInput) => {
    return ipcRenderer.invoke(DINGTALK_IPC_CHANNELS.SAVE_CONFIG, input)
  },

  testDingTalkConnection: (clientId: string, clientSecret: string) => {
    return ipcRenderer.invoke(DINGTALK_IPC_CHANNELS.TEST_CONNECTION, clientId, clientSecret)
  },

  startDingTalkBridge: () => {
    return ipcRenderer.invoke(DINGTALK_IPC_CHANNELS.START_BRIDGE)
  },

  stopDingTalkBridge: () => {
    return ipcRenderer.invoke(DINGTALK_IPC_CHANNELS.STOP_BRIDGE)
  },

  getDingTalkStatus: () => {
    return ipcRenderer.invoke(DINGTALK_IPC_CHANNELS.GET_STATUS)
  },

  onDingTalkStatusChanged: (callback: (state: DingTalkBridgeState) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: DingTalkBridgeState): void => callback(state)
    ipcRenderer.on(DINGTALK_IPC_CHANNELS.STATUS_CHANGED, listener)
    return () => { ipcRenderer.removeListener(DINGTALK_IPC_CHANNELS.STATUS_CHANGED, listener) }
  },

  // --- 钉钉多 Bot v2 API ---

  getDingTalkMultiConfig: () => {
    return ipcRenderer.invoke(DINGTALK_IPC_CHANNELS.GET_MULTI_CONFIG)
  },

  saveDingTalkBotConfig: (input: import('@proma/shared').DingTalkBotConfigInput) => {
    return ipcRenderer.invoke(DINGTALK_IPC_CHANNELS.SAVE_BOT_CONFIG, input)
  },

  getDecryptedDingTalkBotSecret: (botId: string) => {
    return ipcRenderer.invoke(DINGTALK_IPC_CHANNELS.GET_BOT_DECRYPTED_SECRET, botId)
  },

  removeDingTalkBot: (botId: string) => {
    return ipcRenderer.invoke(DINGTALK_IPC_CHANNELS.REMOVE_BOT, botId)
  },

  startDingTalkBot: (botId: string) => {
    return ipcRenderer.invoke(DINGTALK_IPC_CHANNELS.START_BOT, botId)
  },

  stopDingTalkBot: (botId: string) => {
    return ipcRenderer.invoke(DINGTALK_IPC_CHANNELS.STOP_BOT, botId)
  },

  getDingTalkMultiStatus: () => {
    return ipcRenderer.invoke(DINGTALK_IPC_CHANNELS.GET_MULTI_STATUS)
  },

  onMenuCloseTab: (callback: () => void) => {
    const listener = (): void => callback()
    ipcRenderer.on('menu:close-tab', listener)
    return () => { ipcRenderer.removeListener('menu:close-tab', listener) }
  },

  // ===== 快速任务窗口 =====

  submitQuickTask: (input: QuickTaskSubmitInput) => {
    return ipcRenderer.invoke(QUICK_TASK_IPC_CHANNELS.SUBMIT, input)
  },

  hideQuickTask: () => {
    return ipcRenderer.invoke(QUICK_TASK_IPC_CHANNELS.HIDE)
  },

  reregisterGlobalShortcuts: () => {
    return ipcRenderer.invoke(QUICK_TASK_IPC_CHANNELS.REREGISTER_GLOBAL_SHORTCUTS)
  },

  onQuickTaskFocus: (callback: () => void) => {
    const listener = (): void => callback()
    ipcRenderer.on(QUICK_TASK_IPC_CHANNELS.FOCUS, listener)
    return () => { ipcRenderer.removeListener(QUICK_TASK_IPC_CHANNELS.FOCUS, listener) }
  },

  onQuickTaskOpenSession: (callback: (data: QuickTaskOpenSessionData) => void) => {
    const listener = (_: unknown, data: QuickTaskOpenSessionData): void => callback(data)
    ipcRenderer.on('quick-task:open-session', listener)
    return () => { ipcRenderer.removeListener('quick-task:open-session', listener) }
  },

  // ===== 语音输入 =====

  getVoiceDictationSettings: () => {
    return ipcRenderer.invoke(VOICE_DICTATION_IPC_CHANNELS.GET_SETTINGS)
  },

  updateVoiceDictationSettings: (updates: VoiceDictationSettingsUpdate) => {
    return ipcRenderer.invoke(VOICE_DICTATION_IPC_CHANNELS.UPDATE_SETTINGS, updates)
  },

  testVoiceDictationConnection: (updates?: VoiceDictationSettingsUpdate) => {
    return ipcRenderer.invoke(VOICE_DICTATION_IPC_CHANNELS.TEST_CONNECTION, updates)
  },

  toggleVoiceDictation: () => {
    return ipcRenderer.invoke(VOICE_DICTATION_IPC_CHANNELS.TOGGLE)
  },

  startVoiceDictation: (input: VoiceDictationStartInput) => {
    return ipcRenderer.invoke(VOICE_DICTATION_IPC_CHANNELS.START, input)
  },

  sendVoiceDictationAudio: (input: VoiceDictationAudioChunkInput) => {
    return ipcRenderer.invoke(VOICE_DICTATION_IPC_CHANNELS.SEND_AUDIO, input)
  },

  stopVoiceDictation: (input: VoiceDictationStopInput) => {
    return ipcRenderer.invoke(VOICE_DICTATION_IPC_CHANNELS.STOP, input)
  },

  cancelVoiceDictation: (input: VoiceDictationStopInput) => {
    return ipcRenderer.invoke(VOICE_DICTATION_IPC_CHANNELS.CANCEL, input)
  },

  commitVoiceDictation: (input: VoiceDictationCommitInput) => {
    return ipcRenderer.invoke(VOICE_DICTATION_IPC_CHANNELS.COMMIT, input)
  },

  hideVoiceDictation: () => {
    return ipcRenderer.invoke(VOICE_DICTATION_IPC_CHANNELS.HIDE)
  },

  resizeVoiceDictation: (input: VoiceDictationResizeInput) => {
    return ipcRenderer.invoke(VOICE_DICTATION_IPC_CHANNELS.RESIZE, input)
  },

  onVoiceDictationShown: (callback: () => void) => {
    const listener = (): void => callback()
    ipcRenderer.on(VOICE_DICTATION_IPC_CHANNELS.SHOWN, listener)
    return () => { ipcRenderer.removeListener(VOICE_DICTATION_IPC_CHANNELS.SHOWN, listener) }
  },

  onVoiceDictationToggleStop: (callback: () => void) => {
    const listener = (): void => callback()
    ipcRenderer.on(VOICE_DICTATION_IPC_CHANNELS.TOGGLE_STOP, listener)
    return () => { ipcRenderer.removeListener(VOICE_DICTATION_IPC_CHANNELS.TOGGLE_STOP, listener) }
  },

  onVoiceDictationTranscript: (callback: (event: VoiceDictationTranscriptEvent) => void) => {
    const listener = (_: unknown, event: VoiceDictationTranscriptEvent): void => callback(event)
    ipcRenderer.on(VOICE_DICTATION_IPC_CHANNELS.TRANSCRIPT, listener)
    return () => { ipcRenderer.removeListener(VOICE_DICTATION_IPC_CHANNELS.TRANSCRIPT, listener) }
  },

  onVoiceDictationState: (callback: (event: VoiceDictationStateEvent) => void) => {
    const listener = (_: unknown, event: VoiceDictationStateEvent): void => callback(event)
    ipcRenderer.on(VOICE_DICTATION_IPC_CHANNELS.STATE, listener)
    return () => { ipcRenderer.removeListener(VOICE_DICTATION_IPC_CHANNELS.STATE, listener) }
  },

  onVoiceDictationInsertText: (callback: (data: { text: string }) => void) => {
    const listener = (_: unknown, data: { text: string }): void => callback(data)
    ipcRenderer.on(VOICE_DICTATION_IPC_CHANNELS.INSERT_TEXT, listener)
    return () => { ipcRenderer.removeListener(VOICE_DICTATION_IPC_CHANNELS.INSERT_TEXT, listener) }
  },

  checkMicrophonePermission: () => {
    return ipcRenderer.invoke(VOICE_DICTATION_IPC_CHANNELS.CHECK_MIC_PERMISSION)
  },

  requestMicrophonePermission: () => {
    return ipcRenderer.invoke(VOICE_DICTATION_IPC_CHANNELS.REQUEST_MIC_PERMISSION)
  },

  onTrayOpenAgentSession: (callback: (data: TrayOpenAgentSessionData) => void) => {
    const listener = (_: unknown, data: TrayOpenAgentSessionData): void => callback(data)
    ipcRenderer.on(TRAY_IPC_CHANNELS.OPEN_AGENT_SESSION, listener)
    return () => { ipcRenderer.removeListener(TRAY_IPC_CHANNELS.OPEN_AGENT_SESSION, listener) }
  },

  onTrayCreateSession: (callback: (data: TrayCreateSessionData) => void) => {
    const listener = (_: unknown, data: TrayCreateSessionData): void => callback(data)
    ipcRenderer.on(TRAY_IPC_CHANNELS.CREATE_SESSION, listener)
    return () => { ipcRenderer.removeListener(TRAY_IPC_CHANNELS.CREATE_SESSION, listener) }
  },

  migrationGetExportPreview: (workspaceId: string) => {
    return ipcRenderer.invoke('migration:getExportPreview', workspaceId)
  },

  migrationGetShareExportPreview: () => {
    return ipcRenderer.invoke('migration:getShareExportPreview')
  },

  migrationExport: (options: unknown) => {
    return ipcRenderer.invoke('migration:export', options)
  },

  migrationExportV2: (options: unknown) => {
    return ipcRenderer.invoke('migration:exportV2', options)
  },

  migrationParseImportFile: (filePath: string) => {
    return ipcRenderer.invoke('migration:parseImportFile', filePath)
  },

  migrationConfirmImport: (options: unknown) => {
    return ipcRenderer.invoke('migration:confirmImport', options)
  },

  migrationOpenFileDialog: () => {
    return ipcRenderer.invoke('migration:openFileDialog')
  },

  migrationSaveFileDialog: (mode: string) => {
    return ipcRenderer.invoke('migration:saveFileDialog', mode)
  },

  onMigrationOpenImportFile: (callback: (data: { filePath: string }) => void) => {
    const listener = (_: unknown, data: { filePath: string }): void => callback(data)
    ipcRenderer.on('migration:open-import-file', listener)
    return () => { ipcRenderer.removeListener('migration:open-import-file', listener) }
  },

  // ===== 存储管理 =====

  getStorageStats: () => {
    return ipcRenderer.invoke(STORAGE_IPC_CHANNELS.GET_STATS)
  },

  cleanupStorage: (options: unknown) => {
    return ipcRenderer.invoke(STORAGE_IPC_CHANNELS.CLEANUP, options)
  },

  cleanupTempStorage: () => {
    return ipcRenderer.invoke(STORAGE_IPC_CHANNELS.CLEANUP_TEMP)
  },

  migrationCancelImport: (tempDir: string) => {
    return ipcRenderer.invoke('migration:cancelImport', tempDir)
  },

  // ===== WorkMate 认证 =====
  ...createAuthPreloadApi(),

  // ===== WorkMate 平台模型 =====
  ...createPlatformModelsPreloadApi(),

  // ===== WorkMate 观测上报 =====
  reportRendererError: (payload: { name: string; message: string; stack?: string; componentStack?: string }) => {
    return ipcRenderer.invoke('workmate:report-renderer-error', payload)
  },

  // ===== 定时任务（Automation）=====
  listAutomations: () => ipcRenderer.invoke(AUTOMATION_IPC_CHANNELS.LIST),
  createAutomation: (input: CreateAutomationInput) =>
    ipcRenderer.invoke(AUTOMATION_IPC_CHANNELS.CREATE, input),
  updateAutomation: (input: UpdateAutomationInput) =>
    ipcRenderer.invoke(AUTOMATION_IPC_CHANNELS.UPDATE, input),
  deleteAutomation: (id: string) =>
    ipcRenderer.invoke(AUTOMATION_IPC_CHANNELS.DELETE, id),
  toggleAutomation: (id: string, active: boolean) =>
    ipcRenderer.invoke(AUTOMATION_IPC_CHANNELS.TOGGLE, id, active),
  runAutomationNow: (id: string) =>
    ipcRenderer.invoke(AUTOMATION_IPC_CHANNELS.RUN_NOW, id),
  onAutomationChanged: (callback: () => void) => {
    const listener = (): void => callback()
    ipcRenderer.on(AUTOMATION_IPC_CHANNELS.CHANGED, listener)
    return () => { ipcRenderer.removeListener(AUTOMATION_IPC_CHANNELS.CHANGED, listener) }
  },
}

// 将 API 暴露到渲染进程的 window 对象上
preloadElapsed('准备暴露 electronAPI 到渲染进程')
contextBridge.exposeInMainWorld('electronAPI', electronAPI)
preloadElapsed('electronAPI 暴露完成，preload 脚本结束')

// 扩展 Window 接口的类型定义
declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
