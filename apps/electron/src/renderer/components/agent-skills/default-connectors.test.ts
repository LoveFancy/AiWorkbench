import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'bun:test'
import {
  buildHuataiEmailMcpEntry,
  DEFAULT_CONNECTOR_DEFINITIONS,
  FEISHU_CLI_AUTHORIZATION_URL,
  FEISHU_CLI_LAUNCHER_URL,
} from './default-connectors'

const agentSkillsViewSource = readFileSync(join(import.meta.dir, 'AgentSkillsView.tsx'), 'utf-8')

test('默认连接器包含华泰邮箱和飞书 CLI', () => {
  expect(DEFAULT_CONNECTOR_DEFINITIONS.map((connector) => connector.id)).toEqual(['personal-email', 'feishu-cli'])
  expect(DEFAULT_CONNECTOR_DEFINITIONS.map((connector) => connector.name)).toEqual(['华泰邮箱', '飞书 CLI'])
})

test('飞书 CLI 默认连接流程使用指定开放平台地址', () => {
  expect(FEISHU_CLI_LAUNCHER_URL).toBe('https://open.feishu.cn/page/launcher')
  expect(FEISHU_CLI_AUTHORIZATION_URL).toBe('https://open.feishu.cn/page/scope-authorization?flow_id=ONNIOI34K0DKOOOOOOOOOO0umZsB_36aD8yNE75ueqQ-')
})

test('华泰个人邮箱绑定生成 email MCP 配置', () => {
  expect(buildHuataiEmailMcpEntry({
    emailAddress: ' qinxiao@htsc.com ',
    password: ' secret ',
  })).toEqual({
    type: 'stdio',
    command: 'mcp-email-server',
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
    enabled: false,
  })
})

test('华泰个人邮箱绑定文案提示输入密码且仅本地保存', () => {
  expect(agentSkillsViewSource).toContain('密码 *')
  expect(agentSkillsViewSource).toContain('请输入华泰邮箱密码')
  expect(agentSkillsViewSource).toContain('密码只保存在本地 MCP 配置中')
  expect(agentSkillsViewSource).not.toContain('授权码 *')
  expect(agentSkillsViewSource).not.toContain('请输入华泰邮箱授权码')
})
