import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { clearConfigDirNameForTest, getWorkspaceMcpPath, getConnectorsConfigPath, getConnectorsDir } from './config-paths'
import { clearConfigRootOverride, setConfigRoot } from './config-root-service'
import { initializeDefaultConnector } from './default-connector-initializer'
import type { WorkspaceMcpConfig, ConnectorsConfig, ConnectorInitProgressEvent } from '@proma/shared'

let root: string
let mockMcpEmailServerPath: string
let mockTalentsPath: string

function readMcp(workspaceSlug: string): WorkspaceMcpConfig {
  return JSON.parse(readFileSync(getWorkspaceMcpPath(workspaceSlug), 'utf-8')) as WorkspaceMcpConfig
}

function readConnectorsConfig(workspaceSlug: string): ConnectorsConfig {
  return JSON.parse(readFileSync(getConnectorsConfigPath(workspaceSlug), 'utf-8')) as ConnectorsConfig
}

describe('initializeDefaultConnector', () => {
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'proma-default-connector-'))
    mockMcpEmailServerPath = join(root, process.platform === 'win32' ? 'mcp-email-server.exe' : 'mcp-email-server')
    mockTalentsPath = join(root, process.platform === 'win32' ? 'talents.cmd' : 'talents')
    writeFileSync(mockMcpEmailServerPath, '', 'utf-8')
    writeFileSync(mockTalentsPath, '', 'utf-8')
    clearConfigRootOverride()
    clearConfigDirNameForTest()
    setConfigRoot(join(root, 'custom-next-run'), { homeDir: root, configDirName: '.workmate-dev' })
    mkdirSync(join(root, '.workmate-dev', 'agent-workspaces', 'default'), { recursive: true })
    // 旧 mcp.json（兼容未迁移工作区）
    writeFileSync(getWorkspaceMcpPath('default'), JSON.stringify({
      servers: {
        docs: {
          type: 'stdio',
          command: 'docs-mcp',
          enabled: true,
        },
      },
    } satisfies WorkspaceMcpConfig, null, 2), 'utf-8')
    // connectors.json（预置条目默认 disabled）
    writeFileSync(getConnectorsConfigPath('default'), JSON.stringify({
      version: '1.0',
      connectors: {
        'huatai-email': {
          type: 'mcp',
          enabled: false,
          source: 'preset',
          displayName: '华泰邮箱',
          serverName: 'email',
        },
        'hi-agent': {
          type: 'cli',
          enabled: false,
          source: 'preset',
          displayName: '泰为 hiagent',
          status: 'available',
        },
      },
    } satisfies ConnectorsConfig, null, 2), 'utf-8')
    mkdirSync(join(getConnectorsDir('default'), 'hi-agent'), { recursive: true })
    writeFileSync(join(getConnectorsDir('default'), 'hi-agent', 'cli.json'), JSON.stringify({
      runtime: { type: 'node', version: '>=20' },
      init: {
        darwin: 'npm install -g @ht/talents-cli',
        linux: 'npm install -g @ht/talents-cli',
        win32: 'npm install -g @ht/talents-cli',
      },
      userProvidedData: [],
      status: {
        darwin: 'talents workspace --json',
        linux: 'talents workspace --json',
        win32: 'talents.cmd workspace --json',
      },
      env: {
        HTSKILL_TOKEN: '{{HTSKILL_TOKEN}}',
        AGENTOS_ENV: 'uat',
      },
    }, null, 2), 'utf-8')
  })

  afterEach(() => {
    clearConfigRootOverride()
    clearConfigDirNameForTest()
    rmSync(root, { recursive: true, force: true })
  })

  test('华泰邮箱初始化会安装缺失包并写入 IMAP-only MCP 配置', async () => {
    const calls: string[] = []
    let installed = false
    const result = await initializeDefaultConnector('default', {
      connectorId: 'huatai-email',
      emailAddress: ' qinxiao@htsc.com ',
      password: ' secret ',
    }, {
      commandExists: async (command) => command === 'python3' || command === 'pip3',
      runCommand: async (command, args) => {
        calls.push([command, ...args].join(' '))
        // where/which mcp-email-server 返回全路径
        const probe = process.platform === 'win32' ? 'where' : 'which'
        if (command === probe && args[0] === 'mcp-email-server') {
          return installed ? { ok: true, stdout: mockMcpEmailServerPath, stderr: '' } : { ok: false, stdout: '', stderr: '' }
        }
        if (command === 'python3' && args.includes('install')) {
          installed = true
        }
        return { ok: true, stdout: '', stderr: '' }
      },
      validateMcpServer: async () => ({ success: true, message: '连接成功' }),
    })

    expect(result.success).toBe(true)
    expect(calls).toContain('python3 -m pip install --disable-pip-version-check --timeout 120 --retries 5 mcp-email-server')
    expect(result.steps.map((step) => [step.id, step.status])).toEqual([
      ['check-python', 'success'],
      ['check-package', 'success'],
      ['install-package', 'success'],
      ['write-config', 'success'],
      ['self-check', 'success'],
    ])
    expect(result.steps.map((step) => step.label)).toEqual([
      '检查 Python 环境',
      '检查邮箱连接环境',
      '准备邮箱连接能力',
      '启用邮箱能力',
      '自检邮箱连接',
    ])

    const config = readMcp('default')
    expect(config.servers.docs).toBeDefined()
    expect(config.servers.email).toEqual({
      type: 'stdio',
      command: mockMcpEmailServerPath,
      args: ['stdio'],
      env: {
        MCP_EMAIL_SERVER_ACCOUNT_NAME: 'htsc',
        MCP_EMAIL_SERVER_EMAIL_ADDRESS: 'qinxiao@htsc.com',
        MCP_EMAIL_SERVER_PASSWORD: 'secret',
        MCP_EMAIL_SERVER_FULL_NAME: 'qinxiao@htsc.com',
        MCP_EMAIL_SERVER_USER_NAME: 'qinxiao@htsc.com',
        MCP_EMAIL_SERVER_IMAP_HOST: 'htemail.htsc.com.cn',
        MCP_EMAIL_SERVER_IMAP_PORT: '993',
        MCP_EMAIL_SERVER_IMAP_SSL: 'true',
      },
      enabled: true,
    })
    expect(Object.keys(config.servers.email?.env ?? {}).some((key) => key.includes('SMTP'))).toBe(false)

    // connectors.json 中 huatai-email 已启用
    const connectorsCfg = readConnectorsConfig('default')
    expect(connectorsCfg.connectors['huatai-email']?.enabled).toBe(true)
  })

  test('mcp-email-server 已在 Python 用户 Scripts 目录时跳过 pip 安装', async () => {
    const calls: string[] = []
    const probe = process.platform === 'win32' ? 'where' : 'which'
    const result = await initializeDefaultConnector('default', {
      connectorId: 'huatai-email',
      emailAddress: 'qinxiao@htsc.com',
      password: 'secret',
    }, {
      commandExists: async (command) => command === 'python3' || command === 'pip3',
      runCommand: async (command, args) => {
        calls.push([command, ...args].join(' '))
        if (command === probe && args[0] === 'mcp-email-server') {
          return { ok: false, stdout: '', stderr: '' }
        }
        if (command === 'python3' && args[0] === '-c') {
          return { ok: true, stdout: `${mockMcpEmailServerPath}\n`, stderr: '' }
        }
        return { ok: true, stdout: '', stderr: '' }
      },
      validateMcpServer: async () => ({ success: true, message: '连接成功' }),
    })

    expect(result.success).toBe(true)
    expect(calls).toContain(`${probe} mcp-email-server`)
    expect(calls.some((call) => call.includes('pip install'))).toBe(false)
    expect(result.steps.find((step) => step.id === 'check-package')?.message).toBe('已安装')
    expect(result.steps.find((step) => step.id === 'install-package')?.status).toBe('skipped')
    expect(readMcp('default').servers.email?.command).toBe(mockMcpEmailServerPath)
  })

  test('hi-agent 初始化会写入 CLI runtime、SkillHub 换票并启用连接器', async () => {
    const calls: string[] = []
    const probe = process.platform === 'win32' ? 'where' : 'which'
    const result = await initializeDefaultConnector('default', {
      connectorId: 'hi-agent',
      userProvidedData: {},
    }, {
      commandExists: async (command) => command === 'node' || command === 'npm',
      runCommand: async (command, args, options) => {
        calls.push([command, ...args].join(' '))
        if (command === 'node' && args[0] === '-v') {
          return { ok: true, stdout: 'v20.11.0\n', stderr: '' }
        }
        if (command === probe && (args[0] === 'talents' || args[0] === 'talents.cmd')) {
          return { ok: true, stdout: `${mockTalentsPath}\n`, stderr: '' }
        }
        if (command === mockTalentsPath && args[0] === '-V') {
          return { ok: true, stdout: '1.0.2\n', stderr: '' }
        }
        if (command === mockTalentsPath && args.join(' ') === 'workspace --json') {
          // 自检时 Token 来自 SkillHub mock
          return { ok: true, stdout: '{"ok":true}', stderr: '' }
        }
        return { ok: true, stdout: '', stderr: '' }
      },
    })

    expect(result.success).toBe(true)
    expect(result.serverName).toBeUndefined()
    expect(result.steps.map((step) => [step.id, step.status])).toEqual([
      ['check-runtime', 'success'],
      ['check-package', 'success'],
      ['install-package', 'skipped'],
      ['install-skill', 'success'],
      ['check-auth', 'success'],
      ['self-check', 'success'],
    ])
    expect(calls).toContain(`${probe} ${process.platform === 'win32' ? 'talents.cmd' : 'talents'}`)
    const connectorDir = join(getConnectorsDir('default'), 'hi-agent')
    const runtime = JSON.parse(readFileSync(join(connectorDir, 'runtime.json'), 'utf-8')) as { commandPath?: string; binDir?: string; packageName?: string }
    expect(runtime.commandPath).toBe(mockTalentsPath)
    expect(runtime.binDir).toBe(root)
    expect(runtime.packageName).toBe('@ht/talents-cli')

    // hi-agent 不再写 secrets.json
    expect(existsSync(join(connectorDir, 'secrets.json'))).toBe(false)

    const connectorsCfg = readConnectorsConfig('default')
    expect(connectorsCfg.connectors['hi-agent']?.enabled).toBe(true)
  })

  test('hi-agent 初始化步骤变化时推送通用连接器进度事件', async () => {
    const progressEvents: ConnectorInitProgressEvent[] = []
    const probe = process.platform === 'win32' ? 'where' : 'which'

    const result = await initializeDefaultConnector('default', {
      connectorId: 'hi-agent',
      runId: 'run-hi-agent-progress-1',
      userProvidedData: {},
    }, {
      commandExists: async (command) => command === 'node' || command === 'npm',
      runCommand: async (command, args, options) => {
        if (command === 'node' && args[0] === '-v') {
          return { ok: true, stdout: 'v20.11.0\n', stderr: '' }
        }
        if (command === probe && (args[0] === 'talents' || args[0] === 'talents.cmd')) {
          return { ok: true, stdout: `${mockTalentsPath}\n`, stderr: '' }
        }
        if (command === mockTalentsPath && args[0] === '-V') {
          return { ok: true, stdout: '1.0.2\n', stderr: '' }
        }
        if (command === mockTalentsPath && args.join(' ') === 'workspace --json') {
          return { ok: true, stdout: '{"ok":true}', stderr: '' }
        }
        return { ok: true, stdout: '', stderr: '' }
      },
      reportProgress: (event: ConnectorInitProgressEvent) => {
        progressEvents.push(event)
      },
    })

    expect(result.success).toBe(true)
    expect(progressEvents.length).toBeGreaterThan(1)
    expect(progressEvents.every((event) => event.workspaceSlug === 'default')).toBe(true)
    expect(progressEvents.every((event) => event.connectorId === 'hi-agent')).toBe(true)
    expect(progressEvents.every((event) => event.runId === 'run-hi-agent-progress-1')).toBe(true)
    expect(progressEvents[0]?.steps.find((step) => step.id === 'check-runtime')?.status).toBe('running')
    expect(progressEvents.at(-1)?.steps.map((step) => [step.id, step.status])).toEqual([
      ['check-runtime', 'success'],
      ['check-package', 'success'],
      ['install-package', 'skipped'],
      ['install-skill', 'success'],
      ['check-auth', 'success'],
      ['self-check', 'success'],
    ])
    expect(JSON.stringify(progressEvents)).not.toContain('talents-token')
    expect(progressEvents[0]?.steps).not.toBe(progressEvents.at(-1)?.steps)
  })

  test('已安装 mcp-email-server 时跳过安装步骤', async () => {
    const calls: string[] = []
    const result = await initializeDefaultConnector('default', {
      connectorId: 'huatai-email',
      emailAddress: 'qinxiao@htsc.com',
      password: 'secret',
    }, {
      commandExists: async (command) => command === 'python3' || command === 'pip3' || command === 'mcp-email-server',
      runCommand: async (command, args) => {
        calls.push([command, ...args].join(' '))
        const probe = process.platform === 'win32' ? 'where' : 'which'
        if (command === probe && args[0] === 'mcp-email-server') {
          return { ok: true, stdout: mockMcpEmailServerPath, stderr: '' }
        }
        return { ok: true, stdout: '', stderr: '' }
      },
      validateMcpServer: async () => ({ success: true, message: '连接成功' }),
    })

    expect(result.success).toBe(true)
    // 已安装时不调用 pip install，但会调用 where/which 解析全路径
    const probe = process.platform === 'win32' ? 'where' : 'which'
    expect(calls).toEqual([`${probe} mcp-email-server`])
    expect(result.steps.find((step) => step.id === 'install-package')?.status).toBe('skipped')
  })

  test('初始化步骤变化时推送通用连接器进度事件', async () => {
    const progressEvents: ConnectorInitProgressEvent[] = []

    const result = await initializeDefaultConnector('default', {
      connectorId: 'huatai-email',
      runId: 'run-progress-1',
      emailAddress: 'qinxiao@htsc.com',
      password: 'secret',
    }, {
      commandExists: async (command) => command === 'python3' || command === 'pip3' || command === 'mcp-email-server',
      runCommand: async (command, args) => {
        const probe = process.platform === 'win32' ? 'where' : 'which'
        if (command === probe && args[0] === 'mcp-email-server') {
          return { ok: true, stdout: mockMcpEmailServerPath, stderr: '' }
        }
        return { ok: true, stdout: '', stderr: '' }
      },
      validateMcpServer: async () => ({ success: true, message: '连接成功' }),
      reportProgress: (event: ConnectorInitProgressEvent) => {
        progressEvents.push(event)
      },
    })

    expect(result.success).toBe(true)
    expect(progressEvents.length).toBeGreaterThan(1)
    expect(progressEvents.every((event) => event.workspaceSlug === 'default')).toBe(true)
    expect(progressEvents.every((event) => event.connectorId === 'huatai-email')).toBe(true)
    expect(progressEvents.every((event) => event.runId === 'run-progress-1')).toBe(true)
    expect(progressEvents[0]?.steps.find((step) => step.id === 'check-python')?.status).toBe('running')
    expect(progressEvents.at(-1)?.steps.map((step) => [step.id, step.status])).toEqual([
      ['check-python', 'success'],
      ['check-package', 'success'],
      ['install-package', 'skipped'],
      ['write-config', 'success'],
      ['self-check', 'success'],
    ])
    expect(JSON.stringify(progressEvents)).not.toContain('secret')
    expect(progressEvents[0]?.steps).not.toBe(progressEvents.at(-1)?.steps)
  })

  test('安装 mcp-email-server 超时时使用镜像源重试', async () => {
    const calls: string[] = []
    let installAttempts = 0
    let installed = false
    const result = await initializeDefaultConnector('default', {
      connectorId: 'huatai-email',
      emailAddress: 'qinxiao@htsc.com',
      password: 'secret',
    }, {
      commandExists: async (command) => command === 'python3' || command === 'pip3',
      runCommand: async (command, args) => {
        calls.push([command, ...args].join(' '))
        const probe = process.platform === 'win32' ? 'where' : 'which'
        if (command === probe && args[0] === 'mcp-email-server') {
          return installed ? { ok: true, stdout: mockMcpEmailServerPath, stderr: '' } : { ok: false, stdout: '', stderr: '' }
        }
        if (command === 'python3' && args.includes('install')) {
          installAttempts += 1
        }
        if (installAttempts === 1 && command === 'python3' && args.includes('install')) {
          return {
            ok: false,
            stdout: '',
            stderr: "WARNING: Retrying after connection broken by 'ReadTimeoutError'",
          }
        }
        if (installAttempts === 2 && command === 'python3' && args.includes('install')) {
          installed = true
        }
        return { ok: true, stdout: '', stderr: '' }
      },
      validateMcpServer: async () => ({ success: true, message: '连接成功' }),
    })

    expect(result.success).toBe(true)
    const installCalls = calls.filter((call) => call.includes('pip install'))
    expect(installCalls).toEqual([
      'python3 -m pip install --disable-pip-version-check --timeout 120 --retries 5 mcp-email-server',
      'python3 -m pip install --disable-pip-version-check --timeout 120 --retries 5 -i https://pypi.tuna.tsinghua.edu.cn/simple mcp-email-server',
    ])
    expect(result.steps.find((step) => step.id === 'install-package')?.message).toBe('安装完成（已切换镜像源）')
  })

  test('安装失败时输出排查日志且不泄露密码', async () => {
    const originalInfo = console.info
    const logs: string[] = []
    console.info = (...args: unknown[]) => {
      logs.push(args.map((arg) => typeof arg === 'string' ? arg : JSON.stringify(arg)).join(' '))
    }
    try {
      const result = await initializeDefaultConnector('default', {
        connectorId: 'huatai-email',
        emailAddress: 'qinxiao@htsc.com',
        password: 'secret-password',
      }, {
        commandExists: async (command) => command === 'python3' || command === 'pip3',
        runCommand: async () => ({
          ok: false,
          stdout: '',
          stderr: 'WARNING: The repository located at repo.htzq.htsc.com.cn is not a trusted or secure host and is being ignored.',
        }),
        validateMcpServer: async () => ({ success: true, message: '连接成功' }),
      })

      const joinedLogs = logs.join('\n')
      expect(result.success).toBe(false)
      expect(joinedLogs).toContain('[连接器:华泰邮箱]')
      expect(joinedLogs).toContain('workspaceSlug')
      expect(joinedLogs).toContain('python3 -m pip install')
      expect(joinedLogs).toContain('repo.htzq.htsc.com.cn')
      expect(joinedLogs).not.toContain('secret-password')
    } finally {
      console.info = originalInfo
    }
  })

  test('包源找不到 mcp-email-server 时返回明确排查信息', async () => {
    const result = await initializeDefaultConnector('default', {
      connectorId: 'huatai-email',
      emailAddress: 'qinxiao@htsc.com',
      password: 'secret-password',
    }, {
      commandExists: async (command) => command === 'python3' || command === 'pip3',
      runCommand: async () => ({
        ok: false,
        stdout: '',
        stderr: 'ERROR: Could not find a version that satisfies the requirement mcp-email-server (from versions: none)\nERROR: No matching distribution found for mcp-email-server',
      }),
      validateMcpServer: async () => ({ success: true, message: '连接成功' }),
    })

    const stepMessage = result.steps.find((step) => step.id === 'install-package')?.message ?? ''
    expect(result.success).toBe(false)
    expect(stepMessage).toContain('当前 pip 包源找不到 mcp-email-server')
    expect(stepMessage).toContain('可能是公司镜像源未同步或代理限制')
    expect(stepMessage).toContain('原始错误:')
    expect(stepMessage).toContain('No matching distribution found for mcp-email-server')
    expect(stepMessage).not.toContain('secret-password')
  })

  test('安装命令成功但无输出时日志不误报失败', async () => {
    const originalInfo = console.info
    const logs: string[] = []
    let installed = false
    console.info = (...args: unknown[]) => {
      logs.push(args.map((arg) => typeof arg === 'string' ? arg : JSON.stringify(arg)).join(' '))
    }
    try {
      const result = await initializeDefaultConnector('default', {
        connectorId: 'huatai-email',
        emailAddress: 'qinxiao@htsc.com',
        password: 'secret-password',
      }, {
        commandExists: async (command) => command === 'python3' || command === 'pip3',
        runCommand: async (command, args) => {
          const probe = process.platform === 'win32' ? 'where' : 'which'
          if (command === probe && args[0] === 'mcp-email-server') {
            return installed ? { ok: true, stdout: mockMcpEmailServerPath, stderr: '' } : { ok: false, stdout: '', stderr: '' }
          }
          if (command === 'python3' && args[0] === '-c') {
            return { ok: false, stdout: '', stderr: '' }
          }
          if (command === 'python3' && args.includes('install')) {
            installed = true
          }
          return { ok: true, stdout: '', stderr: '' }
        },
        validateMcpServer: async () => ({ success: true, message: '连接成功' }),
      })

      const joinedLogs = logs.join('\n')
      expect(result.success).toBe(true)
      expect(joinedLogs).toContain('命令执行成功（无输出）')
      expect(joinedLogs).not.toContain('安装失败')
    } finally {
      console.info = originalInfo
    }
  })
})
