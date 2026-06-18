import type { McpServerEntry } from '@proma/shared'

export type DefaultConnectorId = 'personal-email' | 'feishu-cli'

export interface DefaultConnectorDefinition {
  id: DefaultConnectorId
  name: string
  description: string
  category: string
}

export interface HuataiEmailInput {
  emailAddress: string
  password: string
}

export const FEISHU_CLI_LAUNCHER_URL = 'https://open.feishu.cn/page/launcher'
export const FEISHU_CLI_AUTHORIZATION_URL = 'https://open.feishu.cn/page/scope-authorization?flow_id=ONNIOI34K0DKOOOOOOOOOO0umZsB_36aD8yNE75ueqQ-'

export const DEFAULT_CONNECTOR_DEFINITIONS: readonly DefaultConnectorDefinition[] = [
  {
    id: 'personal-email',
    name: '华泰邮箱',
    category: '邮件服务',
    description: '绑定华泰邮箱后，Agent 可读取邮件主题、发件人和正文内容，辅助整理邮件与提炼信息。',
  },
  {
    id: 'feishu-cli',
    name: '飞书 CLI',
    category: '办公协同',
    description: '通过飞书开放平台创建智能体应用并完成用户授权，为后续飞书 CLI 能力接入做准备。',
  },
]

export function buildHuataiEmailMcpEntry(input: HuataiEmailInput): McpServerEntry {
  const emailAddress = input.emailAddress.trim()
  return {
    type: 'stdio',
    command: 'mcp-email-server',
    env: {
      MCP_EMAIL_SERVER_ACCOUNT_NAME: 'htsc',
      MCP_EMAIL_SERVER_EMAIL_ADDRESS: emailAddress,
      MCP_EMAIL_SERVER_PASSWORD: input.password.trim(),
      MCP_EMAIL_SERVER_FULL_NAME: emailAddress,
      MCP_EMAIL_SERVER_USER_NAME: emailAddress,
      MCP_EMAIL_SERVER_IMAP_HOST: 'htemail.htsc.com.cn',
      MCP_EMAIL_SERVER_IMAP_PORT: '993',
      MCP_EMAIL_SERVER_IMAP_SSL: 'true',
    },
    enabled: false,
  }
}
