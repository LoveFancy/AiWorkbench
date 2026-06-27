import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, join } from 'node:path'
import AdmZip from 'adm-zip'
import type {
  ConnectorInitProgressEvent,
  ConnectorInitProgressReporter,
  DefaultConnectorInitStep,
  DefaultConnectorInitStepId,
  InitializeDefaultConnectorInput,
  InitializeDefaultConnectorResult,
  McpServerEntry,
} from '@proma/shared'
import { buildHuataiEmailMcpEntry } from '@proma/shared'
import { getWorkspaceConnectorsConfig, saveWorkspaceConnectorsConfig, getWorkspaceMcpConfig, saveWorkspaceMcpConfig } from './agent-workspace-manager'
import { validateMcpServer } from './mcp-validator'
import { getConnectorsDir } from './config-paths'
import {
  getPlatformCommand,
  parseCommandLine,
  readCliConnectorDefinition,
  resolveCliConnectorEnv,
  validateCliUserProvidedData,
  writeCliConnectorRuntime,
  writeCliConnectorSecrets,
} from './cli-connector-runtime'
import type { CliConnectorDefinition } from './cli-connector-runtime'

interface CommandResult {
  ok: boolean
  stdout: string
  stderr: string
  timedOut?: boolean
}

interface CommandOptions {
  env?: Record<string, string | undefined>
  timeoutMs?: number
}

interface InitializerDeps {
  commandExists?: (command: string) => Promise<boolean>
  runCommand?: (command: string, args: string[], options?: CommandOptions) => Promise<CommandResult>
  downloadFile?: (url: string) => Promise<Buffer>
  validateMcpServer?: (name: string, entry: McpServerEntry) => Promise<{ success: boolean; message: string }>
  getSkillHubToken?: () => Promise<string>
  runId?: string
  reportProgress?: ConnectorInitProgressReporter
}

const LOG_PREFIX = '[连接器:华泰邮箱]'
const CLI_LOG_PREFIX = '[CLI连接器]'
const HI_AGENT_LOG_PREFIX = '[连接器:泰为 hiagent]'
const HI_AGENT_UAT_NPM_REGISTRY = 'http://npm.htsc'
const HI_AGENT_PRD_NPM_REGISTRY = 'http://repo-prd.htsc/artifactory/api/npm/mcp-npm-prd-local/'

const EMAIL_STEP_LABELS = {
  'check-runtime': '检查内置运行时',
  'check-package': '检查邮箱连接环境',
  'install-package': '准备邮箱连接能力',
  'write-config': '启用邮箱能力',
  'self-check': '自检邮箱连接',
} satisfies Partial<Record<DefaultConnectorInitStepId, string>>

function makeSteps(): DefaultConnectorInitStep[] {
  return (Object.keys(EMAIL_STEP_LABELS) as DefaultConnectorInitStepId[]).map((id) => ({
    id,
    label: EMAIL_STEP_LABELS[id as keyof typeof EMAIL_STEP_LABELS] ?? id,
    status: 'pending',
  }))
}

function setStep(
  steps: DefaultConnectorInitStep[],
  id: DefaultConnectorInitStepId,
  status: DefaultConnectorInitStep['status'],
  message?: string,
): void {
  const step = steps.find((item) => item.id === id)
  if (!step) return
  step.status = status
  if (message) step.message = message
}

function cloneSteps(steps: DefaultConnectorInitStep[]): DefaultConnectorInitStep[] {
  return steps.map((step) => ({ ...step }))
}

function createConnectorStepUpdater(
  workspaceSlug: string,
  input: InitializeDefaultConnectorInput,
  deps: InitializerDeps,
  steps: DefaultConnectorInitStep[],
): (id: DefaultConnectorInitStepId, status: DefaultConnectorInitStep['status'], message?: string) => void {
  const runId = input.runId ?? deps.runId ?? randomUUID()
  return (id, status, message) => {
    setStep(steps, id, status, message)
    deps.reportProgress?.({
      workspaceSlug,
      connectorId: input.connectorId,
      runId,
      steps: cloneSteps(steps),
    } satisfies ConnectorInitProgressEvent)
  }
}

async function defaultCommandExists(command: string): Promise<boolean> {
  const probe = process.platform === 'win32' ? 'where' : 'which'
  const result = await defaultRunCommand(probe, [command])
  return result.ok
}

