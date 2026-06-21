import type { McpServerEntry } from '@proma/shared'

export type DefaultConnectorId = 'personal-email' | 'feishu-cli' | 'hiagent-taiwei'

export interface DefaultConnectorDefinition {
  id: DefaultConnectorId
  name: string
  description: string
  category: string
  status: 'available' | 'coming-soon'
}

export interface HuataiEmailInput {
  emailAddress: string
  password: string
}

export const DEFAULT_CONNECTOR_DEFINITIONS: readonly DefaultConnectorDefinition[] = [
  {
    id: 'personal-email',
    name: '华泰邮箱',
    category: '邮件服务',
    description: '绑定华泰邮箱后，Agent 可读取邮件主题、发件人和正文内容，辅助整理邮件与提炼信息。',
    status: 'available',
  },
  {
    id: 'feishu-cli',
    name: '飞书 CLI',
    category: '办公协同',
    description: '飞书消息、云文档、日历和任务等办公协同能力正在准备中。',
    status: 'coming-soon',
  },
  {
    id: 'hiagent-taiwei',
    name: 'HiAgent 泰为',
    category: '企业智能体',
    description: '企业智能体连接能力正在准备中。',
    status: 'coming-soon',
  },
]

export function buildHuataiEmailMcpEntry(input: HuataiEmailInput): McpServerEntry {
  const emailAddress = input.emailAddress.trim()
  return {
    type: 'stdio',
    command: 'mcp-email-server',
    args: ['stdio'],
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
    enabled: true,
  }
}
