export { buildHuataiEmailMcpEntry } from '@proma/shared'
export type { HuataiEmailInput } from '@proma/shared'

export type DefaultConnectorId = 'personal-email' | 'feishu-cli' | 'hiagent-taiwei'

export interface DefaultConnectorDefinition {
  id: DefaultConnectorId
  name: string
  description: string
  category: string
  status: 'available' | 'coming-soon'
  serverName?: string
}

export const DEFAULT_CONNECTOR_DEFINITIONS: readonly DefaultConnectorDefinition[] = [
  {
    id: 'personal-email',
    name: '华泰邮箱',
    category: '邮件服务',
    description: '绑定华泰邮箱后，Agent 可读取邮件主题、发件人和正文内容，辅助整理邮件与提炼信息。',
    status: 'available',
    serverName: 'email',
  },
  {
    id: 'feishu-cli',
    name: '飞书 CLI',
    category: '办公协同',
    description: '通过飞书开放平台接入，让 Agent 使用飞书消息、云文档、日历和任务等办公协同能力。',
    status: 'available',
  },
  {
    id: 'hiagent-taiwei',
    name: 'HiAgent 泰为',
    category: '企业智能体',
    description: '企业智能体连接能力正在准备中。',
    status: 'coming-soon',
  },
]

export function getDefaultConnectorServerNames(): Set<string> {
  return new Set(DEFAULT_CONNECTOR_DEFINITIONS.map((connector) => connector.serverName).filter((serverName): serverName is string => Boolean(serverName)))
}
