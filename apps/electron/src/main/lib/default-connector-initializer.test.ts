import AdmZip from 'adm-zip'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import type { ConnectorInitProgressEvent, ConnectorsConfig, WorkspaceMcpConfig } from '@proma/shared'
import { clearConfigDirNameForTest, getConnectorsConfigPath, getConnectorsDir, getWorkspaceMcpPath } from './config-paths'
import { clearConfigRootOverride, setConfigRoot } from './config-root-service'
import { initializeDefaultConnector } from './default-connector-initializer'

let root: string
let mockTalentsPath: string

function readMcp(workspaceSlug: string): WorkspaceMcpConfig {
  return JSON.parse(readFileSync(getWorkspaceMcpPath(workspaceSlug), 'utf-8')) as WorkspaceMcpConfig
}

function readConnectorsConfig(workspaceSlug: string): ConnectorsConfig {
  return JSON.parse(readFileSync(getConnectorsConfigPath(workspaceSlug), 'utf-8')) as ConnectorsConfig
}

function createHuataiEmailRuntime(workspaceSlug = 'default'): string {
  const runtimeDir = join(getConnectorsDir(workspaceSlug), 'huatai-email', 'runtime')
  mkdirSync(runtimeDir, { recursive: true })
  const runtimePath = join(runtimeDir, 'email-server.cjs')
  writeFileSync(runtimePath, '/* bundled email MCP runtime */\n', 'utf-8')
  return runtimePath
}

