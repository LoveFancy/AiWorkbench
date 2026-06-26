import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'
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
import { getValidUatToken, readUatAuth, isExpired } from './hiagent-auth-service'

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
  validateMcpServer?: (name: string, entry: McpServerEntry) => Promise<{ success: boolean; message: string }>
  runId?: string
  reportProgress?: ConnectorInitProgressReporter
}

const LOG_PREFIX = '[连接器:华泰邮箱]'
const CLI_LOG_PREFIX = '[连接器:泰为 hiagent]'

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
  logCliConnectorInfo('[check-package] 执行命令', { command: `${probe} ${command}` })
  const result = await runCommand(probe, [command])
  logCliConnectorInfo('[check-package] 命令结果', { command: `${probe} ${command}`, ok: result.ok, stdout: result.stdout.trim() })
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

function logCliConnectorInfo(message: string, details?: Record<string, unknown>): void {
  if (details) {
    console.info(CLI_LOG_PREFIX, message, details)
    return
  }
  console.info(CLI_LOG_PREFIX, message)
}

function formatCliInstallError(commandText: string, result: CommandResult, secrets: Record<string, string>): string {
  const message = sanitizeMessage(getCommandMessage(result), secrets)
  const lines = [
    '安装 talents CLI 失败，可尝试在终端手动执行：',
    commandText,
  ]
  if (message) {
    lines.push('', '原始错误:', message)
  }
  return lines.join('\n')
}

async function findFirstAvailable(commands: string[], commandExists: (command: string) => Promise<boolean>): Promise<string | null> {
  for (const command of commands) {
    if (await commandExists(command)) return command
  }
  return null
}

export async function initializeDefaultConnector(
  workspaceSlug: string,
  input: InitializeDefaultConnectorInput,
  deps: InitializerDeps = {},
): Promise<InitializeDefaultConnectorResult> {
  switch (input.connectorId) {
    case 'huatai-email':
      return initializeHuataiEmailConnector(workspaceSlug, input, deps)
    case 'hi-agent':
      return initializeCliConnector(workspaceSlug, input, deps)
    default:
      throw new Error(`暂不支持初始化连接器: ${input.connectorId}`)
  }
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
    logConnectorInfo('连接器自检失败（忽略）', { message: validation.message })
    updateStep('self-check', 'skipped', '自检失败，跳过')
  } else {
    updateStep('self-check', 'success', validation.message)
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
    saveWorkspaceConnectorsConfig(workspaceSlug, connectorsConfig)
  }

  updateStep('write-config', 'success', '已启用华泰邮箱读取能力')
  logConnectorInfo('连接器初始化完成', { workspaceSlug, serverName: 'email' })

  return {
    connectorId: input.connectorId,
    serverName,
    success: true,
    steps,
    message: '华泰邮箱连接器初始化完成。',
  }
}

function makeCliSteps(): DefaultConnectorInitStep[] {
  return [
    { id: 'check-runtime', label: '检查 Node/npm 环境', status: 'pending' },
    { id: 'check-package', label: '检查 talents CLI', status: 'pending' },
    { id: 'install-package', label: '安装 talents CLI', status: 'pending' },
    { id: 'install-skill', label: '启用 talents Skill', status: 'pending' },
    { id: 'write-config', label: '保存认证配置', status: 'pending' },
    { id: 'self-check', label: '自检连接', status: 'pending' },
  ]
}

function makeHiAgentCliSteps(): DefaultConnectorInitStep[] {
  return [
    { id: 'check-runtime', label: '检查 Node/npm 环境', status: 'pending' },
    { id: 'check-package', label: '检查 talents CLI', status: 'pending' },
    { id: 'install-package', label: '安装 talents CLI', status: 'pending' },
    { id: 'install-skill', label: '启用 talents Skill', status: 'pending' },
    { id: 'check-auth', label: 'SkillHub 认证换票', status: 'pending' },
    { id: 'self-check', label: '自检连接', status: 'pending' },
  ]
}

