import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { clearConfigDirNameForTest, getWorkspaceMcpPath } from './config-paths'
import { clearConfigRootOverride, setConfigRoot } from './config-root-service'
import { initializeDefaultConnector } from './default-connector-initializer'
import type { WorkspaceMcpConfig } from '@proma/shared'

let root: string

function readMcp(workspaceSlug: string): WorkspaceMcpConfig {
  return JSON.parse(readFileSync(getWorkspaceMcpPath(workspaceSlug), 'utf-8')) as WorkspaceMcpConfig
}

const MOCK_MCP_EMAIL_SERVER_PATH = process.platform === 'win32'
  ? 'C:\\Users\\test\\AppData\\Local\\Programs\\Python\\Scripts\\mcp-email-server.exe'
  : '/usr/local/bin/mcp-email-server'

describe('initializeDefaultConnector', () => {
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'proma-default-connector-'))
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
  })

  afterEach(() => {
    clearConfigRootOverride()
    clearConfigDirNameForTest()
    rmSync(root, { recursive: true, force: true })
  })

  test('华泰邮箱初始化会安装缺失包并写入 IMAP-only MCP 配置', async () => {
    const calls: string[] = []
    const result = await initializeDefaultConnector('default', {
      connectorId: 'personal-email',
      emailAddress: ' qinxiao@htsc.com ',
      password: ' secret ',
    }, {
      commandExists: async (command) => command === 'python3' || command === 'pip3',
      runCommand: async (command, args) => {
        calls.push([command, ...args].join(' '))
        // where/which mcp-email-server 返回全路径
        const probe = process.platform === 'win32' ? 'where' : 'which'
        if (command === probe && args[0] === 'mcp-email-server') {
          return { ok: true, stdout: MOCK_MCP_EMAIL_SERVER_PATH, stderr: '' }
        }
        return { ok: true, stdout: '', stderr: '' }
      },
      validateMcpServer: async () => ({ success: true, message: '连接成功' }),
    })

    expect(result.success).toBe(true)
    expect(calls).toContain('pip3 install mcp-email-server')
    expect(result.steps.map((step) => [step.id, step.status])).toEqual([
      ['check-python', 'success'],
      ['check-package', 'success'],
      ['install-package', 'success'],
      ['write-config', 'success'],
      ['self-check', 'success'],
    ])

    const config = readMcp('default')
    expect(config.servers.docs).toBeDefined()
    expect(config.servers.email).toEqual({
      type: 'stdio',
      command: MOCK_MCP_EMAIL_SERVER_PATH,
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
  })

  test('已安装 mcp-email-server 时跳过安装步骤', async () => {
    const calls: string[] = []
    const result = await initializeDefaultConnector('default', {
      connectorId: 'personal-email',
      emailAddress: 'qinxiao@htsc.com',
      password: 'secret',
    }, {
      commandExists: async (command) => command === 'python3' || command === 'pip3' || command === 'mcp-email-server',
      runCommand: async (command, args) => {
        calls.push([command, ...args].join(' '))
        const probe = process.platform === 'win32' ? 'where' : 'which'
        if (command === probe && args[0] === 'mcp-email-server') {
          return { ok: true, stdout: MOCK_MCP_EMAIL_SERVER_PATH, stderr: '' }
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
})
