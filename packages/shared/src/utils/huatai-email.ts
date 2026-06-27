import type { McpServerEntry } from '../types/agent'

export interface HuataiEmailInput {
  emailAddress: string
  password: string
  command?: string
  args?: string[]
  extraEnv?: Record<string, string>
}

/**
 * 构建华泰邮箱 MCP 配置条目（读取 + 草稿保存模式）
 * SMTP 仅用于保存草稿；直接发送由连接器 disabledTools 默认禁用。
 */
export function buildHuataiEmailMcpEntry(input: HuataiEmailInput): McpServerEntry {
  if (!input) throw new Error('邮箱配置不能为空')
  const emailAddress = input.emailAddress.trim()
  return {
    type: 'stdio',
    command: input.command ?? 'mcp-email-server',
    args: input.args ?? ['stdio'],
    env: {
      ...input.extraEnv,
      MCP_EMAIL_SERVER_ACCOUNT_NAME: 'htsc',
      MCP_EMAIL_SERVER_EMAIL_ADDRESS: emailAddress,
      MCP_EMAIL_SERVER_PASSWORD: input.password.trim(),
      MCP_EMAIL_SERVER_FULL_NAME: emailAddress,
      MCP_EMAIL_SERVER_USER_NAME: emailAddress,
      MCP_EMAIL_SERVER_IMAP_HOST: 'htemail.htsc.com.cn',
      MCP_EMAIL_SERVER_IMAP_PORT: '993',
      MCP_EMAIL_SERVER_IMAP_SSL: 'true',
      MCP_EMAIL_SERVER_SMTP_HOST: 'htemail.htsc.com.cn',
      MCP_EMAIL_SERVER_SMTP_PORT: '25',
      MCP_EMAIL_SERVER_SMTP_SSL: 'false',
      MCP_EMAIL_SERVER_SMTP_START_SSL: 'true',
      MCP_EMAIL_SERVER_SAVE_TO_SENT: 'true',
    },
    enabled: true,
  }
}