async function initializeCliConnector(
  workspaceSlug: string,
  input: InitializeDefaultConnectorInput,
  deps: InitializerDeps = {},
): Promise<InitializeDefaultConnectorResult> {
  const commandExists = deps.commandExists ?? defaultCommandExists
  const runCommand = deps.runCommand ?? defaultRunCommand
  const isHiAgent = input.connectorId === 'hi-agent'
  const steps = isHiAgent ? makeHiAgentCliSteps() : makeCliSteps()
  const updateStep = createConnectorStepUpdater(workspaceSlug, input, deps, steps)
  updateStep('check-runtime', 'running')

  const connectorsConfig = getWorkspaceConnectorsConfig(workspaceSlug)
  const connectorDef = connectorsConfig.connectors[input.connectorId]
  if (!connectorDef || connectorDef.type !== 'cli') {
    throw new Error(`连接器不是 CLI 类型: ${input.connectorId}`)
  }

  const connectorDir = join(getConnectorsDir(workspaceSlug), input.connectorId)
  const definition = readCliConnectorDefinition(connectorDir)
  const userValues = validateCliUserProvidedData(definition, input.userProvidedData)

  const nodeExists = await commandExists('node')
  const npmExists = await commandExists('npm')
  if (!nodeExists || !npmExists) {
    updateStep('check-runtime', 'error', '未检测到 Node.js 或 npm')
    return {
      connectorId: input.connectorId,
      success: false,
      steps,
      message: '未检测到 Node.js 或 npm，请先安装 Node.js 20 及以上版本。',
    }
  }

  logCliConnectorInfo('[check-runtime] 执行命令', { command: 'node -v' })
  const nodeVersionResult = await runCommand('node', ['-v'])
  logCliConnectorInfo('[check-runtime] 命令结果', { command: 'node -v', ok: nodeVersionResult.ok, stdout: nodeVersionResult.stdout.trim() })
  const nodeVersion = nodeVersionResult.stdout.trim()
  if (!isNodeVersionSupported(nodeVersion, definition.runtime?.version ?? '>=20')) {
    updateStep('check-runtime', 'error', `当前 Node 版本 ${nodeVersion || '未知'}，需要 Node.js 20+`)
    return {
      connectorId: input.connectorId,
      success: false,
      steps,
      message: '当前 Node.js 版本不满足要求，请安装 Node.js 20 及以上版本。',
    }
  }
  updateStep('check-runtime', 'success', nodeVersion)

  updateStep('check-package', 'running')
  const commandName = process.platform === 'win32' ? 'talents.cmd' : 'talents'
  let resolvedPath = await resolveCommandPath(commandName, runCommand)
  const alreadyInstalled = Boolean(resolvedPath)
  updateStep('check-package', alreadyInstalled ? 'success' : 'skipped', alreadyInstalled ? '已安装' : '未安装')

  if (!alreadyInstalled) {
    updateStep('install-package', 'running')
    const installCommand = getPlatformCommand(definition.init)
    if (!installCommand) {
      updateStep('install-package', 'error', '当前平台缺少安装命令')
      return {
        connectorId: input.connectorId,
        success: false,
        steps,
        message: '当前平台缺少 CLI 安装命令。',
      }
    }

    const installArgs = parseCommandLine(installCommand)
    const [command, ...args] = installArgs
    if (!command) throw new Error('CLI 安装命令为空')
    const commandText = installArgs.join(' ')
    logCliConnectorInfo('开始安装 talents CLI', { command: commandText })
    const installResult = await runCommand(command, args, { timeoutMs: 180_000 })
    logCliConnectorInfo('安装命令结束', {
      ok: installResult.ok,
      command: commandText,
      message: sanitizeMessage(getLogMessage(installResult), userValues),
    })
    if (!installResult.ok) {
      const message = formatCliInstallError(commandText, installResult, userValues)
      updateStep('install-package', 'error', message)
      return {
        connectorId: input.connectorId,
        success: false,
        steps,
        message: '自动安装失败，请在终端手动执行安装命令后重试。',
      }
    }
    updateStep('install-package', 'success', '安装完成')
    resolvedPath = await resolveTalentsCommandPath(commandName, runCommand)
  } else {
    updateStep('install-package', 'skipped', '已安装，跳过')
  }

  if (!resolvedPath) {
    resolvedPath = await resolveTalentsCommandPath(commandName, runCommand)
  }
  if (!resolvedPath || !isAbsolute(resolvedPath) || !existsSync(resolvedPath)) {
    updateStep('check-package', 'error', '无法定位 talents 可执行文件')
    return {
      connectorId: input.connectorId,
      success: false,
      steps,
      message: 'talents CLI 已安装但无法定位可执行文件，请检查 npm 全局 bin 目录是否在 PATH 中。',
    }
  }
  updateStep('check-package', 'success', resolvedPath)

  updateStep('install-skill', 'running')
  updateStep('install-skill', 'success', '已随连接器启用')

  // 写 runtime.json（hi-agent 和非 hi-agent 都需要）
  writeCliConnectorRuntime(connectorDir, {
    commandPath: resolvedPath,
    binDir: dirname(resolvedPath),
    packageName: '@ht/talents',
    packageVersion: await safeReadTalentsVersion(resolvedPath, runCommand),
  })

  if (isHiAgent) {
    // hi-agent：SkillHub 换票 → 写入 ~/.htskill/auth.json
    updateStep('check-auth', 'running')

    let auth = readUatAuth()
    if (!auth || isExpired(auth)) {
      const newAuth = await getValidUatToken()
      if (!newAuth) {
        updateStep('check-auth', 'error', '换票失败，请先登录 OA 账号')
        return {
          connectorId: input.connectorId,
          success: false,
          steps,
          message: 'SkillHub 换票失败，请先登录 OA 账号。',
        }
      }
      auth = newAuth
    }
    updateStep('check-auth', 'success', '已获取 Token')

    // 自检用 auth.json 的 Token（失败不阻塞）
    updateStep('self-check', 'running')
    const authEnv = resolveCliConnectorEnv(definition, { HTSKILL_TOKEN: auth.accessToken })
    const selfCheck = await safeRunCliStatusCheck(definition, resolvedPath, authEnv, runCommand)
    if (!selfCheck.ok) {
      logCliConnectorInfo('[self-check] 失败（忽略）', { message: sanitizeMessage(getCommandMessage(selfCheck), { HTSKILL_TOKEN: auth.accessToken }) })
      updateStep('self-check', 'skipped', '自检失败，跳过')
    } else {
      updateStep('self-check', 'success', '连接成功')
    }
  } else {
    // 非 hi-agent：走 secrets.json
    updateStep('write-config', 'running')
    writeCliConnectorSecrets(connectorDir, definition, userValues)
    updateStep('write-config', 'success', '已保存')

    updateStep('self-check', 'running')
    const resolvedEnv = resolveCliConnectorEnv(definition, userValues)
    const selfCheck = await safeRunCliStatusCheck(definition, resolvedPath, resolvedEnv, runCommand)
    if (!selfCheck.ok) {
      logCliConnectorInfo('[self-check] 失败（忽略）', { message: sanitizeMessage(getCommandMessage(selfCheck), userValues) })
      updateStep('self-check', 'skipped', '自检失败，跳过')
    } else {
      updateStep('self-check', 'success', '连接成功')
    }
  }

  connectorDef.enabled = true
  saveWorkspaceConnectorsConfig(workspaceSlug, connectorsConfig)

  return {
    connectorId: input.connectorId,
    success: true,
    steps,
    message: '泰为 hiagent 连接器初始化完成。',
  }
}

