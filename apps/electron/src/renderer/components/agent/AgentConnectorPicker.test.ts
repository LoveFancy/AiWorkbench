import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import type { WorkspaceMcpConfig } from '@proma/shared'
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

describe('AgentConnectorPicker helpers', () => {
  test('只展示已配置或可用的连接器', () => {
    expect(getAvailableConnectorsForPicker(config).map((item) => item.displayName)).toEqual(['华泰邮箱', '飞书 CLI', 'HiAgent 泰为', 'docs'])
    // 华泰邮箱因为有 email entry 所以 isConfigured=true；docs 也是自定义连接器，isConfigured=true
    expect(getAvailableConnectorsForPicker(config).filter((item) => item.isConfigured).map((item) => item.name)).toEqual(['email', 'docs'])
  })

  test('按名称和目标地址搜索连接器', () => {
    expect(getAvailableConnectorsForPicker(config, 'mail').map((item) => item.name)).toEqual(['email'])
    expect(getAvailableConnectorsForPicker(config, '飞书').map((item) => item.displayName)).toEqual(['飞书 CLI'])
    expect(getAvailableConnectorsForPicker(config, 'example').map((item) => item.name)).toEqual(['docs'])
  })

  test('连接器入口包含更多连接器和状态文案', () => {
    expect(source).toContain('更多连接器')
    expect(source).toContain('连接应用')
    expect(source).toContain('连应用')
    expect(source).toContain('连接')
  })

  test('连接器弹层使用紧凑分层布局', () => {
    expect(source).toContain('w-[360px]')
  })
})