function defaultRunCommand(command: string, args: string[], options: CommandOptions = {}): Promise<CommandResult> {
  return new Promise((resolve) => {
    execFile(command, args, { timeout: options.timeoutMs ?? 120_000, windowsHide: true, env: options.env ? { ...process.env, ...options.env } : process.env }, (error, stdout, stderr) => {
      const errorMessage = error ? `\n${error.message}` : ''
      resolve({
        ok: !error,
        stdout: stdout.toString(),
        stderr: `${stderr.toString()}${errorMessage}`.trim(),
        timedOut: Boolean(error && 'killed' in error && error.killed),
      })
    })
  })
}

/**
 * 解析命令的全路径
 *
 * Windows: where command 返回完整路径（如 C:\Users\...\Scripts\tool.exe）
 * Unix: which command 返回完整路径
 */
async function resolveCommandPath(command: string, runCommand: (command: string, args: string[], options?: CommandOptions) => Promise<CommandResult>): Promise<string | null> {
  const probe = process.platform === 'win32' ? 'where' : 'which'
  const result = await runCommand(probe, [command])
  if (!result.ok) return null
  // where/which 可能返回多行，取第一行
  const [firstPath] = result.stdout.trim().split('\n')
  const path = firstPath?.trim() ?? ''
  return path || null
}

function getCommandMessage(result: CommandResult): string {
  return (result.stderr || result.stdout || '安装失败').trim()
}

function getLogMessage(result: CommandResult): string {
  const rawMessage = (result.stderr || result.stdout).trim()
  if (!rawMessage) return result.ok ? '命令执行成功（无输出）' : '安装失败'
  const message = rawMessage.replace(/\s+/g, ' ').trim()
  return message.length > 600 ? `${message.slice(0, 600)}...` : message
}

function maskEmailAddress(emailAddress: string): string {
  const trimmed = emailAddress.trim()
  const [localPart, domain] = trimmed.split('@')
  if (!localPart || !domain) return trimmed ? '***' : ''
  const visiblePrefix = localPart.slice(0, Math.min(2, localPart.length))
  return `${visiblePrefix}${'*'.repeat(Math.max(localPart.length - visiblePrefix.length, 3))}@${domain}`
}

function logConnectorInfo(message: string, details?: Record<string, unknown>): void {
  if (details) {
    console.info(LOG_PREFIX, message, details)
    return
  }
  console.info(LOG_PREFIX, message)
}

function logCliConnectorInfo(message: string, details?: Record<string, unknown>, prefix = CLI_LOG_PREFIX): void {
  if (details) {
    console.info(prefix, message, details)
    return
  }
  console.info(prefix, message)
}

interface ConnectorMetadata {
  disabledTools?: unknown
  [key: string]: unknown
}

function normalizeHuataiEmailDisabledTools(workspaceSlug: string, connectorId: string): void {
  const metaPath = join(getConnectorsDir(workspaceSlug), connectorId, 'connector.json')
  if (!existsSync(metaPath)) return

  try {
    const metadata = JSON.parse(readFileSync(metaPath, 'utf-8')) as ConnectorMetadata
    const currentTools = Array.isArray(metadata.disabledTools)
      ? metadata.disabledTools.filter((tool): tool is string => typeof tool === 'string')
      : []
    const nextTools = currentTools.filter((tool) => tool !== 'save_to_mailbox')
    if (!nextTools.includes('send_email')) {
      nextTools.push('send_email')
    }

    if (JSON.stringify(currentTools) === JSON.stringify(nextTools)) return
    metadata.disabledTools = nextTools
    writeFileSync(metaPath, JSON.stringify(metadata, null, 2), 'utf-8')
    logConnectorInfo('已更新邮箱连接器工具权限', { connectorId })
  } catch (error) {
    console.warn(LOG_PREFIX, '更新邮箱连接器工具权限失败', error)
  }
}

function formatCliInstallError(commandText: string, result: CommandResult, secrets: Record<string, string>): string {
  const message = sanitizeMessage(getCommandMessage(result), secrets)
  return [
    '安装 talents CLI 失败。',
    `命令: ${commandText}`,
    '',
    '原始错误:',
    message,
  ].join('\n')
}

function formatGenericCliInstallError(displayName: string, commandText: string, result: CommandResult, secrets: Record<string, string>): string {
  const message = sanitizeMessage(getCommandMessage(result), secrets)
  return [
    `安装 ${displayName} CLI 失败。`,
    `命令: ${commandText}`,
    '',
    '原始错误:',
    message,
  ].join('\n')
}

