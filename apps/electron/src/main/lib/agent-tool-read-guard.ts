import { existsSync, readFileSync, statSync } from 'node:fs'
import { extname, isAbsolute, resolve } from 'node:path'
import type { PermissionResult } from './agent-permission-service'

export type AgentReadableFileKind =
  | 'text'
  | 'svg_text'
  | 'raster_image'
  | 'pdf'
  | 'office'
  | 'binary'
  | 'unknown'

export interface RunToolGuardContext {
  supportsMultimodal: boolean
  autoModeEnabled: boolean
  runHasImageInput: boolean
  sessionRequiresVisionContext: boolean
  cwd?: string
  canAutoSwitchToMultimodal: () => boolean
}

const RASTER_IMAGE_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico', '.tif', '.tiff', '.avif', '.heic', '.heif',
])

const OFFICE_EXTENSIONS = new Set([
  '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx', '.odt', '.ods', '.odp',
])

const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.mdx', '.markdown', '.json', '.jsonl', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.css', '.scss', '.sass', '.less', '.html', '.htm', '.xml', '.yml', '.yaml', '.toml', '.ini', '.env',
  '.gitignore', '.dockerignore', '.c', '.h', '.cc', '.cpp', '.hpp', '.cs', '.java', '.kt', '.kts', '.go',
  '.rs', '.py', '.rb', '.php', '.swift', '.sh', '.bash', '.zsh', '.fish', '.sql', '.graphql', '.gql',
  '.csv', '.tsv', '.log', '.diff', '.patch', '.lock',
])

function deny(message: string): PermissionResult {
  return { behavior: 'deny', message }
}

function startsWithBytes(buffer: Buffer, bytes: readonly number[]): boolean {
  return bytes.every((byte, index) => buffer[index] === byte)
}

function isZipBasedOffice(buffer: Buffer, filePath: string): boolean {
  if (!startsWithBytes(buffer, [0x50, 0x4b, 0x03, 0x04])) return false
  const ext = extname(filePath).toLowerCase()
  return OFFICE_EXTENSIONS.has(ext)
}

function looksLikeText(buffer: Buffer): boolean {
  if (buffer.length === 0) return true
  const sample = buffer.subarray(0, Math.min(buffer.length, 8192))
  let controlBytes = 0
  for (const byte of sample) {
    if (byte === 0) return false
    if (byte < 0x09 || (byte > 0x0d && byte < 0x20)) controlBytes++
  }
  return controlBytes / sample.length < 0.02
}

function detectFromExtension(filePath: string, mimeType?: string): AgentReadableFileKind | null {
  const mime = mimeType?.toLowerCase()
  if (mime?.startsWith('image/svg')) return 'svg_text'
  if (mime?.startsWith('image/')) return 'raster_image'
  if (mime === 'application/pdf') return 'pdf'
  if (mime?.includes('officedocument') || mime?.includes('msword') || mime?.includes('ms-excel') || mime?.includes('ms-powerpoint')) {
    return 'office'
  }

  const ext = extname(filePath).toLowerCase()
  if (ext === '.svg') return 'svg_text'
  if (RASTER_IMAGE_EXTENSIONS.has(ext)) return 'raster_image'
  if (ext === '.pdf') return 'pdf'
  if (OFFICE_EXTENSIONS.has(ext)) return 'office'
  if (TEXT_EXTENSIONS.has(ext)) return 'text'
  return null
}

function detectFromMagicBytes(filePath: string): AgentReadableFileKind | null {
  if (!existsSync(filePath)) return null
  const stat = statSync(filePath)
  if (!stat.isFile()) return null

  const buffer = readFileSync(filePath).subarray(0, Math.min(stat.size, 8192))
  if (buffer.length === 0) return 'text'

  if (startsWithBytes(buffer, [0x25, 0x50, 0x44, 0x46])) return 'pdf'
  if (startsWithBytes(buffer, [0x89, 0x50, 0x4e, 0x47])) return 'raster_image'
  if (startsWithBytes(buffer, [0xff, 0xd8, 0xff])) return 'raster_image'
  if (startsWithBytes(buffer, [0x47, 0x49, 0x46, 0x38])) return 'raster_image'
  if (startsWithBytes(buffer, [0x42, 0x4d])) return 'raster_image'
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
    return 'raster_image'
  }
  if (isZipBasedOffice(buffer, filePath)) return 'office'
  if (!looksLikeText(buffer)) return 'binary'
  return 'text'
}

