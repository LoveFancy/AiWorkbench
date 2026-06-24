import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'bun:test'
import { buildHuataiEmailMcpEntry } from '@proma/shared'
import {
  getPresetConnectorDefinitions,
  getPresetConnectorServerNames,
} from './default-connectors'
import type { ConnectorsConfig } from '@proma/shared'

const agentSkillsViewSource = readFileSync(join(import.meta.dir, 'AgentSkillsView.tsx'), 'utf-8')
const mcpCardSource = readFileSync(join(import.meta.dir, 'McpCard.tsx'), 'utf-8')

function makeConfig(connectors: ConnectorsConfig['connectors']): ConnectorsConfig {
  return { version: '1.0', connectors }
}

test('预设连接器从 connectors.json 派生展示定义', () => {
  const config = makeConfig({
    'huatai-email': { type: 'mcp', enabled: false, source: 'preset', displayName: '华泰邮箱', description: '...', category: '邮件服务', status: 'available', serverName: 'email' },
    'feishu-cli': { type: 'cli', enabled: false, source: 'preset', displayName: '飞书 CLI', description: '...', category: '办公协同', status: 'available' },
    'hiagent-taiwei': { type: 'mcp', enabled: false, source: 'preset', displayName: '泰为智能体', description: '...', category: '企业智能体', status: 'coming-soon' },
  })
  const defs = getPresetConnectorDefinitions(config)
  expect(defs.map((d) => d.id)).toEqual(['huatai-email', 'feishu-cli', 'hiagent-taiwei'])
  expect(defs.map((d) => d.name)).toEqual(['华泰邮箱', '飞书 CLI', '泰为智能体'])
  expect(defs.map((d) => d.status)).toEqual(['available', 'available', 'coming-soon'])
  expect(defs.map((d) => d.connectorType)).toEqual(['mcp', 'cli', 'mcp'])
})

test('默认泰为智能体连接器使用中文名称并保持未实现状态', () => {
  const hiAgentConnector = JSON.parse(
    readFileSync(join(import.meta.dir, '../../../../default-connectors/hi-agent/connector.json'), 'utf-8'),
  ) as { displayName?: string; status?: string; version?: string }

  expect(hiAgentConnector.displayName).toBe('泰为智能体')
  expect(hiAgentConnector.status).toBe('coming-soon')
  expect(hiAgentConnector.version).toBe('1.0.2')
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

test('华泰个人邮箱绑定文案只说明邮箱能力且不暴露 MCP 实现细节', () => {
  expect(agentSkillsViewSource).toContain('敬请期待')
  expect(agentSkillsViewSource).toContain('cursor-not-allowed')
  expect(agentSkillsViewSource).toContain("const isComingSoon = connector.status === 'coming-soon'")
  expect(agentSkillsViewSource).not.toContain("enabled ? 'cursor-not-allowed opacity-55'")
  expect(agentSkillsViewSource).toContain("getConnectorKindLabel")
  expect(agentSkillsViewSource).toContain("return 'CLI'")
  expect(agentSkillsViewSource).toContain("`MCP · ${getMcpTransportLabel(server.type)}`")
  expect(agentSkillsViewSource).not.toContain('飞书 CLI 连接配置')
  expect(agentSkillsViewSource).not.toContain('HiAgent 泰为连接配置')
  expect(agentSkillsViewSource).toContain('绑定后 WorkMate 可以读取你的华泰邮箱邮件')
  expect(agentSkillsViewSource).toContain('检索邮件内容、整理信息和处理办公协同任务')
  expect(agentSkillsViewSource).toContain('当前邮箱能力')
  expect(agentSkillsViewSource).toContain('密码 *')
  expect(agentSkillsViewSource).toContain('请输入华泰邮箱密码')
  expect(agentSkillsViewSource).toContain('密码只保存在本机，用于连接华泰邮箱，不会上传到云端。')
  expect(agentSkillsViewSource).toContain("event.key === 'Enter'")
  expect(agentSkillsViewSource).toContain("'开始连接'")
  expect(agentSkillsViewSource).toContain('检查邮箱连接环境')
  expect(agentSkillsViewSource).toContain('准备邮箱连接能力')
  expect(agentSkillsViewSource).toContain('启用邮箱能力')
  expect(agentSkillsViewSource).toContain('自检邮箱连接')
  expect(agentSkillsViewSource).toContain('{connector.description}')
  expect(agentSkillsViewSource).not.toContain("`MCP: ${connector.serverName ?? '默认'}")
  expect(agentSkillsViewSource).not.toContain('mcp-email-server')
  expect(agentSkillsViewSource).not.toContain('本地 MCP 配置中')
  expect(agentSkillsViewSource).not.toContain('当前 MCP 配置')
  expect(agentSkillsViewSource).not.toContain('写入当前工作区的')
  expect(agentSkillsViewSource).not.toContain("'完成连接'")
  expect(agentSkillsViewSource).not.toContain('完成连接测试后再启用')
  expect(agentSkillsViewSource).not.toContain('授权码 *')
  expect(agentSkillsViewSource).not.toContain('请输入华泰邮箱授权码')
})

test('华泰个人邮箱绑定只需输入账号前缀并固定 htsc.com 后缀', () => {
  expect(agentSkillsViewSource).toContain("const HUATAI_EMAIL_DOMAIN = 'htsc.com'")
  expect(agentSkillsViewSource).toContain('getHuataiEmailLocalPart')
  expect(agentSkillsViewSource).toContain('fullEmailAddress')
  expect(agentSkillsViewSource).toContain('@{HUATAI_EMAIL_DOMAIN}')
  expect(agentSkillsViewSource).toContain('请输入邮箱前缀')
  expect(agentSkillsViewSource).not.toContain('请输入华泰邮箱账号')
})

test('华泰个人邮箱绑定表单宽度适中且输入框边界清晰', () => {
  expect(agentSkillsViewSource).toContain('mx-auto w-full max-w-[420px]')
  expect(agentSkillsViewSource).toContain('border-border/80 bg-content-area')
  expect(agentSkillsViewSource).toContain('focus-within:border-primary/60')
  expect(agentSkillsViewSource).toContain('focus:border-primary/60')
  expect(agentSkillsViewSource).toContain('className="h-11 w-full rounded-full"')
  expect(agentSkillsViewSource).not.toContain('className="mt-4 h-11 w-full max-w-[420px] rounded-full"')
  expect(agentSkillsViewSource).not.toContain('h-11 w-full rounded-lg border border-input bg-background')
})

test('华泰个人邮箱初始化日志不会撑宽弹窗', () => {
  expect(agentSkillsViewSource).toContain('min-w-0 overflow-hidden')
  expect(agentSkillsViewSource).toContain('className="min-w-0 flex-1 truncate"')
  expect(agentSkillsViewSource).not.toContain('className="truncate">{step.message}</span>')
})

test('连接器卡片清晰展示 CLI 和 MCP transport 类型', () => {
  expect(agentSkillsViewSource).toContain("getConnectorKindLabel")
  expect(agentSkillsViewSource).toContain("return 'CLI'")
  expect(agentSkillsViewSource).toContain("`MCP · ${getMcpTransportLabel(server.type)}`")

  expect(mcpCardSource).toContain("MCP · {TRANSPORT_LABELS[entry.type] ?? entry.type ?? '未知'}")
  expect(mcpCardSource).toContain("stdio: 'STDIO'")
  expect(mcpCardSource).toContain("sse: 'SSE'")
})