function resolveHiAgentNpmRegistry(secrets: Record<string, string>): string {
  return secrets.AGENTOS_ENV === 'prd' ? HI_AGENT_PRD_NPM_REGISTRY : HI_AGENT_UAT_NPM_REGISTRY
}

function ensureHiAgentPrivateNpmRegistry(connectorId: string, installArgs: string[], secrets: Record<string, string>): string[] {
  if (connectorId !== 'hi-agent') return installArgs
  const [command, ...args] = installArgs
  if (command !== 'npm') return installArgs
  if (args.some((arg) => arg === '--registry' || arg.startsWith('--registry='))) return installArgs
  return [command, ...args, '--registry', resolveHiAgentNpmRegistry(secrets)]
}

async function resolveInstallCommandPath(
  command: string,
  runCommand: (command: string, args: string[], options?: CommandOptions) => Promise<CommandResult>,
): Promise<string | null> {
  if (isAbsolute(command)) return existsSync(command) ? command : null
  if (command !== 'npm') return command
  return resolveCommandPath(command, runCommand)
}

async function defaultDownloadFile(url: string): Promise<Buffer> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`下载失败: HTTP ${response.status}`)
  }
  return Buffer.from(await response.arrayBuffer())
}

export async function initializeDefaultConnector(
  workspaceSlug: string,
  input: InitializeDefaultConnectorInput,
  deps: InitializerDeps = {},
): Promise<InitializeDefaultConnectorResult> {
  if (input.connectorId === 'huatai-email') {
    return initializeHuataiEmailConnector(workspaceSlug, input, deps)
  }

  const connectorsConfig = getWorkspaceConnectorsConfig(workspaceSlug)
  const connectorDef = connectorsConfig.connectors[input.connectorId]
  if (connectorDef?.type === 'cli') {
    return initializeCliConnector(workspaceSlug, input, deps)
  }

  throw new Error(`暂不支持初始化连接器: ${input.connectorId}`)
}

async function initializeHuataiEmailConnector(
  workspaceSlug: string,
  input: InitializeDefaultConnectorInput,
  deps: InitializerDeps = {},
): Promise<InitializeDefaultConnectorResult> {
  if (!input.emailAddress?.trim() || !input.password?.trim()) {
    throw new Error('邮箱账号和密码不能为空')
  }

  logConnectorInfo('开始初始化默认连接器', {
    workspaceSlug,
    connectorId: input.connectorId,
    emailAddress: maskEmailAddress(input.emailAddress),
  })

  const validate = deps.validateMcpServer ?? (async (name, entry) => {
    const result = await validateMcpServer(name, entry)
    return { success: result.valid, message: result.valid ? '连接成功' : (result.reason ?? '连接失败') }
  })
  const steps = makeSteps()
  const updateStep = createConnectorStepUpdater(workspaceSlug, input, deps, steps)

  updateStep('check-runtime', 'running')

  // 从连接器配置读取 serverName
  const connectorsConfig = getWorkspaceConnectorsConfig(workspaceSlug)
  const connectorDef = connectorsConfig.connectors[input.connectorId]
  const serverName = connectorDef?.serverName ?? input.connectorId
  const connectorDir = join(getConnectorsDir(workspaceSlug), input.connectorId)
  const runtimePath = join(connectorDir, 'runtime', 'email-server.cjs')

  if (!existsSync(runtimePath)) {
    const message = `未找到内置邮箱 MCP 运行时: ${runtimePath}`
    logConnectorInfo('内置邮箱 MCP 运行时缺失', { runtimePath })
    updateStep('check-runtime', 'error', message)
    return {
      connectorId: input.connectorId,
      serverName,
      success: false,
      steps,
      message,
    }
  }
  updateStep('check-runtime', 'success', '内置运行时已就绪')
  logConnectorInfo('内置邮箱 MCP 运行时已就绪', { runtimePath })

  updateStep('check-package', 'success', '使用内置邮箱 MCP')
  updateStep('install-package', 'skipped', '使用内置运行时，无需安装依赖')

  const entry = buildHuataiEmailMcpEntry({
    emailAddress: input.emailAddress!,
    password: input.password!,
    command: process.execPath,
    args: [runtimePath, 'stdio'],
    extraEnv: {
      ELECTRON_RUN_AS_NODE: '1',
    },
  })

  updateStep('self-check', 'running')
  const validation = await validate(serverName, entry)
  if (!validation.success) {
    logConnectorInfo('连接器自检失败', { message: validation.message })
    updateStep('self-check', 'error', validation.message)
    return {
      connectorId: input.connectorId,
      serverName,
      success: false,
      steps,
      message: validation.message,
    }
  }

  updateStep('write-config', 'running')
  const config = getWorkspaceMcpConfig(workspaceSlug)
  saveWorkspaceMcpConfig(workspaceSlug, {
    servers: {
      ...config.servers,
      [serverName]: entry,
    },
  })
  logConnectorInfo('已写入 MCP 配置', { workspaceSlug, serverName })

  // 启用 connectors.json 中的连接器条目（并补齐 serverName）
  if (connectorDef) {
    connectorDef.enabled = true
    connectorDef.serverName = serverName
    normalizeHuataiEmailDisabledTools(workspaceSlug, input.connectorId)
    saveWorkspaceConnectorsConfig(workspaceSlug, connectorsConfig)
  }

  updateStep('write-config', 'success', '已启用华泰邮箱读取和草稿保存能力')
  updateStep('self-check', 'success', validation.message)
  logConnectorInfo('连接器初始化完成', { workspaceSlug, serverName: 'email' })

  return {
    connectorId: input.connectorId,
    serverName,
    success: true,
    steps,
    message: '华泰邮箱连接器初始化完成。',
  }
}

