import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { clearConfigDirNameForTest, getWorkspaceMcpPath } from '../config-paths'
import { clearConfigRootOverride, setConfigRoot } from '../config-root-service'
import { buildMcpServers } from './mcp-builder'

let root: string
function writeWorkspaceMcp(workspaceSlug: string): void {
  writeFileSync(
    getWorkspaceMcpPath(workspaceSlug),
    JSON.stringify({
      servers: {
        email: {
          type: 'stdio',
          command: 'mcp-email-server',
          args: ['stdio'],
          env: { MCP_EMAIL_SERVER_ACCOUNT_NAME: 'htsc' },
          enabled: true,
        },
        docs: {
          type: 'stdio',
          command: 'docs-mcp',
          enabled: true,
        },
        disabled: {
          type: 'stdio',
          command: 'disabled-mcp',
          enabled: false,
        },
      },
    }, null, 2),
    'utf-8',
  )
}

describe('buildMcpServers', () => {
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'proma-mcp-builder-'))
    clearConfigRootOverride()
    clearConfigDirNameForTest()
    setConfigRoot(join(root, 'custom-next-run'), { homeDir: root, configDirName: '.workmate-dev' })
    writeWorkspaceMcp('default')
  })

  afterEach(() => {
    clearConfigRootOverride()
    clearConfigDirNameForTest()
    rmSync(root, { recursive: true, force: true })
  })

  test('未选择连接器时不加载工作区 MCP', () => {
    expect(buildMcpServers('default')).toEqual({})
    expect(buildMcpServers('default', [])).toEqual({})
  })

  test('只加载当前会话选择的工作区 MCP', () => {
    const servers = buildMcpServers('default', ['email'])

    expect(Object.keys(servers)).toEqual(['email'])
    expect(servers.email).toMatchObject({
      type: 'stdio',
      command: 'mcp-email-server',
      args: ['stdio'],
      env: {
        MCP_EMAIL_SERVER_ACCOUNT_NAME: 'htsc',
      },
      required: false,
      startup_timeout_sec: 30,
    })
    expect(servers.docs).toBeUndefined()
  })

  test('不会加载未启用的连接器', () => {
    expect(buildMcpServers('default', ['disabled'])).toEqual({})
  })
})
