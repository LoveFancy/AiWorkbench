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
const feishuCliConnectorDialogSource = readFileSync(join(import.meta.dir, 'FeishuCliConnectorDialog.tsx'), 'utf-8')
const mcpCardSource = readFileSync(join(import.meta.dir, 'McpCard.tsx'), 'utf-8')

function makeConfig(connectors: ConnectorsConfig['connectors']): ConnectorsConfig {
  return { version: '1.0', connectors }
}

test('预设连接器从 connectors.json 派生展示定义', () => {
  const config = makeConfig({
    'huatai-email': { type: 'mcp', enabled: false, source: 'preset', displayName: '华泰邮箱', description: '...', category: '邮件服务', status: 'available', serverName: 'email' },
    'feishu-cli': { type: 'cli', enabled: false, source: 'preset', displayName: '飞书', description: '...', category: '办公协同', status: 'available' },
    'hi-agent': { type: 'cli', enabled: false, source: 'preset', displayName: '泰为 HiAgent', description: '...', category: '办公协同', status: 'available' },
  })
  const defs = getPresetConnectorDefinitions(config)
  expect(defs.map((d) => d.id)).toEqual(['huatai-email', 'feishu-cli', 'hi-agent'])
  expect(defs.map((d) => d.name)).toEqual(['华泰邮箱', '飞书', '泰为 HiAgent'])
  expect(defs.map((d) => d.status)).toEqual(['available', 'available', 'available'])
  expect(defs.map((d) => d.connectorType)).toEqual(['mcp', 'cli', 'cli'])
})

test('默认泰为 hiagent 连接器已开放 CLI 能力', () => {
  const hiAgentConnector = JSON.parse(
    readFileSync(join(import.meta.dir, '../../../../default-connectors/hi-agent/connector.json'), 'utf-8'),
  ) as { displayName?: string; status?: string; version?: string; type?: string; skillDirs?: string[] }

  expect(hiAgentConnector.displayName).toBe('泰为 HiAgent')
  expect(hiAgentConnector.type).toBe('cli')
  expect(hiAgentConnector.status).toBe('available')
  expect(hiAgentConnector.version).toBe('1.0.4')
  expect(hiAgentConnector.skillDirs).toEqual(['skills/talents-cli'])
})

test('默认华泰 GitLab 连接器固定华泰 host 并通过 glab CLI 接入', () => {
  const gitlabConnector = JSON.parse(
    readFileSync(join(import.meta.dir, '../../../../default-connectors/huatai-gitlab/connector.json'), 'utf-8'),
  ) as { displayName?: string; status?: string; version?: string; type?: string; skillDirs?: string[] }
  const gitlabCli = JSON.parse(
    readFileSync(join(import.meta.dir, '../../../../default-connectors/huatai-gitlab/cli.json'), 'utf-8'),
  ) as {
    packageName?: string
    command?: Record<string, string>
    install?: { version?: string; win32?: { url?: string; sha256?: string; binaryPath?: string } }
    env?: Record<string, string>
  }

  expect(gitlabConnector.displayName).toBe('华泰 GitLab')
  expect(gitlabConnector.type).toBe('cli')
  expect(gitlabConnector.status).toBe('available')
  expect(gitlabConnector.version).toBe('1.0.0')
  expect(gitlabConnector.skillDirs).toEqual(['skills/gitlab-cli'])
  expect(gitlabCli.packageName).toBe('glab')
  expect(gitlabCli.command?.win32).toBe('glab.exe')
  expect(gitlabCli.install?.version).toBe('1.105.0')
  expect(gitlabCli.install?.win32?.url).toContain('gitlab.com/gitlab-org/cli/-/releases/v1.105.0/downloads/glab_1.105.0_windows_amd64.zip')
  expect(gitlabCli.install?.win32?.sha256).toBe('0f2df88d582f697d748f85e382ad378e3c6bfe28e7e45151eb333776132919f1')
  expect(gitlabCli.install?.win32?.binaryPath).toBe('bin/glab.exe')
  expect(gitlabCli.env?.GITLAB_HOST).toBe('gitlab.htzq.htsc.com.cn')
  expect(gitlabCli.env?.GITLAB_TOKEN).toBe('{{GITLAB_TOKEN}}')
  expect(gitlabCli.env?.GLAB_NO_PROMPT).toBe('true')
})

test('飞书和泰为连接器展示 UAT 环境标签', () => {
  const feishuConnector = JSON.parse(
    readFileSync(join(import.meta.dir, '../../../../default-connectors/feishu-cli/connector.json'), 'utf-8'),
  ) as { displayName?: string; version?: string }

  expect(feishuConnector.displayName).toBe('飞书')
  expect(feishuConnector.version).toBe('1.0.2')
  expect(agentSkillsViewSource).toContain("const UAT_CONNECTOR_IDS = new Set(['feishu-cli', 'hi-agent'])")
  expect(agentSkillsViewSource).toContain('isUatConnector')
  expect(agentSkillsViewSource).toContain('UAT')
})