function makeCliSteps(definition?: CliConnectorDefinition): DefaultConnectorInitStep[] {
  const commandLabel = getCliCommandLabel(definition)
  const runtimeLabel = definition?.runtime?.type === 'node' ? '检查 Node/npm 环境' : '检查 CLI 运行环境'
  const skillLabel = commandLabel.replace(/\s+CLI$/i, '')
  const steps: DefaultConnectorInitStep[] = [
    { id: 'check-runtime', label: runtimeLabel, status: 'pending' },
    { id: 'check-package', label: `检查 ${commandLabel}`, status: 'pending' },
    { id: 'install-package', label: `安装 ${commandLabel}`, status: 'pending' },
    { id: 'install-skill', label: `启用 ${skillLabel} Skill`, status: 'pending' },
    { id: 'write-config', label: '保存认证配置', status: 'pending' },
    { id: 'self-check', label: '自检连接', status: 'pending' },
  ]
  if (definition?.env?.HTSKILL_TOKEN === '{{HTSKILL_TOKEN}}') {
    steps.splice(4, 0, { id: 'check-auth', label: '检查 SkillHub 认证', status: 'pending' })
  }
  return steps
}

async function initializeCliConnector(
  workspaceSlug: string,
  input: InitializeDefaultConnectorInput,
  deps: InitializerDeps = {},
): Promise<InitializeDefaultConnectorResult> {
  const commandExists = deps.commandExists ?? defaultCommandExists
  const runCommand = deps.runCommand ?? defaultRunCommand
  const downloadFile = deps.downloadFile ?? defaultDownloadFile

  const connectorsConfig = getWorkspaceConnectorsConfig(workspaceSlug)
  const connectorDef = connectorsConfig.connectors[input.connectorId]
  if (!connectorDef || connectorDef.type !== 'cli') {
    throw new Error(`连接器不是 CLI 类型: ${input.connectorId}`)
  }

  const connectorDir = join(getConnectorsDir(workspaceSlug), input.connectorId)
  const definition = readCliConnectorDefinition(connectorDir)
  const isHiAgent = input.connectorId === 'hi-agent'
  const userValues = isHiAgent ? {} : validateCliUserProvidedData(definition, input.userProvidedData)
  const displayName = definition.displayName ?? connectorDef.displayName ?? input.connectorId
  const steps = makeCliSteps(definition)
  const updateStep = createConnectorStepUpdater(workspaceSlug, input, deps, steps)
  const commandName = getCliCommandName(definition)
  if (!commandName) {
    throw new Error(`连接器缺少当前平台命令: ${input.connectorId}`)
  }
  updateStep('check-runtime', 'running')

  if (definition.runtime?.type === 'node') {
    const runtimeReady = await ensureNodeRuntime(definition, commandExists, runCommand, updateStep, input.connectorId, steps)
    if (!runtimeReady.success) return runtimeReady.result
  } else {
    updateStep('check-runtime', 'success', definition.runtime?.type === 'binary' ? '使用独立 CLI binary' : '无需额外运行时')
  }

  let resolvedEnvSecrets = userValues
  if (isHiAgent) {
    updateStep('check-auth', 'running')
    try {
      resolvedEnvSecrets = {
        HTSKILL_TOKEN: await (deps.getSkillHubToken ?? defaultGetSkillHubToken)(),
        AGENTOS_ENV: 'uat',
      }
      updateStep('check-auth', 'success', 'SkillHub 认证已就绪')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      updateStep('check-auth', 'error', message)
      return {
        connectorId: input.connectorId,
        success: false,
        steps,
        message,
      }
    }
  }

  updateStep('check-package', 'running')
  let resolvedPath = await resolveCommandPath(commandName, runCommand)
  const alreadyInstalled = Boolean(resolvedPath)
  updateStep('check-package', alreadyInstalled ? 'success' : 'skipped', alreadyInstalled ? '已安装' : '未安装')

  if (!alreadyInstalled) {
    updateStep('install-package', 'running')
    const installResult = await installCliConnector({
      connectorDir,
      connectorId: input.connectorId,
      commandName,
      definition,
      displayName,
      runCommand,
      downloadFile,
      secrets: resolvedEnvSecrets,
    })
    if (!installResult.success) {
      updateStep('install-package', 'error', installResult.stepMessage)
      return {
        connectorId: input.connectorId,
        success: false,
        steps,
        message: installResult.resultMessage,
      }
    }
    resolvedPath = installResult.commandPath
    updateStep('install-package', 'success', installResult.message)
  } else {
    updateStep('install-package', 'skipped', '已安装，跳过')
  }

  if (!resolvedPath) {
    resolvedPath = await resolveCliCommandPath(commandName, definition, connectorDir, runCommand)
  }
  if (!resolvedPath || !isAbsolute(resolvedPath) || !existsSync(resolvedPath)) {
    updateStep('check-package', 'error', `无法定位 ${commandName} 可执行文件`)
    return {
      connectorId: input.connectorId,
      success: false,
      steps,
      message: `${displayName} CLI 已安装但无法定位可执行文件，请检查安装路径或 PATH。`,
    }
  }
  updateStep('check-package', 'success', resolvedPath)

  updateStep('install-skill', 'running')
  updateStep('install-skill', 'success', '已随连接器启用')

  updateStep('write-config', 'running')
  writeCliConnectorRuntime(connectorDir, {
    commandPath: resolvedPath,
    binDir: dirname(resolvedPath),
    packageName: getCliPackageName(definition, commandName),
    packageVersion: await readCliVersion(definition, resolvedPath, runCommand),
  })
  if (!isHiAgent) {
    writeCliConnectorSecrets(connectorDir, definition, userValues)
  }
  updateStep('write-config', 'success', '已保存')

  updateStep('self-check', 'running')
  const resolvedEnv = resolveCliConnectorEnv(definition, resolvedEnvSecrets)
  const selfCheck = await runCliStatusCheck(definition, resolvedPath, resolvedEnv, runCommand)
  if (!selfCheck.ok) {
    const message = sanitizeMessage(getCommandMessage(selfCheck), resolvedEnvSecrets) || `${displayName} Token 校验失败`
    updateStep('self-check', 'error', message)
    return {
      connectorId: input.connectorId,
      success: false,
      steps,
      message,
    }
  }

  connectorDef.enabled = true
  saveWorkspaceConnectorsConfig(workspaceSlug, connectorsConfig)
  updateStep('self-check', 'success', '连接成功')

  return {
    connectorId: input.connectorId,
    success: true,
    steps,
    message: `${displayName} 连接器初始化完成。`,
  }
}

