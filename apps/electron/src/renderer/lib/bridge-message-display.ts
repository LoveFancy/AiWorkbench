/**
 * 提取飞书 bridge 用户消息的展示文本。
 *
 * Agent 实际收到的消息会包含给模型看的上下文 XML；桌面端展示时只需要让用户看到
 * 自己发送的内容，同时保留附件块给现有附件解析逻辑继续渲染文件 chip。
 */
export function getAgentUserDisplayText(content: string): string {
  if (!isFeishuBridgeUserMessage(content)) return content

  const userMessageMatch = content.match(/<user_message>\n?([\s\S]*?)\n?<\/user_message>/)
  if (!userMessageMatch) return content

  const displayParts: string[] = []
  const attachedFilesMatch = content.match(/<attached_files>\n?[\s\S]*?\n?<\/attached_files>/)
  if (attachedFilesMatch) {
    displayParts.push(attachedFilesMatch[0].trim())
  }

  displayParts.push(userMessageMatch[1]!.trim())
  return displayParts.filter(Boolean).join('\n\n')
}

function isFeishuBridgeUserMessage(content: string): boolean {
  return content.includes('<bridge_context>') && content.includes('</bridge_context>')
}
