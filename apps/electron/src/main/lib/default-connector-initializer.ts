import { execFile } from 'node:child_process'
import type {
  DefaultConnectorInitStep,
  DefaultConnectorInitStepId,
  InitializeDefaultConnectorInput,
  InitializeDefaultConnectorResult,
  McpServerEntry,
} from '@proma/shared'
import { getWorkspaceMcpConfig, saveWorkspaceMcpConfig } from './agent-workspace-manager'
import { validateMcpServer } from './mcp-validator'

interface CommandResult {
  ok: boolean
  stdout: string
  stderr: string
}

interface InitializerDeps {
  commandExists?: (command: string) => Promise<boolean>
  runCommand?: (command: string, args: string[]) => Promise<CommandResult>
  validateMcpServer?: (name: string, entry: McpServerEntry) => Promise<{ success: boolean; message: string }>
}

const PIP_INSTALL_BASE_ARGS = ['-m', 'pip', 'install', '--disable-pip-version-check', '--timeout', '120', '--retries', '5']
const PYPI_MIRROR_URL = 'https://pypi.tuna.tsinghua.edu.cn/simple'
const LOG_PREFIX = '[连接器:华泰邮箱]'

const STEP_LABELS: Record<DefaultConnectorInitStepId, string> = {
  'check-python': '检查 Python 环境',
  'check-package': '检查 mcp-email-server',
  'install-package': '安装 mcp-email-server',
  'write-config': '写入 MCP 配置',
  'self-check': '自检连接器',
}

function makeSteps(): DefaultConnectorInitStep[] {
  return (Object.keys(STEP_LABELS) as DefaultConnectorInitStepId[]).map((id) => ({
    id,
    label: STEP_LABELS[id],
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

async function defaultCommandExists(command: string): Promise<boolean> {
  const probe = process.platform === 'win32' ? 'where' : 'which'
  const result = await defaultRunCommand(probe, [command])
  return result.ok
}

function defaultRunCommand(command: string, args: string[]): Promise<CommandResult> {
  return new Promise((resolve) => {
    execFile(command, args, { timeout: 120_000, windowsHide: true }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        stdout: stdout.toString(),
        stderr: stderr.toString(),
      })
    })
  })
}

function buildHuataiEmailMcpEntry(input: Required<Pick<InitializeDefaultConnectorInput, 'emailAddress' | 'password'>>): McpServerEntry {
  const emailAddress = input.emailAddress.trim()
  return {
    type: 'stdio',
    command: 'mcp-email-server',
    args: ['stdio'],
    env: {
      MCP_EMAIL_SERVER_ACCOUNT_NAME: 'htsc',
      MCP_EMAIL_SERVER_EMAIL_ADDRESS: emailAddress,
      MCP_EMAIL_SERVER_PASSWORD: input.password.trim(),
      MCP_EMAIL_SERVER_FULL_NAME: emailAddress,
      MCP_EMAIL_SERVER_USER_NAME: emailAddress,
      MCP_EMAIL_SERVER_IMAP_HOST: 'htemail.htsc.com.cn',
      MCP_EMAIL_SERVER_IMAP_PORT: '993',
      MCP_EMAIL_SERVER_IMAP_SSL: 'true',
    },
    enabled: true,
  }
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

async function installEmailServer(pythonCommand: string, runCommand: (command: string, args: string[]) => Promise<CommandResult>): Promise<{ ok: boolean; message: string }> {
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
  if (input.connectorId !== 'personal-email') {
    throw new Error(`暂不支持初始化连接器: ${input.connectorId}`)
  }
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

  const pythonCommand = await findFirstAvailable(['python3', 'python'], commandExists)
  const pipCommand = await findFirstAvailable(['pip3', 'pip'], commandExists)
  if (!pythonCommand || !pipCommand) {
    logConnectorInfo('Python 环境检查失败', { pythonCommand, pipCommand })
    setStep(steps, 'check-python', 'error', '未检测到可用的 Python 或 pip')
    return {
      connectorId: input.connectorId,
      serverName: 'email',
      success: false,
      steps,
      message: '未检测到可用的 Python 或 pip，请先安装 Python。',
    }
  }
  setStep(steps, 'check-python', 'success', `${pythonCommand} / ${pipCommand}`)
  logConnectorInfo('Python 环境检查完成', { pythonCommand, pipCommand })

  const alreadyInstalled = await commandExists('mcp-email-server')
  setStep(steps, 'check-package', 'success', alreadyInstalled ? '已安装' : '未安装')
  logConnectorInfo('mcp-email-server 安装状态', { alreadyInstalled })

  if (alreadyInstalled) {
    setStep(steps, 'install-package', 'skipped', '已安装，跳过')
  } else {
    const installResult = await installEmailServer(pythonCommand, runCommand)
    if (!installResult.ok) {
      logConnectorInfo('mcp-email-server 安装失败', { message: installResult.message })
      setStep(steps, 'install-package', 'error', installResult.message)
      return {
        connectorId: input.connectorId,
        serverName: 'email',
        success: false,
        steps,
        message: '安装 mcp-email-server 失败。',
      }
    }
    setStep(steps, 'install-package', 'success', installResult.message)
    logConnectorInfo('mcp-email-server 安装完成', { message: installResult.message })
  }

  const entry = buildHuataiEmailMcpEntry({
    emailAddress: input.emailAddress,
    password: input.password,
  })
  const config = getWorkspaceMcpConfig(workspaceSlug)
  saveWorkspaceMcpConfig(workspaceSlug, {
    servers: {
      ...config.servers,
      email: entry,
    },
  })
  setStep(steps, 'write-config', 'success', '已写入 email MCP')
  logConnectorInfo('已写入 MCP 配置', { workspaceSlug, serverName: 'email' })

  const validation = await validate('email', entry)
  if (!validation.success) {
    logConnectorInfo('连接器自检失败', { message: validation.message })
    setStep(steps, 'self-check', 'error', validation.message)
    return {
      connectorId: input.connectorId,
      serverName: 'email',
      success: false,
      steps,
      message: validation.message,
    }
  }
  setStep(steps, 'self-check', 'success', validation.message)
  logConnectorInfo('连接器初始化完成', { workspaceSlug, serverName: 'email' })

  return {
    connectorId: input.connectorId,
    serverName: 'email',
    success: true,
    steps,
    message: '华泰邮箱连接器初始化完成。',
  }
}