async function defaultGetSkillHubToken(): Promise<string> {
  const { getValidSkillHubToken } = await import('./skillhub-auth-service')
  return getValidSkillHubToken()
}

interface NodeRuntimeCheckResult {
  success: true
}

interface NodeRuntimeCheckFailure {
  success: false
  result: InitializeDefaultConnectorResult
}

async function ensureNodeRuntime(
  definition: CliConnectorDefinition,
  commandExists: (command: string) => Promise<boolean>,
  runCommand: (command: string, args: string[], options?: CommandOptions) => Promise<CommandResult>,
  updateStep: (id: DefaultConnectorInitStepId, status: DefaultConnectorInitStep['status'], message?: string) => void,
  connectorId: string,
  steps: DefaultConnectorInitStep[],
): Promise<NodeRuntimeCheckResult | NodeRuntimeCheckFailure> {
  const nodeExists = await commandExists('node')
  const npmExists = await commandExists('npm')
  if (!nodeExists || !npmExists) {
    updateStep('check-runtime', 'error', '未检测到 Node.js 或 npm')
    return {
      success: false,
      result: {
        connectorId,
        success: false,
        steps,
        message: '未检测到 Node.js 或 npm，请先安装 Node.js 20 及以上版本。',
      },
    }
  }

  const nodeVersionResult = await runCommand('node', ['-v'])
  const nodeVersion = nodeVersionResult.stdout.trim()
  if (!isNodeVersionSupported(nodeVersion, definition.runtime?.version ?? '>=20')) {
    updateStep('check-runtime', 'error', `当前 Node 版本 ${nodeVersion || '未知'}，需要 Node.js 20+`)
    return {
      success: false,
      result: {
        connectorId,
        success: false,
        steps,
        message: '当前 Node.js 版本不满足要求，请安装 Node.js 20 及以上版本。',
      },
    }
  }
  updateStep('check-runtime', 'success', nodeVersion)
  return { success: true }
}