async function resolveTalentsCommandPath(commandName: string, runCommand: (command: string, args: string[], options?: CommandOptions) => Promise<CommandResult>): Promise<string | null> {
  const direct = await resolveCommandPath(commandName, runCommand)
  if (direct) return direct

  const npmBin = await resolveNpmGlobalBin(runCommand)
  if (!npmBin) return null
  const candidate = join(npmBin, commandName)
  return existsSync(candidate) ? candidate : null
}

async function resolveNpmGlobalBin(runCommand: (command: string, args: string[], options?: CommandOptions) => Promise<CommandResult>): Promise<string | null> {
  logCliConnectorInfo('[resolve-path] 执行命令', { command: 'npm bin -g' })
  const binResult = await runCommand('npm', ['bin', '-g'])
  logCliConnectorInfo('[resolve-path] 命令结果', { command: 'npm bin -g', ok: binResult.ok, stdout: binResult.stdout.trim() })
  const binPath = binResult.stdout.trim()
  if (binResult.ok && binPath && existsSync(binPath)) return binPath

  logCliConnectorInfo('[resolve-path] 执行命令', { command: 'npm prefix -g' })
  const prefixResult = await runCommand('npm', ['prefix', '-g'])
  logCliConnectorInfo('[resolve-path] 命令结果', { command: 'npm prefix -g', ok: prefixResult.ok, stdout: prefixResult.stdout.trim() })
  const prefix = prefixResult.stdout.trim()
  if (!prefixResult.ok || !prefix) return null
  const candidate = process.platform === 'win32' ? prefix : join(prefix, 'bin')
  return existsSync(candidate) ? candidate : null
}

