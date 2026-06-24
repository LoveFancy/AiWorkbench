import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import type { ConnectorsConfig, WorkspaceMcpConfig } from '@proma/shared'
import { getAvailableConnectorsForPicker } from './AgentConnectorPicker'

const source = await Bun.file(join(import.meta.dir, 'AgentConnectorPicker.tsx')).text()

const config: WorkspaceMcpConfig = {
  servers: {
    email: {
      type: 'stdio',
      command: 'mcp-email-server',
      enabled: true,
    },
    docs: {
      type: 'http',
      url: 'https://example.test/mcp',
      enabled: true,
    },
    disabled: {
      type: 'stdio',
      command: 'disabled-mcp',
      enabled: false,
    },
    'memos-cloud': {
      type: 'stdio',
      command: 'memos',
      enabled: true,
    },
  },
}

const connectorsConfig: ConnectorsConfig = {
  version: '1.0',
  connectors: {
    'huatai-email': {
      type: 'mcp',
      enabled: true,
      source: 'preset',
      displayName: '华泰邮箱',
      description: '企业邮箱',
      category: '邮件服务',
      status: 'available',
      serverName: 'email',
      sortOrder: 1,
    },
    'feishu-cli': {
      type: 'cli',
      enabled: false,
      source: 'preset',
      displayName: '飞书 CLI',
      description: '飞书连接器',
      category: '协作',
      status: 'available',
      sortOrder: 2,
    },
    'hiagent-taiwei': {
      type: 'mcp',
      enabled: false,
      source: 'preset',
      displayName: 'HiAgent 泰为',
      description: '泰为连接器',
      category: '智能体',
      status: 'coming-soon',
      sortOrder: 3,
    },
  },
}

describe('AgentConnectorPicker helpers', () => {
  test('只展示已配置或可用的连接器', () => {
    expect(getAvailableConnectorsForPicker(config, connectorsConfig, false).map((item) => item.displayName)).toEqual(['华泰邮箱', '飞书 CLI', 'HiAgent 泰为', 'docs', 'disabled'])
    // 华泰邮箱因为有 email entry 所以 isConfigured=true；docs 也是自定义连接器，isConfigured=true
    expect(getAvailableConnectorsForPicker(config, connectorsConfig, false).filter((item) => item.isConfigured).map((item) => item.name)).toEqual(['email', 'docs', 'disabled'])
  })

  test('按名称和目标地址搜索连接器', () => {
    expect(getAvailableConnectorsForPicker(config, connectorsConfig, false, 'mail').map((item) => item.name)).toEqual(['email'])
    expect(getAvailableConnectorsForPicker(config, connectorsConfig, false, '飞书').map((item) => item.displayName)).toEqual(['飞书 CLI'])
    expect(getAvailableConnectorsForPicker(config, connectorsConfig, false, 'example').map((item) => item.name)).toEqual(['docs'])
  })

  test('连接器入口使用图标激活态，不展示文字和数量', () => {
    expect(source).toContain('更多连接器')
    expect(source).toContain('aria-label="连接器"')
    expect(source).toContain('<p>连接器</p>')
    expect(source).not.toContain('连应用')
    expect(source).not.toContain('connectors.filter((c) => c.isConfigured && c.enabled).length')
    expect(source).toContain('连接')
  })

  test('连接器弹层使用紧凑分层布局', () => {
    expect(source).toContain('w-[360px]')
  })
})