interface CliInstallOptions {
  connectorDir: string
  connectorId: string
  commandName: string
  definition: CliConnectorDefinition
  displayName: string
  runCommand: (command: string, args: string[], options?: CommandOptions) => Promise<CommandResult>
  downloadFile: (url: string) => Promise<Buffer>
  secrets: Record<string, string>
}

interface CliInstallSuccess {
  success: true
  commandPath: string
  message: string
}

interface CliInstallFailure {
  success: false
  stepMessage: string
  resultMessage: string
}

async function installCliConnector(options: CliInstallOptions): Promise<CliInstallSuccess | CliInstallFailure> {
  const hasArchiveSource = Boolean(options.definition.install?.[process.platform])
  const mode = options.definition.install?.mode ?? (hasArchiveSource ? 'download-archive' : (getPlatformCommand(options.definition.init) ? 'command' : 'manual'))
  if (mode === 'download-archive') {
    return installCliFromArchive(options)
  }
  if (mode === 'manual') {
    return {
      success: false,
      stepMessage: `当前平台需要手动安装 ${options.commandName}`,
      resultMessage: `当前平台缺少 ${options.displayName} CLI 自动安装配置。`,
    }
  }

  const installCommand = getPlatformCommand(options.definition.init)
  if (!installCommand) {
    return {
      success: false,
      stepMessage: '当前平台缺少安装命令',
      resultMessage: '当前平台缺少 CLI 安装命令。',
    }
  }

  const installArgs = ensureHiAgentPrivateNpmRegistry(options.connectorId, parseCommandLine(installCommand), options.secrets)
  const [command, ...args] = installArgs
  if (!command) throw new Error('CLI 安装命令为空')
  const commandText = installArgs.join(' ')
  const executableCommand = await resolveInstallCommandPath(command, options.runCommand)
  if (!executableCommand) {
    return {
      success: false,
      stepMessage: [
        `安装 ${options.connectorId === 'hi-agent' ? 'talents' : options.displayName} CLI 失败。`,
        `命令: ${commandText}`,
        '',
        '原始错误:',
        '未找到 npm 可执行文件，请确认 Node.js/npm 已安装，并重启 WorkMate 让应用重新加载 PATH。',
      ].join('\n'),
      resultMessage: `安装 ${options.connectorId === 'hi-agent' ? 'talents' : options.displayName} CLI 失败。`,
    }
  }
  const logPrefix = options.connectorId === 'hi-agent' ? HI_AGENT_LOG_PREFIX : CLI_LOG_PREFIX
  const installLogName = options.connectorId === 'hi-agent' ? 'talents' : options.displayName
  logCliConnectorInfo(`开始安装 ${installLogName} CLI`, { command: commandText }, logPrefix)
  const installResult = await options.runCommand(executableCommand, args, { timeoutMs: 180_000 })
  logCliConnectorInfo('安装命令结束', {
    ok: installResult.ok,
    command: commandText,
    message: sanitizeMessage(getLogMessage(installResult), options.secrets),
  }, logPrefix)
  if (!installResult.ok) {
    const isTalents = options.connectorId === 'hi-agent'
    const message = isTalents
      ? formatCliInstallError(commandText, installResult, options.secrets)
      : formatGenericCliInstallError(options.displayName, commandText, installResult, options.secrets)
    return {
      success: false,
      stepMessage: message,
      resultMessage: `安装 ${isTalents ? 'talents' : options.displayName} CLI 失败。`,
    }
  }

  const commandPath = await resolveCliCommandPath(options.commandName, options.definition, options.connectorDir, options.runCommand)
  if (!commandPath) {
    return {
      success: false,
      stepMessage: `安装完成但无法定位 ${options.commandName}`,
      resultMessage: `${options.displayName} CLI 安装完成但无法定位可执行文件。`,
    }
  }
  return { success: true, commandPath, message: '安装完成' }
}