async function readTalentsVersion(commandPath: string, runCommand: (command: string, args: string[], options?: CommandOptions) => Promise<CommandResult>): Promise<string | undefined> {
  logCliConnectorInfo('[write-runtime] 执行命令', { commandPath, args: '-V' })
  const result = await runCommand(commandPath, ['-V'])
  logCliConnectorInfo('[write-runtime] 命令结果', { commandPath, args: '-V', ok: result.ok, stdout: (result.stdout || result.stderr).trim() })
  const version = (result.stdout || result.stderr).trim()
  return result.ok && version ? version : undefined
}

async function safeReadTalentsVersion(
  commandPath: string,
  runCommand: (command: string, args: string[], options?: CommandOptions) => Promise<CommandResult>,
): Promise<string | undefined> {
  try {
    return await readTalentsVersion(commandPath, runCommand)
  } catch (err) {
    logCliConnectorInfo('读取 talents 版本失败，跳过', { commandPath, error: (err as Error).message })
    return undefined
  }
}

async function safeRunCliStatusCheck(
  definition: ReturnType<typeof readCliConnectorDefinition>,
  commandPath: string,
  env: Record<string, string>,
  runCommand: (command: string, args: string[], options?: CommandOptions) => Promise<CommandResult>,
): Promise<CommandResult> {
  try {
    return await runCliStatusCheck(definition, commandPath, env, runCommand)
  } catch (err) {
    logCliConnectorInfo('[self-check] 命令执行异常', { commandPath, error: (err as Error).message })
    return { ok: false, stdout: '', stderr: (err as Error).message }
  }
}

async function runCliStatusCheck(
  definition: ReturnType<typeof readCliConnectorDefinition>,
  commandPath: string,
  env: Record<string, string>,
  runCommand: (command: string, args: string[], options?: CommandOptions) => Promise<CommandResult>,
): Promise<CommandResult> {
  const statusCommand = getPlatformCommand(definition.status)
  if (!statusCommand) return { ok: true, stdout: '', stderr: '' }
  const parts = parseCommandLine(statusCommand)
  if (parts.length === 0) return { ok: true, stdout: '', stderr: '' }
  const [, ...args] = parts
  logCliConnectorInfo('[self-check] 执行命令', { commandPath, args: args.join(' '), envKeys: Object.keys(env) })
  const result = await runCommand(commandPath, args, { env, timeoutMs: 120_000 })
  logCliConnectorInfo('[self-check] 命令结果', { commandPath, args: args.join(' '), ok: result.ok, stderr: result.stderr.trim() })
  return result
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
