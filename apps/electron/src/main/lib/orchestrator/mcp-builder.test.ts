import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { clearConfigDirNameForTest, getWorkspaceMcpPath, getConnectorsDir, getConnectorsConfigPath } from '../config-paths'
import { clearConfigRootOverride, setConfigRoot } from '../config-root-service'
import { buildMcpServers, collectConnectorDisabledTools } from './mcp-builder'

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

  test('空 select 参数按未指定处理，加载全部 enabled server', () => {
    writeWorkspaceMcp('default')
    const servers = buildMcpServers('default', undefined, [])
    expect(Object.keys(servers).sort()).toEqual(['docs', 'email'])
  })

  test('只加载指定名称的旧 MCP', () => {
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

  test('连接器兜底加载时空 select 参数按未指定处理', () => {
    writeWorkspaceMcp('default')
    writeConnectorsConfig('default', {
      'huatai-email': {
        type: 'mcp', enabled: true, source: 'preset',
        displayName: '华泰邮箱', serverName: 'email',
      },
    })

    const servers = buildMcpServers('default', undefined, [])
    expect(Object.keys(servers).sort()).toEqual(['docs', 'huatai-email'])
    expect(servers['huatai-email']).toBeDefined()
  })

  test('disabled 连接器不加载，但旧 mcp.json 中同名 server 也不被覆盖', () => {
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

  test('华泰邮箱默认允许保存草稿但从 connector.json 禁用直接发送等高风险工具', () => {
    writeConnectorsConfig('default', {
      'huatai-email': {
        type: 'mcp', enabled: true, source: 'preset',
        displayName: '华泰邮箱', serverName: 'email',
      },
    })
    const connectorDir = join(getConnectorsDir('default'), 'huatai-email')
    mkdirSync(connectorDir, { recursive: true })
    writeFileSync(join(connectorDir, 'connector.json'), JSON.stringify({
      disabledTools: [
        'add_email_account',
        'send_email',
        'delete_emails',
        'mark_emails_as_read',
        'move_emails',
        'archive_emails',
        'download_attachment',
      ],
    }, null, 2), 'utf-8')

    expect(collectConnectorDisabledTools('default')).toEqual([
      'mcp__huatai-email__add_email_account',
      'mcp__huatai-email__send_email',
      'mcp__huatai-email__delete_emails',
      'mcp__huatai-email__mark_emails_as_read',
      'mcp__huatai-email__move_emails',
      'mcp__huatai-email__archive_emails',
      'mcp__huatai-email__download_attachment',
    ])
  })
})