describe('initializeDefaultConnector', () => {
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'proma-default-connector-'))
    mockTalentsPath = join(root, process.platform === 'win32' ? 'talents.cmd' : 'talents')
    writeFileSync(mockTalentsPath, '', 'utf-8')
    clearConfigRootOverride()
    clearConfigDirNameForTest()
    setConfigRoot(join(root, 'custom-next-run'), { homeDir: root, configDirName: '.workmate-dev' })
    mkdirSync(join(root, '.workmate-dev', 'agent-workspaces', 'default'), { recursive: true })
    writeFileSync(getWorkspaceMcpPath('default'), JSON.stringify({
      servers: {
        docs: {
          type: 'stdio',
          command: 'docs-mcp',
          enabled: true,
        },
      },
    } satisfies WorkspaceMcpConfig, null, 2), 'utf-8')
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

  test('华泰邮箱初始化使用内置邮箱 MCP runtime 并写入读取和草稿配置', async () => {
    const runtimePath = createHuataiEmailRuntime()
    writeFileSync(join(getConnectorsDir('default'), 'huatai-email', 'connector.json'), JSON.stringify({
      disabledTools: [
        'add_email_account',
        'send_email',
        'save_to_mailbox',
        'delete_emails',
      ],
    }, null, 2), 'utf-8')
    const calls: string[] = []

    const result = await initializeDefaultConnector('default', {
      connectorId: 'huatai-email',
      emailAddress: ' qinxiao@htsc.com ',
      password: ' secret ',
    }, {
      commandExists: async () => {
        throw new Error('内置邮箱 MCP 不应检查系统命令')
      },
      runCommand: async (command, args) => {
        calls.push([command, ...args].join(' '))
        return { ok: false, stdout: '', stderr: '' }
      },
      validateMcpServer: async (_name, entry) => {
        expect(entry.command).toBe(process.execPath)
        expect(entry.args).toEqual([runtimePath, 'stdio'])
        expect(entry.env?.ELECTRON_RUN_AS_NODE).toBe('1')
        expect(entry.env?.MCP_EMAIL_SERVER_SMTP_HOST).toBe('htemail.htsc.com.cn')
        expect(entry.env?.MCP_EMAIL_SERVER_SMTP_PORT).toBe('25')
        expect(entry.env?.MCP_EMAIL_SERVER_SMTP_SSL).toBe('false')
        expect(entry.env?.MCP_EMAIL_SERVER_SMTP_START_SSL).toBe('true')
        return { success: true, message: '连接成功' }
      },
    })

    expect(result.success).toBe(true)
    expect(calls).toEqual([])
    expect(result.steps.map((step) => [step.id, step.status])).toEqual([
      ['check-runtime', 'success'],
      ['check-package', 'success'],
      ['install-package', 'skipped'],
      ['write-config', 'success'],
      ['self-check', 'success'],
    ])
    expect(result.steps.map((step) => step.label)).toEqual([
      '检查内置运行时',
      '检查邮箱连接环境',
      '准备邮箱连接能力',
      '启用邮箱能力',
      '自检邮箱连接',
    ])

    const config = readMcp('default')
    expect(config.servers.docs).toBeDefined()
    expect(config.servers.email).toEqual({
      type: 'stdio',
      command: process.execPath,
      args: [runtimePath, 'stdio'],
      env: {
        ELECTRON_RUN_AS_NODE: '1',
        MCP_EMAIL_SERVER_ACCOUNT_NAME: 'htsc',
        MCP_EMAIL_SERVER_EMAIL_ADDRESS: 'qinxiao@htsc.com',
        MCP_EMAIL_SERVER_PASSWORD: 'secret',
        MCP_EMAIL_SERVER_FULL_NAME: 'qinxiao@htsc.com',
        MCP_EMAIL_SERVER_USER_NAME: 'qinxiao@htsc.com',
        MCP_EMAIL_SERVER_IMAP_HOST: 'htemail.htsc.com.cn',
        MCP_EMAIL_SERVER_IMAP_PORT: '993',
        MCP_EMAIL_SERVER_IMAP_SSL: 'true',
        MCP_EMAIL_SERVER_SMTP_HOST: 'htemail.htsc.com.cn',
        MCP_EMAIL_SERVER_SMTP_PORT: '25',
        MCP_EMAIL_SERVER_SMTP_SSL: 'false',
        MCP_EMAIL_SERVER_SMTP_START_SSL: 'true',
        MCP_EMAIL_SERVER_SAVE_TO_SENT: 'true',
      },
      enabled: true,
    })

    const connectorsCfg = readConnectorsConfig('default')
    expect(connectorsCfg.connectors['huatai-email']?.enabled).toBe(true)

    const connectorMeta = JSON.parse(
      readFileSync(join(getConnectorsDir('default'), 'huatai-email', 'connector.json'), 'utf-8'),
    ) as { disabledTools?: string[] }
    expect(connectorMeta.disabledTools).toContain('send_email')
    expect(connectorMeta.disabledTools).not.toContain('save_to_mailbox')
  })

  test('华泰邮箱缺少内置 runtime 时失败且不尝试 pip 安装', async () => {
    const calls: string[] = []

    const result = await initializeDefaultConnector('default', {
      connectorId: 'huatai-email',
      emailAddress: 'qinxiao@htsc.com',
      password: 'secret',
    }, {
      commandExists: async () => false,
      runCommand: async (command, args) => {
        calls.push([command, ...args].join(' '))
        return { ok: false, stdout: '', stderr: '' }
      },
      validateMcpServer: async () => ({ success: true, message: '连接成功' }),
    })

    const message = result.steps.find((step) => step.id === 'check-runtime')?.message ?? ''
    expect(result.success).toBe(false)
    expect(message).toContain('未找到内置邮箱 MCP 运行时')
    expect(calls.some((call) => call.includes('pip install'))).toBe(false)
    expect(calls).toEqual([])
  })

  test('华泰邮箱初始化步骤变化时推送进度事件且不泄露密码', async () => {
    createHuataiEmailRuntime()
    const progressEvents: ConnectorInitProgressEvent[] = []

    const result = await initializeDefaultConnector('default', {
      connectorId: 'huatai-email',
      runId: 'run-progress-1',
      emailAddress: 'qinxiao@htsc.com',
      password: 'secret',
    }, {
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
    expect(progressEvents[0]?.steps.find((step) => step.id === 'check-runtime')?.status).toBe('running')
    expect(progressEvents.at(-1)?.steps.map((step) => [step.id, step.status])).toEqual([
      ['check-runtime', 'success'],
      ['check-package', 'success'],
      ['install-package', 'skipped'],
      ['write-config', 'success'],
      ['self-check', 'success'],
    ])
    expect(JSON.stringify(progressEvents)).not.toContain('secret')
    expect(progressEvents[0]?.steps).not.toBe(progressEvents.at(-1)?.steps)
  })

  test('hi-agent 初始化使用 SkillHub Token 写入 CLI runtime 且不保存 connector secrets', async () => {
    const calls: string[] = []
    const probe = process.platform === 'win32' ? 'where' : 'which'
    const result = await initializeDefaultConnector('default', {
      connectorId: 'hi-agent',
    }, {
      getSkillHubToken: async () => 'skillhub-token',
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
          expect(options?.env?.HTSKILL_TOKEN).toBe('skillhub-token')
          expect(options?.env?.AGENTOS_ENV).toBe('uat')
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
      ['write-config', 'success'],
      ['self-check', 'success'],
    ])
    expect(calls).toContain(`${probe} ${process.platform === 'win32' ? 'talents.cmd' : 'talents'}`)
    const connectorDir = join(getConnectorsDir('default'), 'hi-agent')
    const runtime = JSON.parse(readFileSync(join(connectorDir, 'runtime.json'), 'utf-8')) as { commandPath?: string; binDir?: string; packageName?: string }
    expect(runtime.commandPath).toBe(mockTalentsPath)
    expect(runtime.binDir).toBe(root)
    expect(runtime.packageName).toBe('@ht/talents-cli')

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
    }, {
      getSkillHubToken: async () => 'skillhub-token',
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
          expect(options?.env?.HTSKILL_TOKEN).toBe('skillhub-token')
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
      ['write-config', 'success'],
      ['self-check', 'success'],
    ])
    expect(JSON.stringify(progressEvents)).not.toContain('skillhub-token')
    expect(progressEvents[0]?.steps).not.toBe(progressEvents.at(-1)?.steps)
  })

  test('hi-agent 安装失败时输出明确命令和原始错误且不泄露 Token', async () => {
    const originalInfo = console.info
    const logs: string[] = []
    const probe = process.platform === 'win32' ? 'where' : 'which'
    console.info = (...args: unknown[]) => {
      logs.push(args.map((arg) => typeof arg === 'string' ? arg : JSON.stringify(arg)).join(' '))
    }
    try {
      const result = await initializeDefaultConnector('default', {
        connectorId: 'hi-agent',
      }, {
        getSkillHubToken: async () => 'talents-secret-token',
        commandExists: async (command) => command === 'node' || command === 'npm',
        runCommand: async (command, args) => {
          if (command === 'node' && args[0] === '-v') {
            return { ok: true, stdout: 'v22.14.0\n', stderr: '' }
          }
          if (command === probe && (args[0] === 'talents' || args[0] === 'talents.cmd')) {
            return { ok: false, stdout: '', stderr: '' }
          }
          if (command === 'npm' && args.join(' ') === 'install -g @ht/talents-cli') {
            return { ok: false, stdout: '', stderr: 'npm ERR! 403 Forbidden talents-secret-token' }
          }
          return { ok: false, stdout: '', stderr: '' }
        },
      })

      const message = result.steps.find((step) => step.id === 'install-package')?.message ?? ''
      const joinedLogs = logs.join('\n')
      expect(result.success).toBe(false)
      expect(message).toContain('安装 talents CLI 失败')
      expect(message).toContain('命令: npm install -g @ht/talents-cli')
      expect(message).toContain('原始错误:')
      expect(message).toContain('npm ERR! 403 Forbidden')
      expect(message).not.toContain('talents-secret-token')
      expect(joinedLogs).toContain('[连接器:泰为 hiagent]')
      expect(joinedLogs).toContain('开始安装 talents CLI')
      expect(joinedLogs).toContain('安装命令结束')
      expect(joinedLogs).not.toContain('talents-secret-token')
    } finally {
      console.info = originalInfo
    }
  })

  test('通用 CLI 初始化支持从 archive 安装华泰 GitLab 连接器', async () => {
    const commandName = process.platform === 'win32' ? 'glab.exe' : 'glab'
    const archive = new AdmZip()
    archive.addFile(`bin/${commandName}`, Buffer.from('#!/bin/sh\n'))
    const archiveBytes = archive.toBuffer()
    const archiveSha256 = createHash('sha256').update(archiveBytes).digest('hex')
    const probe = process.platform === 'win32' ? 'where' : 'which'
    const calls: string[] = []

    const connectorsCfg = readConnectorsConfig('default')
    connectorsCfg.connectors['huatai-gitlab'] = {
      type: 'cli',
      enabled: false,
      source: 'preset',
      displayName: '华泰 GitLab',
      status: 'available',
      skillDirs: ['skills/gitlab-cli'],
    }
    writeFileSync(getConnectorsConfigPath('default'), JSON.stringify(connectorsCfg, null, 2), 'utf-8')

    const connectorDir = join(getConnectorsDir('default'), 'huatai-gitlab')
    mkdirSync(connectorDir, { recursive: true })
    writeFileSync(join(connectorDir, 'cli.json'), JSON.stringify({
      runtime: { type: 'binary', version: '>=1.100.0' },
      command: {
        darwin: 'glab',
        linux: 'glab',
        win32: 'glab.exe',
      },
      install: {
        mode: 'download-archive',
        version: '1.105.0',
        [process.platform]: {
          url: 'mock://glab.zip',
          sha256: archiveSha256,
          binaryPath: `bin/${commandName}`,
        },
      },
      userProvidedData: [
        { name: 'GITLAB_TOKEN', label: 'GitLab Token', type: 'password', required: true },
      ],
      status: {
        darwin: 'glab api user',
        linux: 'glab api user',
        win32: 'glab.exe api user',
      },
      env: {
        GITLAB_HOST: 'gitlab.htzq.htsc.com.cn',
        GITLAB_TOKEN: '{{GITLAB_TOKEN}}',
        GLAB_NO_PROMPT: 'true',
        NO_COLOR: '1',
      },
    }, null, 2), 'utf-8')

    const result = await initializeDefaultConnector('default', {
      connectorId: 'huatai-gitlab',
      userProvidedData: {
        GITLAB_TOKEN: 'gitlab-secret-token',
      },
    }, {
      downloadFile: async (url: string) => {
        expect(url).toBe('mock://glab.zip')
        return archiveBytes
      },
      commandExists: async () => {
        throw new Error('binary archive 连接器不应检查 Node/npm')
      },
      runCommand: async (command, args, options) => {
        calls.push([command, ...args].join(' '))
        if (command === probe && args[0] === commandName) {
          return { ok: false, stdout: '', stderr: '' }
        }
        if (command.endsWith(commandName) && args.join(' ') === '--version') {
          return { ok: true, stdout: 'glab 1.105.0\n', stderr: '' }
        }
        if (command.endsWith(commandName) && args.join(' ') === 'api user') {
          expect(options?.env?.GITLAB_HOST).toBe('gitlab.htzq.htsc.com.cn')
          expect(options?.env?.GITLAB_TOKEN).toBe('gitlab-secret-token')
          expect(options?.env?.GLAB_NO_PROMPT).toBe('true')
          return { ok: true, stdout: '{"username":"qinxiao"}', stderr: '' }
        }
        return { ok: false, stdout: '', stderr: `unexpected command ${command} ${args.join(' ')}` }
      },
    })

    expect(result.success).toBe(true)
    expect(result.message).toBe('华泰 GitLab 连接器初始化完成。')
    expect(calls.some((call) => call.endsWith(`${commandName} api user`))).toBe(true)
    const runtime = JSON.parse(readFileSync(join(connectorDir, 'runtime.json'), 'utf-8')) as { commandPath?: string; binDir?: string; packageName?: string; packageVersion?: string }
    expect(runtime.commandPath).toContain(join('runtime', 'bin', commandName))
    expect(runtime.binDir).toContain(join('runtime', 'bin'))
    expect(runtime.packageName).toBe('glab')
    expect(runtime.packageVersion).toBe('1.105.0')
    expect(existsSync(runtime.commandPath ?? '')).toBe(true)

    const secrets = JSON.parse(readFileSync(join(connectorDir, 'secrets.json'), 'utf-8')) as { data?: Record<string, { value: string }> }
    expect(secrets.data?.GITLAB_TOKEN?.value).toBe('gitlab-secret-token')
    expect(readConnectorsConfig('default').connectors['huatai-gitlab']?.enabled).toBe(true)
  })

  test('archive 安装拒绝不安全的 binaryPath', async () => {
    const commandName = process.platform === 'win32' ? 'glab.exe' : 'glab'
    const archive = new AdmZip()
    archive.addFile(`bin/${commandName}`, Buffer.from('#!/bin/sh\n'))
    const archiveBytes = archive.toBuffer()
    const archiveSha256 = createHash('sha256').update(archiveBytes).digest('hex')

    const connectorsCfg = readConnectorsConfig('default')
    connectorsCfg.connectors['huatai-gitlab'] = {
      type: 'cli',
      enabled: false,
      source: 'preset',
      displayName: '华泰 GitLab',
      status: 'available',
      skillDirs: ['skills/gitlab-cli'],
    }
    writeFileSync(getConnectorsConfigPath('default'), JSON.stringify(connectorsCfg, null, 2), 'utf-8')

    const connectorDir = join(getConnectorsDir('default'), 'huatai-gitlab')
    mkdirSync(connectorDir, { recursive: true })
    writeFileSync(join(connectorDir, 'cli.json'), JSON.stringify({
      runtime: { type: 'binary', version: '>=1.100.0' },
      command: {
        darwin: 'glab',
        linux: 'glab',
        win32: 'glab.exe',
      },
      install: {
        mode: 'download-archive',
        version: '1.105.0',
        [process.platform]: {
          url: 'mock://glab.zip',
          sha256: archiveSha256,
          binaryPath: `..\\${commandName}`,
        },
      },
      userProvidedData: [
        { name: 'GITLAB_TOKEN', label: 'GitLab Token', type: 'password', required: true },
      ],
      env: {
        GITLAB_HOST: 'gitlab.htzq.htsc.com.cn',
        GITLAB_TOKEN: '{{GITLAB_TOKEN}}',
      },
    }, null, 2), 'utf-8')

    const result = await initializeDefaultConnector('default', {
      connectorId: 'huatai-gitlab',
      userProvidedData: {
        GITLAB_TOKEN: 'gitlab-secret-token',
      },
    }, {
      downloadFile: async () => archiveBytes,
      commandExists: async () => {
        throw new Error('binary archive 连接器不应检查 Node/npm')
      },
      runCommand: async () => ({ ok: false, stdout: '', stderr: '' }),
    })

    const installStepMessage = result.steps.find((step) => step.id === 'install-package')?.message ?? ''
    expect(result.success).toBe(false)
    expect(installStepMessage).toContain('安装包路径不安全')
    expect(readConnectorsConfig('default').connectors['huatai-gitlab']?.enabled).toBe(false)
    expect(existsSync(join(connectorDir, 'runtime', 'bin', commandName))).toBe(false)
  })
})
