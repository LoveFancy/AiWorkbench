import { execFile } from 'node:child_process'
import type {
  DefaultConnectorInitStep,
  DefaultConnectorInitStepId,
  InitializeDefaultConnectorInput,
  InitializeDefaultConnectorResult,
  McpServerEntry,
} from '@proma/shared'
import { buildHuataiEmailMcpEntry } from '@proma/shared'
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

/**
 * 解析命令的全路径
 *
 * Windows: where command 返回完整路径（如 C:\Users\...\Scripts\mcp-email-server.exe）
 * Unix: which command 返回完整路径
 */
async function resolveCommandPath(command: string, runCommand: (command: string, args: string[]) => Promise<CommandResult>): Promise<string | null> {
  const probe = process.platform === 'win32' ? 'where' : 'which'
  const result = await runCommand(probe, [command])
  if (!result.ok) return null
  // where/which 可能返回多行，取第一行
  const path = result.stdout.trim().split('\n')[0].trim()
  return path || null
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

  const alreadyInstalled = await commandExists('mcp-email-server')
  setStep(steps, 'check-package', 'success', alreadyInstalled ? '已安装' : '未安装')

  if (alreadyInstalled) {
    setStep(steps, 'install-package', 'skipped', '已安装，跳过')
  } else {
    const installResult = await runCommand(pipCommand, ['install', 'mcp-email-server'])
    if (!installResult.ok) {
      setStep(steps, 'install-package', 'error', installResult.stderr || installResult.stdout || '安装失败')
      return {
        connectorId: input.connectorId,
        serverName: 'email',
        success: false,
        steps,
        message: '安装 mcp-email-server 失败。',
      }
    }
    setStep(steps, 'install-package', 'success', '安装完成')
  }

  // 解析 mcp-email-server 的全路径，避免 PATH 不一致导致后续校验失败
  const resolvedPath = await resolveCommandPath('mcp-email-server', runCommand)
  if (!resolvedPath) {
    setStep(steps, 'check-package', 'error', 'mcp-email-server 安装后无法定位到可执行文件')
    return {
      connectorId: input.connectorId,
      serverName: 'email',
      success: false,
      steps,
      message: 'mcp-email-server 安装后无法定位到可执行文件，请检查 pip 安装路径是否在 PATH 中。',
    }
  }

  const entry = buildHuataiEmailMcpEntry({
    emailAddress: input.emailAddress!,
    password: input.password!,
  })
  // 用全路径替换命令名
  entry.command = resolvedPath
  const config = getWorkspaceMcpConfig(workspaceSlug)
  saveWorkspaceMcpConfig(workspaceSlug, {
    servers: {
      ...config.servers,
      email: entry,
    },
  })
  setStep(steps, 'write-config', 'success', '已写入 email MCP')

  const validation = await validate('email', entry)
  if (!validation.success) {
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

  return {
    connectorId: input.connectorId,
    serverName: 'email',
    success: true,
    steps,
    message: '华泰邮箱连接器初始化完成。',
  }
}
