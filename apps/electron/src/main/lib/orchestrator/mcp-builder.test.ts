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

function writeConnectorMcp(workspaceSlug: string, name: string, config: Record<string, unknown>): void {
  const dir = join(getConnectorsDir(workspaceSlug), name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'mcp.json'), JSON.stringify(config, null, 2), 'utf-8')
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

  test('只有旧 mcp.json 时加载全部 enabled server', () => {
    writeWorkspaceMcp('default')
    const servers = buildMcpServers('default')
    expect(Object.keys(servers).sort()).toEqual(['docs', 'email'])
  })

  test('未指定 select 参数时加载全部 enabled server', () => {
    writeWorkspaceMcp('default')
    const servers = buildMcpServers('default')
    expect(Object.keys(servers).sort()).toEqual(['docs', 'email'])
  })

  test('只加载指定名称的旧 MCP', () => {
    writeWorkspaceMcp('default')
    const servers = buildMcpServers('default', undefined, ['email'])
    expect(Object.keys(servers)).toEqual(['email'])
    expect(servers.email).toMatchObject({ type: 'stdio', command: 'mcp-email-server' })
  })

  test('不加载未启用的 server', () => {
    writeWorkspaceMcp('default')
    const servers = buildMcpServers('default', undefined, ['disabled'])
    expect(servers).toEqual({})
  })

  test('连接器从 connectors/{name}/mcp.json 加载（新格式优先）', () => {
    writeWorkspaceMcp('default')
    writeConnectorsConfig('default', {
      'huatai-email': {
        type: 'mcp', enabled: true, source: 'preset',
        displayName: '华泰邮箱', serverName: 'email',
      },
    })
    writeConnectorMcp('default', 'huatai-email', {
      type: 'stdio', command: '/usr/local/bin/mcp-email-server',
      args: ['stdio'],
      env: { MCP_EMAIL_SERVER_ACCOUNT_NAME: 'htsc' },
    })

    const servers = buildMcpServers('default')
    expect(Object.keys(servers).sort()).toEqual(['docs', 'huatai-email'])
    expect(servers['huatai-email']).toBeDefined()
    expect(servers['email']).toBeUndefined() // 被连接器覆盖，不再以旧名出现
  })

  test('连接器无 mcp.json 时从旧 mcp.json 按 serverName 兜底', () => {
    writeWorkspaceMcp('default')
    writeConnectorsConfig('default', {
      'huatai-email': {
        type: 'mcp', enabled: true, source: 'preset',
        displayName: '华泰邮箱', serverName: 'email',
      },
    })
    // 不写 connectors/huatai-email/mcp.json

    const servers = buildMcpServers('default')
    expect(Object.keys(servers).sort()).toEqual(['docs', 'huatai-email'])
    expect(servers['email']).toBeUndefined() // 被连接器覆盖，旧名不再出现
  })

  test('disabled 连接器不加载，但旧 mcp.json 中同名 server 也不被覆盖', () => {
    writeWorkspaceMcp('default')
    writeConnectorsConfig('default', {
      'huatai-email': {
        type: 'mcp', enabled: false, source: 'preset',
        displayName: '华泰邮箱', serverName: 'email',
      },
    })

    // connector disabled → 不进入阶段1 → email 不被 coveredServerNames 标记
    // 阶段2 加载 email 为旧名
    const servers = buildMcpServers('default')
    expect(Object.keys(servers).sort()).toEqual(['docs', 'email'])
    expect(servers.email).toBeDefined()
  })
})