async function installCliFromArchive(options: CliInstallOptions): Promise<CliInstallSuccess | CliInstallFailure> {
  const source = options.definition.install?.[process.platform]
  if (!source) {
    return {
      success: false,
      stepMessage: '当前平台缺少下载配置',
      resultMessage: `当前平台缺少 ${options.displayName} CLI 下载配置。`,
    }
  }

  try {
    logCliConnectorInfo(`开始下载 ${options.displayName} CLI`, { url: source.url })
    const archiveBytes = await downloadWithFallback(source.url, source.fallbackUrl, options.downloadFile)
    verifySha256(archiveBytes, source.sha256)

    const runtimeBinDir = join(options.connectorDir, 'runtime', 'bin')
    mkdirSync(runtimeBinDir, { recursive: true })
    const commandPath = join(runtimeBinDir, options.commandName)
    writeFileSync(commandPath, readZipBinary(archiveBytes, source.binaryPath))
    if (process.platform !== 'win32') {
      chmodSync(commandPath, 0o755)
    }
    return { success: true, commandPath, message: '下载完成' }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      success: false,
      stepMessage: sanitizeMessage(message, options.secrets),
      resultMessage: `安装 ${options.displayName} CLI 失败。`,
    }
  }
}

async function downloadWithFallback(url: string, fallbackUrl: string | undefined, downloadFile: (url: string) => Promise<Buffer>): Promise<Buffer> {
  try {
    return await downloadFile(url)
  } catch (error) {
    if (!fallbackUrl) throw error
    console.warn('[CLI连接器] 主下载地址失败，尝试备用地址:', error)
    return downloadFile(fallbackUrl)
  }
}

function verifySha256(bytes: Buffer, expectedSha256: string | undefined): void {
  if (!expectedSha256) return
  const actual = createHash('sha256').update(bytes).digest('hex')
  if (actual.toLowerCase() !== expectedSha256.toLowerCase()) {
    throw new Error(`CLI 安装包校验失败: expected ${expectedSha256}, actual ${actual}`)
  }
}

function readZipBinary(bytes: Buffer, binaryPath: string): Buffer {
  assertSafeArchivePath(binaryPath)
  const zip = new AdmZip(bytes)
  const normalizedTarget = normalizeArchivePath(binaryPath)
  const entry = zip.getEntries().find((item) => normalizeArchivePath(item.entryName) === normalizedTarget && !item.isDirectory)
  if (!entry) {
    throw new Error(`安装包内未找到 CLI 可执行文件: ${binaryPath}`)
  }
  return entry.getData()
}

function assertSafeArchivePath(filePath: string): void {
  const normalized = normalizeArchivePath(filePath)
  const parts = normalized.split('/').filter(Boolean)
  if (!normalized || normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized) || parts.includes('..')) {
    throw new Error(`安装包路径不安全: ${filePath}`)
  }
}

function normalizeArchivePath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/^\.\/+/, '')
}

async function resolveCliCommandPath(
  commandName: string,
  definition: CliConnectorDefinition,
  connectorDir: string,
  runCommand: (command: string, args: string[], options?: CommandOptions) => Promise<CommandResult>,
): Promise<string | null> {
  const direct = await resolveCommandPath(commandName, runCommand)
  if (direct) return direct

  const runtimeCandidate = join(connectorDir, 'runtime', 'bin', commandName)
  if (existsSync(runtimeCandidate)) return runtimeCandidate

  if (definition.runtime?.type !== 'node') return null

  const npmBin = await resolveNpmGlobalBin(runCommand)
  if (!npmBin) return null
  const candidate = join(npmBin, commandName)
  return existsSync(candidate) ? candidate : null
}