export function detectAgentReadableFileKind(filePath: string, mimeType?: string): AgentReadableFileKind {
  const byExtension = detectFromExtension(filePath, mimeType)
  if (byExtension && byExtension !== 'text') return byExtension

  try {
    const byMagic = detectFromMagicBytes(filePath)
    if (byMagic && byMagic !== 'unknown') return byMagic
  } catch {
    return byExtension ?? 'unknown'
  }

  return byExtension ?? 'unknown'
}

function resolveToolPath(filePath: string, cwd?: string): string {
  if (isAbsolute(filePath)) return filePath
  return resolve(cwd ?? process.cwd(), filePath)
}

function extractReadFilePath(input: Record<string, unknown>): string | null {
  const filePath = input.file_path
  return typeof filePath === 'string' && filePath.trim() ? filePath : null
}

function guardFileRead(kind: AgentReadableFileKind, context: RunToolGuardContext): PermissionResult | null {
  if (kind === 'svg_text' || kind === 'text' || kind === 'unknown') return null

  if (kind === 'raster_image') {
    if (!context.supportsMultimodal && context.canAutoSwitchToMultimodal()) {
      return deny('当前模型不支持多模态图片理解，Auto Mode 应切换到多模态候选模型后再处理该图片。')
    }
    return deny(
      context.supportsMultimodal
        ? '图片不能通过 Read 作为文本读取，请走多模态图片输入流程。'
        : '当前模型不支持多模态图片理解，请切换支持图片的模型。',
    )
  }

  if (kind === 'pdf' || kind === 'office') {
    return deny('文档不能通过 Read/base64 直接读取，请使用文档解析或对应 Skill 提取文本。')
  }

  return deny('二进制文件不能作为文本读取。')
}

function stripShellToken(token: string): string {
  return token
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .replace(/[),;|]+$/g, '')
}

function commandPathCandidates(command: string): string[] {
  const tokens = command.split(/\s+/).map(stripShellToken).filter(Boolean)
  return tokens.filter((token) => {
    if (token.startsWith('-')) return false
    if (/^(base64|openssl|cat|xxd|hexdump|certutil|python|python3|node|perl|ruby)$/.test(token)) return false
    return token.includes('/') || /\.[a-z0-9]{1,8}$/i.test(token)
  })
}

export function looksLikeBase64BinaryRead(command: string, cwd?: string): boolean {
  const normalized = command.trim()
  if (!/\b(base64|openssl\s+base64|certutil\s+-encode)\b/i.test(normalized)) return false

  for (const candidate of commandPathCandidates(normalized)) {
    const absolutePath = resolveToolPath(candidate, cwd)
    const kind = detectAgentReadableFileKind(absolutePath)
    if (kind === 'raster_image' || kind === 'pdf' || kind === 'office' || kind === 'binary') {
      return true
    }
  }

  return false
}

function webFetchKindFromUrl(input: Record<string, unknown>): AgentReadableFileKind | null {
  const rawUrl = typeof input.url === 'string' ? input.url : undefined
  if (!rawUrl) return null
  try {
    const url = new URL(rawUrl)
    return detectFromExtension(url.pathname)
  } catch {
    return detectFromExtension(rawUrl)
  }
}

export function guardToolUseBeforePermission(
  toolName: string,
  input: Record<string, unknown>,
  context: RunToolGuardContext,
): PermissionResult | null {
  if (toolName === 'Read') {
    const filePath = extractReadFilePath(input)
    if (!filePath) return null
    const absolutePath = resolveToolPath(filePath, context.cwd)
    return guardFileRead(detectAgentReadableFileKind(absolutePath), context)
  }

  if (toolName === 'Bash') {
    const command = typeof input.command === 'string' ? input.command : ''
    if (looksLikeBase64BinaryRead(command, context.cwd)) {
      return deny('禁止使用 base64 方式读取图片、PDF 或二进制文件。')
    }
  }

  if (toolName === 'WebFetch') {
    const kind = webFetchKindFromUrl(input)
    if (kind === 'raster_image' || kind === 'pdf' || kind === 'office' || kind === 'binary') {
      return deny('WebFetch 不能把图片、PDF、Office 或二进制响应作为普通文本返回，请改用图片多模态通道或文档解析通道。')
    }
  }

  return null
}
