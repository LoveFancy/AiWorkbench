import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'bun:test'
import {
  buildHuataiEmailMcpEntry,
  getPresetConnectorDefinitions,
  getPresetConnectorServerNames,
} from './default-connectors'
import type { ConnectorsConfig } from '@proma/shared'

const agentSkillsViewSource = readFileSync(join(import.meta.dir, 'AgentSkillsView.tsx'), 'utf-8')

function makeConfig(connectors: ConnectorsConfig['connectors']): ConnectorsConfig {
  return { version: '1.0', connectors }
}

test('预设连接器从 connectors.json 派生展示定义', () => {
  const config = makeConfig({
    'huatai-email': { type: 'mcp', enabled: false, source: 'preset', displayName: '华泰邮箱', description: '...', category: '邮件服务', status: 'available', serverName: 'email' },
    'feishu-cli': { type: 'cli', enabled: false, source: 'preset', displayName: '飞书 CLI', description: '...', category: '办公协同', status: 'available' },
    'hiagent-taiwei': { type: 'mcp', enabled: false, source: 'preset', displayName: 'HiAgent 泰为', description: '...', category: '企业智能体', status: 'coming-soon' },
  })
  const defs = getPresetConnectorDefinitions(config)
  expect(defs.map((d) => d.id)).toEqual(['huatai-email', 'feishu-cli', 'hiagent-taiwei'])
  expect(defs.map((d) => d.name)).toEqual(['华泰邮箱', '飞书 CLI', 'HiAgent 泰为'])
  expect(defs.map((d) => d.status)).toEqual(['available', 'available', 'coming-soon'])
  expect(defs.map((d) => d.connectorType)).toEqual(['mcp', 'cli', 'mcp'])
})

test('getPresetConnectorServerNames 只返回有 serverName 的预设连接器', () => {
  const config = makeConfig({
    'huatai-email': { type: 'mcp', enabled: false, source: 'preset', serverName: 'email' },
    'feishu-cli': { type: 'cli', enabled: false, source: 'preset' },
  })
  expect(getPresetConnectorServerNames(config)).toEqual(new Set(['email']))
})

test('null 配置返回空列表', () => {
  expect(getPresetConnectorDefinitions(null)).toEqual([])
  expect(getPresetConnectorServerNames(null)).toEqual(new Set())
})

test('华泰个人邮箱绑定生成 email MCP 配置', () => {
  const entry = buildHuataiEmailMcpEntry({
    emailAddress: ' qinxiao@htsc.com ',
    password: ' secret ',
  })

  expect(entry).toEqual({
    type: 'stdio',
    command: 'mcp-email-server',
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
  expect(Object.keys(entry.env ?? {}).some((key) => key.includes('SMTP'))).toBe(false)
})

test('华泰个人邮箱绑定文案提示输入密码且仅本地保存', () => {
  expect(agentSkillsViewSource).toContain('敬请期待')
  expect(agentSkillsViewSource).toContain('cursor-not-allowed')
  expect(agentSkillsViewSource).not.toContain('飞书 CLI 连接配置')
  expect(agentSkillsViewSource).not.toContain('HiAgent 泰为连接配置')
  expect(agentSkillsViewSource).toContain('密码 *')
  expect(agentSkillsViewSource).toContain('请输入华泰邮箱密码')
  expect(agentSkillsViewSource).toContain('密码只保存在本地 MCP 配置中')
  expect(agentSkillsViewSource).toContain('检查环境')
  expect(agentSkillsViewSource).toContain('安装 mcp-email-server')
  expect(agentSkillsViewSource).toContain('自检连接器')
  expect(agentSkillsViewSource).not.toContain('完成连接测试后再启用')
  expect(agentSkillsViewSource).not.toContain('授权码 *')
  expect(agentSkillsViewSource).not.toContain('请输入华泰邮箱授权码')
})
