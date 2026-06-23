import type { McpServerEntry } from '../types/agent'

export interface HuataiEmailInput {
  emailAddress: string
  password: string
}

/**
 * 构建华泰邮箱 MCP 配置条目（IMAP 只读模式）
 * 不包含 SMTP 环境变量，仅暴露读信能力
 */
export function buildHuataiEmailMcpEntry(input: HuataiEmailInput): McpServerEntry {
  if (!input) throw new Error('邮箱配置不能为空')
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