test('连接器弹窗使用新的飞书和泰为展示名称', () => {
  expect(feishuCliConnectorDialogSource).toContain('飞书已连接')
  expect(feishuCliConnectorDialogSource).toContain('飞书连接器')
  expect(feishuCliConnectorDialogSource).toContain('一键连接飞书，Agent 将获得飞书办公协同能力。')
  expect(feishuCliConnectorDialogSource).not.toContain('飞书 CLI 已连接')
  expect(feishuCliConnectorDialogSource).not.toContain('飞书 CLI 连接器')

  expect(agentSkillsViewSource).toContain('泰为 HiAgent 连接器初始化失败')
  expect(agentSkillsViewSource).toContain('连接泰为 HiAgent')
  expect(agentSkillsViewSource).toContain('泰为 HiAgent')
  expect(agentSkillsViewSource).not.toContain('泰为 hiagent 连接器初始化失败')
  expect(agentSkillsViewSource).not.toContain('连接泰为 hiagent')
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

test('华泰个人邮箱绑定生成支持草稿保存的 email MCP 配置', () => {
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
      MCP_EMAIL_SERVER_SMTP_HOST: 'htemail.htsc.com.cn',
      MCP_EMAIL_SERVER_SMTP_PORT: '25',
      MCP_EMAIL_SERVER_SMTP_SSL: 'false',
      MCP_EMAIL_SERVER_SMTP_START_SSL: 'true',
      MCP_EMAIL_SERVER_SAVE_TO_SENT: 'true',
    },
    enabled: true,
  })
})

