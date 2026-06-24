import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { clearConfigDirNameForTest, getWorkspaceMcpPath, getConnectorsDir, getConnectorsConfigPath } from '../config-paths'
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

function writeConnectorsConfig(workspaceSlug: string, connectors: Record<string, unknown>): void {
  const dir = getConnectorsDir(workspaceSlug)
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    getConnectorsConfigPath(workspaceSlug),
    JSON.stringify({ version: '1.0', connectors }, null, 2),
    'utf-8',
  )
}

describe('buildMcpServers', () => {
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'proma-mcp-builder-'))
    clearConfigRootOverride()
    clearConfigDirNameForTest()
    setConfigRoot(join(root, 'custom-next-run'), { homeDir: root, configDirName: '.workmate-dev' })
  })

  afterEach(() => {
    clearConfigRootOverride()
    clearConfigDirNameForTest()
    rmSync(root, { recursive: true, force: true })
  })

  test('无 connectors.json 时加载 mcp.json 中全部 enabled server（向后兼容）', () => {
    writeWorkspaceMcp('default')
    const servers = buildMcpServers('default')
    expect(Object.keys(servers).sort()).toEqual(['docs', 'email'])
  })

  test('未指定 select 参数时加载全部 enabled server', () => {
    writeWorkspaceMcp('default')
    const servers = buildMcpServers('default')
    expect(Object.keys(servers).sort()).toEqual(['docs', 'email'])
  })

  test('select 指定加载部分 server', () => {
    writeWorkspaceMcp('default')
    const servers = buildMcpServers('default', undefined, ['email'])
    expect(Object.keys(servers)).toEqual(['email'])
    expect(servers.email).toMatchObject({ type: 'stdio', command: 'mcp-email-server' })
  })

  test('不加载 mcp.json 中 enabled=false 的 server', () => {
    writeWorkspaceMcp('default')
    const servers = buildMcpServers('default', undefined, ['disabled'])
    expect(servers).toEqual({})
  })

  test('连接器通过 connectors.json 状态过滤并重命名为 connectorId', () => {
    writeWorkspaceMcp('default')
    writeConnectorsConfig('default', {
      'huatai-email': {
        type: 'mcp', enabled: true, source: 'preset',
        displayName: '华泰邮箱', serverName: 'email',
      },
    })

    const servers = buildMcpServers('default')
    // mcp.json 中 'email' 的配置被映射为 connectorId 'huatai-email'
    expect(Object.keys(servers).sort()).toEqual(['docs', 'huatai-email'])
    expect(servers['huatai-email']).toMatchObject({ type: 'stdio', command: 'mcp-email-server' })
    expect(servers['email']).toBeUndefined() // 被连接器重命名，旧名不再出现
  })

  test('连接器从 mcp.json 取配置（connectors/{name}/mcp.json 不再作为配置源）', () => {
    writeWorkspaceMcp('default')
    writeConnectorsConfig('default', {
      'huatai-email': {
        type: 'mcp', enabled: true, source: 'preset',
        displayName: '华泰邮箱', serverName: 'email',
      },
    })

    const servers = buildMcpServers('default')
    expect(Object.keys(servers).sort()).toEqual(['docs', 'huatai-email'])
    expect(servers['email']).toBeUndefined()
  })

  test('disabled 连接器对应的 server 按原始名加载（不被重命名）', () => {
    writeWorkspaceMcp('default')
    writeConnectorsConfig('default', {
      'huatai-email': {
        type: 'mcp', enabled: false, source: 'preset',
        displayName: '华泰邮箱', serverName: 'email',
      },
    })

    // connector disabled → email 不在 serverNameToConnectorId 中
    // → 通过向后兼容路径加载为原始名 'email'
    const servers = buildMcpServers('default')
    expect(Object.keys(servers).sort()).toEqual(['docs', 'email'])
    expect(servers.email).toBeDefined()
  })
})
