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

interface CommandResult {
  ok: boolean
  stdout: string
  stderr: string
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

const PIP_INSTALL_BASE_ARGS = ['-m', 'pip', 'install', '--disable-pip-version-check', '--timeout', '120', '--retries', '5']
const PYPI_MIRROR_URL = 'https://pypi.tuna.tsinghua.edu.cn/simple'
const LOG_PREFIX = '[连接器:华泰邮箱]'

const EMAIL_STEP_LABELS = {
  'check-python': '检查 Python 环境',
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
      resolve({
        ok: !error,
        stdout: stdout.toString(),
        stderr: stderr.toString(),
      })
    })
  })
}

/**
 * 解析命令的全路径
 *
 * Windows: where command 返回完整路径（如 C:\Users\...\Scripts\mcp-email-server.exe）
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

function isLikelyNetworkInstallError(result: CommandResult): boolean {
  const message = getCommandMessage(result)
  return /ReadTimeout|timeout|timed out|Connection.*broken|Temporary failure|Network is unreachable|Connection reset|SSL/i.test(message)
}

async function installEmailServer(pythonCommand: string, runCommand: (command: string, args: string[], options?: CommandOptions) => Promise<CommandResult>): Promise<{ ok: boolean; message: string }> {
  const firstArgs = [...PIP_INSTALL_BASE_ARGS, 'mcp-email-server']
  logConnectorInfo('开始安装 mcp-email-server', { command: [pythonCommand, ...firstArgs].join(' ') })
  const firstResult = await runCommand(pythonCommand, firstArgs)
  logConnectorInfo('安装命令结束', {
    ok: firstResult.ok,
    command: [pythonCommand, ...firstArgs].join(' '),
    message: getLogMessage(firstResult),
  })
  if (firstResult.ok) return { ok: true, message: '安装完成' }
  if (!isLikelyNetworkInstallError(firstResult)) {
    return { ok: false, message: getCommandMessage(firstResult) }
  }

  const mirrorArgs = [...PIP_INSTALL_BASE_ARGS, '-i', PYPI_MIRROR_URL, 'mcp-email-server']
  logConnectorInfo('默认源疑似网络失败，切换镜像源重试', { command: [pythonCommand, ...mirrorArgs].join(' ') })
  const mirrorResult = await runCommand(pythonCommand, mirrorArgs)
  logConnectorInfo('镜像源安装命令结束', {
    ok: mirrorResult.ok,
    command: [pythonCommand, ...mirrorArgs].join(' '),
    message: getLogMessage(mirrorResult),
  })
  if (mirrorResult.ok) return { ok: true, message: '安装完成（已切换镜像源）' }
  return { ok: false, message: getCommandMessage(mirrorResult) }
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

  const commandExists = deps.commandExists ?? defaultCommandExists
  const runCommand = deps.runCommand ?? defaultRunCommand
  const validate = deps.validateMcpServer ?? (async (name, entry) => {
    const result = await validateMcpServer(name, entry)
    return { success: result.valid, message: result.valid ? '连接成功' : (result.reason ?? '连接失败') }
  })
  const steps = makeSteps()
  const updateStep = createConnectorStepUpdater(workspaceSlug, input, deps, steps)

  updateStep('check-python', 'running')

  // 从连接器配置读取 serverName
  const connectorsConfig = getWorkspaceConnectorsConfig(workspaceSlug)
  const connectorDef = connectorsConfig.connectors[input.connectorId]
  const serverName = connectorDef?.serverName ?? input.connectorId

  const pythonCommand = await findFirstAvailable(['python3', 'python'], commandExists)
  const pipCommand = await findFirstAvailable(['pip3', 'pip'], commandExists)
  if (!pythonCommand || !pipCommand) {
    logConnectorInfo('Python 环境检查失败', { pythonCommand, pipCommand })
    updateStep('check-python', 'error', '未检测到可用的 Python 或 pip')
    return {
      connectorId: input.connectorId,
      serverName,
      success: false,
      steps,
      message: '未检测到可用的 Python 或 pip，请先安装 Python。',
    }
  }
  updateStep('check-python', 'success', `${pythonCommand} / ${pipCommand}`)
  logConnectorInfo('Python 环境检查完成', { pythonCommand, pipCommand })

  updateStep('check-package', 'running')
  const alreadyInstalled = await commandExists('mcp-email-server')
  updateStep('check-package', 'success', alreadyInstalled ? '已安装' : '未安装')
  logConnectorInfo('mcp-email-server 安装状态', { alreadyInstalled })

  if (alreadyInstalled) {
    updateStep('install-package', 'skipped', '已安装，跳过')
  } else {
    updateStep('install-package', 'running')
    const installResult = await installEmailServer(pythonCommand, runCommand)
    if (!installResult.ok) {
      logConnectorInfo('mcp-email-server 安装失败', { message: installResult.message })
      updateStep('install-package', 'error', installResult.message)
      return {
        connectorId: input.connectorId,
        serverName,
        success: false,
        steps,
        message: '准备华泰邮箱连接能力失败。',
      }
    }
    updateStep('install-package', 'success', installResult.message)
    logConnectorInfo('mcp-email-server 安装完成', { message: installResult.message })
  }

  // 解析 mcp-email-server 的全路径，避免 PATH 不一致导致后续校验失败
  const resolvedPath = await resolveCommandPath('mcp-email-server', runCommand)
  if (!resolvedPath) {
    updateStep('check-package', 'error', '邮箱连接能力准备完成后无法定位可执行文件')
    return {
      connectorId: input.connectorId,
      serverName,
      success: false,
      steps,
      message: '邮箱连接能力准备完成后无法定位可执行文件，请检查 pip 安装路径是否在 PATH 中。',
    }
  }

  // 校验可执行文件路径
  if (!isAbsolute(resolvedPath) || !existsSync(resolvedPath)) {
    updateStep('check-package', 'error', `邮箱连接可执行文件路径无效: ${resolvedPath}`)
    return {
      connectorId: input.connectorId,
      serverName,
      success: false,
      steps,
      message: '邮箱连接可执行文件路径无效。',
    }
  }

  const entry = buildHuataiEmailMcpEntry({
    emailAddress: input.emailAddress!,
    password: input.password!,
  })
  // 用全路径替换命令名
  entry.command = resolvedPath

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
    saveWorkspaceConnectorsConfig(workspaceSlug, connectorsConfig)
  }

  updateStep('write-config', 'success', '已启用华泰邮箱读取能力')
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

async function initializeCliConnector(
  workspaceSlug: string,
  input: InitializeDefaultConnectorInput,
  deps: InitializerDeps = {},
): Promise<InitializeDefaultConnectorResult> {
  const commandExists = deps.commandExists ?? defaultCommandExists
  const runCommand = deps.runCommand ?? defaultRunCommand
  const steps = makeCliSteps()
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

  const nodeVersionResult = await runCommand('node', ['-v'])
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
    const installResult = await runCommand(command, args, { timeoutMs: 180_000 })
    if (!installResult.ok) {
      updateStep('install-package', 'error', sanitizeMessage(getCommandMessage(installResult), userValues))
      return {
        connectorId: input.connectorId,
        success: false,
        steps,
        message: '安装 talents CLI 失败。',
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
  updateStep('write-config', 'running')
  writeCliConnectorRuntime(connectorDir, {
    commandPath: resolvedPath,
    binDir: dirname(resolvedPath),
    packageName: '@ht/talents-cli',
    packageVersion: await readTalentsVersion(resolvedPath, runCommand),
  })
  writeCliConnectorSecrets(connectorDir, definition, userValues)
  updateStep('write-config', 'success', '已保存')

  updateStep('self-check', 'running')
  const resolvedEnv = resolveCliConnectorEnv(definition, userValues)
  const selfCheck = await runCliStatusCheck(definition, resolvedPath, resolvedEnv, runCommand)
  if (!selfCheck.ok) {
    const message = sanitizeMessage(getCommandMessage(selfCheck), userValues) || 'Talents Token 校验失败'
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
  const binResult = await runCommand('npm', ['bin', '-g'])
  const binPath = binResult.stdout.trim()
  if (binResult.ok && binPath && existsSync(binPath)) return binPath

  const prefixResult = await runCommand('npm', ['prefix', '-g'])
  const prefix = prefixResult.stdout.trim()
  if (!prefixResult.ok || !prefix) return null
  const candidate = process.platform === 'win32' ? prefix : join(prefix, 'bin')
  return existsSync(candidate) ? candidate : null
}

async function readTalentsVersion(commandPath: string, runCommand: (command: string, args: string[], options?: CommandOptions) => Promise<CommandResult>): Promise<string | undefined> {
  const result = await runCommand(commandPath, ['-V'])
  const version = (result.stdout || result.stderr).trim()
  return result.ok && version ? version : undefined
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
  return runCommand(commandPath, args, { env, timeoutMs: 120_000 })
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