test('华泰邮箱默认连接器允许保存草稿但禁止直接发送', () => {
  const connector = JSON.parse(
    readFileSync(join(import.meta.dir, '../../../../default-connectors/huatai-email/connector.json'), 'utf-8'),
  ) as { description?: string; version?: string; disabledTools?: string[] }

  expect(connector.version).toBe('1.0.3')
  expect(connector.description).toContain('保存草稿')
  expect(connector.disabledTools).toContain('send_email')
  expect(connector.disabledTools).not.toContain('save_to_mailbox')
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
  expect(agentSkillsViewSource).toContain('并保存待你确认的邮件草稿')
  expect(agentSkillsViewSource).toContain('检索邮件内容、整理信息和处理办公协同任务')
  expect(agentSkillsViewSource).toContain('当前邮箱能力')
  expect(agentSkillsViewSource).toContain('邮箱能力选择')
  expect(agentSkillsViewSource).toContain('读取邮件')
  expect(agentSkillsViewSource).toContain('写入草稿箱')
  expect(agentSkillsViewSource).toContain('邮件发送')
  expect(agentSkillsViewSource).toContain('function HuataiEmailCapabilityFlow')
  expect(agentSkillsViewSource).toContain('function HuataiEmailCapabilityStep')
  expect(agentSkillsViewSource).not.toContain('function HuataiEmailFlowArrow')
  expect(agentSkillsViewSource).not.toContain('ArrowDown')
  expect(agentSkillsViewSource).not.toContain('读取后可写草稿，发送需手工开启')
  expect(agentSkillsViewSource).toContain("huataiEmailDraftEnabled ? '已启用' : '已关闭'")
  expect(agentSkillsViewSource).toContain('huataiEmailDraftEnabled')
  expect(agentSkillsViewSource).toContain('getHuataiEmailDraftEnabled')
  expect(agentSkillsViewSource).toContain('setHuataiEmailDraftEnabled')
  expect(agentSkillsViewSource).toContain('handleHuataiEmailDraftToggle')
  expect(agentSkillsViewSource).toContain("huataiEmailSendEnabled ? '已启用' : '已关闭'")
  expect(agentSkillsViewSource).toContain("tone?: 'enabled' | 'disabled'")
  expect(agentSkillsViewSource).toContain('text-blue-600 dark:text-blue-400')
  expect(agentSkillsViewSource).toContain('text-amber-700 dark:text-amber-300')
  expect(agentSkillsViewSource).toContain('huataiEmailSendEnabled')
  expect(agentSkillsViewSource).toContain('getHuataiEmailSendEnabled')
  expect(agentSkillsViewSource).toContain('setHuataiEmailSendEnabled')
  expect(agentSkillsViewSource).toContain('pendingHuataiEmailSendEnabled')
  expect(agentSkillsViewSource).toContain('开启邮件发送')
  expect(agentSkillsViewSource).toContain('仅允许发送到 @htsc.com 邮箱')
  expect(agentSkillsViewSource).toContain('发送前必须确认')
  expect(agentSkillsViewSource).not.toContain('直接发送默认关闭')
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
  expect(agentSkillsViewSource).not.toContain('label="IMAP"')
  expect(agentSkillsViewSource).not.toContain('MCP_EMAIL_SERVER_IMAP_HOST ??')
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

test('连接器初始化错误信息支持展开查看明确详情', () => {
  expect(agentSkillsViewSource).toContain('function ConnectorInitStepList')
  expect(agentSkillsViewSource).toContain('expandedInitStepId')
  expect(agentSkillsViewSource).toContain('getConnectorInitStepSummary')
  expect(agentSkillsViewSource).toContain('展开详情')
  expect(agentSkillsViewSource).toContain('收起详情')
  expect(agentSkillsViewSource).toContain('whitespace-pre-wrap')
  expect(agentSkillsViewSource).toContain('aria-expanded')
  expect(agentSkillsViewSource).not.toContain('{initSteps.map((step) => (')
})

test('华泰个人邮箱已绑定信息使用左对齐信息块避免左右割裂', () => {
  expect(agentSkillsViewSource).toContain("function ConnectorDetailRow")
  expect(agentSkillsViewSource).toContain('className="flex flex-col gap-1.5')
  expect(agentSkillsViewSource).toContain('sm:grid-cols-2')
  expect(agentSkillsViewSource).toContain("wide && 'sm:col-span-2'")
  expect(agentSkillsViewSource).not.toContain('label="命令"')
  expect(agentSkillsViewSource).not.toContain("server.type === 'stdio' ? server.command : server.url")
  expect(agentSkillsViewSource).toContain('text-left')
  expect(agentSkillsViewSource).toContain('break-words')
  expect(agentSkillsViewSource).not.toContain('items-start justify-between')
  expect(agentSkillsViewSource).not.toContain('text-right text-foreground/80')
})

test('连接器卡片清晰展示 CLI 和 MCP transport 类型', () => {
  expect(agentSkillsViewSource).toContain("getConnectorKindLabel")
  expect(agentSkillsViewSource).toContain("return 'CLI'")
  expect(agentSkillsViewSource).toContain("`MCP · ${getMcpTransportLabel(server.type)}`")

  expect(mcpCardSource).toContain("MCP · {TRANSPORT_LABELS[entry.type] ?? entry.type ?? '未知'}")
  expect(mcpCardSource).toContain("stdio: 'STDIO'")
  expect(mcpCardSource).toContain("sse: 'SSE'")
})

test('待配置连接器保持可点击且不置灰', () => {
  expect(agentSkillsViewSource).toContain("isConfigured && !enabled && 'opacity-55'")
  expect(agentSkillsViewSource).not.toContain("isComingSoon ? 'cursor-not-allowed opacity-55' : !enabled && 'opacity-55'")
})

test('连接器启用状态使用产品蓝色而不是突兀绿色', () => {
  expect(agentSkillsViewSource).toContain("isConfigured ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'")
  expect(agentSkillsViewSource).not.toContain('data-[state=checked]:bg-green-500')
  expect(agentSkillsViewSource).not.toContain("isConfigured ? 'bg-green-500/10 text-green-600 dark:text-green-400'")
})

test('内置连接器初始化弹窗复用通用进度订阅逻辑', () => {
  expect(agentSkillsViewSource).toContain('function useConnectorInitProgress')
  expect(agentSkillsViewSource).toContain("useConnectorInitProgress(workspaceSlug, 'huatai-email'")
  expect(agentSkillsViewSource).toContain("useConnectorInitProgress(workspaceSlug, 'hi-agent'")
  expect(agentSkillsViewSource).toContain("useConnectorInitProgress(workspaceSlug, 'huatai-gitlab'")
  expect(agentSkillsViewSource).toContain('window.electronAPI.onConnectorInitProgress')
  expect(agentSkillsViewSource).toContain('runId,')
})

test('华泰 GitLab 绑定弹窗只面向华泰 GitLab 并保存本机 Token', () => {
  expect(agentSkillsViewSource).toContain('function HuataiGitLabConnectorDialog')
  expect(agentSkillsViewSource).toContain("activeDefaultConnector === 'huatai-gitlab'")
  expect(agentSkillsViewSource).toContain("connectorId: 'huatai-gitlab'")
  expect(agentSkillsViewSource).toContain('华泰 GitLab')
  expect(agentSkillsViewSource).toContain('gitlab.htzq.htsc.com.cn')
  expect(agentSkillsViewSource).toContain('请输入华泰 GitLab Token')
  expect(agentSkillsViewSource).toContain('Token 只保存在本机，用于访问华泰 GitLab，不会写入对话内容。')
  expect(agentSkillsViewSource).toContain('检查 glab CLI')
  expect(agentSkillsViewSource).toContain('安装 glab CLI')
})
