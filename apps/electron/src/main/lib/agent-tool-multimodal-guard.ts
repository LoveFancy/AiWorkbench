/**
 * Agent 工具多模态能力守卫
 *
 * 用于在 PreToolUse / canUseTool 阶段拦截不支持直接 Read 的多模态资源。
 * PDF / Office 文档不允许通过 Read/base64 直接读取；图片按模型多模态能力判断。
 */

interface MultimodalGuardInput {
  toolName: string
  input: Record<string, unknown>
  supportsMultimodal: boolean
}

export interface BlockedMultimodalToolUse {
  path: string
  message: string
}

export interface PreToolUseGuardOutput {
  continue: boolean
  reason: string
  hookSpecificOutput: {
    hookEventName: 'PreToolUse'
    permissionDecision: 'deny'
    permissionDecisionReason: string
  }
}

const MULTIMODAL_FILE_EXTENSIONS = /\.(pdf|png|jpe?g|gif|webp|bmp|svg|ico|heic|heif|tiff?|docx?|pptx?|xlsx?)$/i
const DOCUMENT_FILE_EXTENSIONS = /\.(pdf|docx?|pptx?|xlsx?)$/i
const TEXT_FILE_EXTENSIONS = /\.(txt|md|mdx|markdown|json|jsonl|yaml|yml|toml|xml|html?|css|scss|sass|less|js|jsx|ts|tsx|mjs|cjs|py|rb|go|rs|java|kt|kts|c|cc|cpp|cxx|h|hpp|cs|php|swift|sql|sh|bash|zsh|fish|ps1|bat|cmd|csv|tsv|log|ini|conf|config|env|gitignore|dockerfile)$/i

function readPathFromToolInput(input: Record<string, unknown>): string | null {
  const candidates = [input.file_path, input.path]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
  }
  return null
}

function isBase64ReadRequested(input: Record<string, unknown>): boolean {
  const values = [input.output_format, input.format, input.encoding, input.mode]
  return values.some((value) => typeof value === 'string' && value.toLowerCase().includes('base64'))
}

function requiresMultimodalRead(filePath: string, input: Record<string, unknown>): boolean {
  const normalized = filePath.split(/[?#]/, 1)[0] ?? filePath
  if (MULTIMODAL_FILE_EXTENSIONS.test(normalized)) return true
  if (TEXT_FILE_EXTENSIONS.test(normalized)) return false
  return isBase64ReadRequested(input)
}

function requiresDocumentRead(filePath: string, input: Record<string, unknown>): boolean {
  const normalized = filePath.split(/[?#]/, 1)[0] ?? filePath
  return DOCUMENT_FILE_EXTENSIONS.test(normalized) || isBase64ReadRequested(input)
}

function buildBlockedMessage(filePath: string, input: Record<string, unknown>): string {
  const lower = filePath.toLowerCase()
  const kind = lower.endsWith('.pdf')
    ? 'PDF'
    : DOCUMENT_FILE_EXTENSIONS.test(lower) || isBase64ReadRequested(input)
      ? 'base64 文件'
      : '图片或二进制文件'
  if (DOCUMENT_FILE_EXTENSIONS.test(lower) || isBase64ReadRequested(input)) {
    return `${kind} 不支持通过 Read/base64 直接读取：${filePath}。请先使用文档解析或对应 Skill 提取文本后再处理。`
  }
  return `当前 Agent 模型不支持多模态，不能通过 Read 读取 ${kind}：${filePath}。请切换到支持多模态的模型，或先将文件转换为可读取的纯文本后再处理。`
}

export function getBlockedMultimodalToolUse({
  toolName,
  input,
  supportsMultimodal,
}: MultimodalGuardInput): BlockedMultimodalToolUse | null {
  if (toolName !== 'Read') return null

  const filePath = readPathFromToolInput(input)
  if (!filePath) return null

  if (requiresDocumentRead(filePath, input)) {
    return {
      path: filePath,
      message: buildBlockedMessage(filePath, input),
    }
  }

  if (supportsMultimodal) return null
  if (!requiresMultimodalRead(filePath, input)) return null

  return {
    path: filePath,
    message: buildBlockedMessage(filePath, input),
  }
}

export function buildPreToolUseMultimodalGuardOutput(input: MultimodalGuardInput): PreToolUseGuardOutput | null {
  const blocked = getBlockedMultimodalToolUse(input)
  if (!blocked) return null

  return {
    continue: false,
    reason: blocked.message,
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: blocked.message,
    },
  }
}
