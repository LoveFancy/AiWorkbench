import { stat } from 'node:fs/promises'
import { extname } from 'node:path'
import { AGENT_IMAGE_INPUT_LIMITS, type AgentUserContentBlock } from '@proma/shared'

export interface AgentUserContentAttachment {
  filename: string
  mediaType?: string
  path?: string
}

export interface BuildAgentUserContentInput {
  userMessage: string
  attachments?: AgentUserContentAttachment[]
}

export interface BuildAgentUserContentResult {
  content: AgentUserContentBlock[]
  imageCount: number
  warnings: string[]
}

export type SupportedImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'

const SUPPORTED_IMAGE_MEDIA_TYPES = new Set<SupportedImageMediaType>([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
])

const IMAGE_EXTENSION_TO_MEDIA_TYPE: Record<string, SupportedImageMediaType | undefined> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
}

function formatBytesAsMb(bytes: number): string {
  return `${Math.round(bytes / 1024 / 1024)}MB`
}

export function resolveSupportedImageMediaType(input: AgentUserContentAttachment): SupportedImageMediaType | null {
  const normalizedMediaType = input.mediaType?.trim().toLowerCase()
  if (normalizedMediaType && SUPPORTED_IMAGE_MEDIA_TYPES.has(normalizedMediaType as SupportedImageMediaType)) {
    return normalizedMediaType as SupportedImageMediaType
  }

  const target = input.path || input.filename
  const ext = extname(target).toLowerCase()
  return IMAGE_EXTENSION_TO_MEDIA_TYPE[ext] ?? null
}

export function validateImageSize(input: {
  filename: string
  sizeBytes: number
  totalSizeBytes: number
}): { ok: true } | { ok: false; reason: string } {
  if (input.sizeBytes > AGENT_IMAGE_INPUT_LIMITS.MAX_SINGLE_IMAGE_BYTES) {
    return {
      ok: false,
      reason: `图片 ${input.filename} 超过单图大小限制 ${formatBytesAsMb(AGENT_IMAGE_INPUT_LIMITS.MAX_SINGLE_IMAGE_BYTES)}`,
    }
  }

  if (input.totalSizeBytes + input.sizeBytes > AGENT_IMAGE_INPUT_LIMITS.MAX_TOTAL_IMAGE_BYTES) {
    return {
      ok: false,
      reason: `图片附件总大小超过 ${formatBytesAsMb(AGENT_IMAGE_INPUT_LIMITS.MAX_TOTAL_IMAGE_BYTES)}`,
    }
  }

  return { ok: true }
}

async function readFileAsBase64(filePath: string): Promise<string> {
  if (typeof Bun !== 'undefined') {
    const buffer = await Bun.file(filePath).arrayBuffer()
    return Buffer.from(buffer).toString('base64')
  }
  const { readFile } = await import('node:fs/promises')
  return (await readFile(filePath)).toString('base64')
}

export async function buildAgentUserContent(input: BuildAgentUserContentInput): Promise<BuildAgentUserContentResult> {
  const content: AgentUserContentBlock[] = [{ type: 'text', text: input.userMessage }]
  const warnings: string[] = []
  let totalImageBytes = 0
  let imageCount = 0

  for (const attachment of input.attachments ?? []) {
    const mediaType = resolveSupportedImageMediaType(attachment)
    if (!mediaType || !attachment.path) continue

    try {
      const stats = await stat(attachment.path)
      if (!stats.isFile()) {
        warnings.push(`图片 ${attachment.filename} 不是普通文件，已跳过`)
        continue
      }

      const sizeResult = validateImageSize({
        filename: attachment.filename,
        sizeBytes: stats.size,
        totalSizeBytes: totalImageBytes,
      })
      if (!sizeResult.ok) {
        warnings.push(sizeResult.reason)
        continue
      }

      const data = await readFileAsBase64(attachment.path)
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: mediaType,
          data,
        },
      })
      totalImageBytes += stats.size
      imageCount += 1
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      warnings.push(`图片 ${attachment.filename} 读取失败: ${message}`)
    }
  }

  return { content, imageCount, warnings }
}