async function resolveNpmGlobalBin(runCommand: (command: string, args: string[], options?: CommandOptions) => Promise<CommandResult>): Promise<string | null> {
  const binResult = await runCommand('npm', ['bin', '-g'])
  const binPath = binResult.stdout.trim()
  if (binResult.ok && binPath && existsSync(binPath)) return binPath

  const prefixResult = await runCommand('npm', ['prefix', '-g'])
  const prefix = prefixResult.stdout.trim()
  if (!prefixResult.ok || !prefix) return null
  const candidate = process.platform === 'win32' ? prefix : join(prefix, 'bin')
  return existsSync(candidate) ? candidate : null
}

async function readCliVersion(
  definition: CliConnectorDefinition,
  commandPath: string,
  runCommand: (command: string, args: string[], options?: CommandOptions) => Promise<CommandResult>,
): Promise<string | undefined> {
  const versionCommand = getPlatformCommand(definition.versionCheck?.command)
  const args = versionCommand ? parseCommandLine(versionCommand).slice(1) : ['--version']
  const result = await runCommand(commandPath, args.length > 0 ? args : ['--version'])
  const rawVersion = (result.stdout || result.stderr).trim()
  if (!result.ok || !rawVersion) return definition.install?.version
  return extractVersion(rawVersion) ?? rawVersion
}

async function runCliStatusCheck(
  definition: CliConnectorDefinition,
  commandPath: string,
  env: Record<string, string>,
  runCommand: (command: string, args: string[], options?: CommandOptions) => Promise<CommandResult>,
): Promise<CommandResult> {
  const statusCommand = getPlatformCommand(definition.status)
  if (!statusCommand) return { ok: true, stdout: '', stderr: '' }
  const parts = parseCommandLine(statusCommand)
  if (parts.length === 0) return { ok: true, stdout: '', stderr: '' }
  const [, ...args] = parts
  return runCommand(commandPath, args, { env, timeoutMs: 120_000 })
}

function getCliCommandName(definition: CliConnectorDefinition): string | null {
  const command = getPlatformCommand(definition.command)
    ?? getFirstCommandToken(getPlatformCommand(definition.versionCheck?.command))
    ?? getFirstCommandToken(getPlatformCommand(definition.status))
    ?? getFirstCommandToken(getPlatformCommand(definition.init))
  return command ? basename(command) : null
}

function getFirstCommandToken(commandLine: string | null): string | null {
  if (!commandLine) return null
  const [command] = parseCommandLine(commandLine)
  return command ?? null
}

function getCliCommandLabel(definition: CliConnectorDefinition | undefined): string {
  if (!definition) return 'CLI'
  const packageName = definition.packageName
  if (packageName) return packageName
  const commandName = getCliCommandName(definition)
  if (commandName) return `${commandName.replace(/\.cmd$/i, '').replace(/\.exe$/i, '')} CLI`
  return 'CLI'
}

function getCliPackageName(definition: CliConnectorDefinition, commandName: string): string {
  if (definition.packageName) return definition.packageName
  const installCommand = getPlatformCommand(definition.init)
  if (installCommand) {
    const parts = parseCommandLine(installCommand)
    const globalIndex = parts.indexOf('-g')
    if (globalIndex >= 0 && parts[globalIndex + 1]) return parts[globalIndex + 1]!
    const installIndex = parts.indexOf('install')
    if (installIndex >= 0) {
      const candidate = parts.slice(installIndex + 1).find((part) => !part.startsWith('-'))
      if (candidate) return candidate
    }
  }
  return commandName.replace(/\.cmd$/i, '').replace(/\.exe$/i, '')
}

function extractVersion(rawVersion: string): string | undefined {
  return rawVersion.match(/\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?/)?.[0]
}

function isNodeVersionSupported(version: string, requirement: string): boolean {
  const major = Number(version.trim().replace(/^v/, '').split('.')[0])
  if (!Number.isFinite(major)) return false
  const match = requirement.match(/>=\s*(\d+)/)
  const minMajor = match ? Number(match[1]) : 20
  return major >= minMajor
}

function sanitizeMessage(message: string, secrets: Record<string, string>): string {
  let sanitized = message
  for (const value of Object.values(secrets)) {
    if (value.length >= 6) {
      sanitized = sanitized.split(value).join(maskSecret(value))
    }
  }
  return sanitized
}

function maskSecret(value: string): string {
  if (value.length <= 8) return '********'
  return `${value.slice(0, 4)}********${value.slice(-4)}`
}
