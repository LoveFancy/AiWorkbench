import type { Channel } from '@proma/shared'

export interface PngAttachmentCandidate {
  filename?: string
  name?: string
  mediaType?: string
}

interface ModelCapabilitySource {
  id: string
  name?: string
  supportsMultimodal?: boolean
}

export function isPngAttachment(candidate: PngAttachmentCandidate): boolean {
  return isImageAttachment(candidate)
}

/** 图片扩展名 / MIME 类型集合 */
const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|webp|bmp|svg)(?:$|[?#])/i
const IMAGE_MIME_PREFIX = 'image/'

export function isImageAttachment(candidate: PngAttachmentCandidate): boolean {
  const mediaType = candidate.mediaType?.trim().toLowerCase()
  if (mediaType?.startsWith(IMAGE_MIME_PREFIX)) return true

  const filename = (candidate.filename ?? candidate.name)?.trim().toLowerCase()
  return Boolean(filename && IMAGE_EXTENSIONS.test(filename))
}

export function agentModelSupportsMultimodal(
  channels: Channel[],
  channelId: string | null | undefined,
  modelId: string | null | undefined,
): boolean {
  if (!channelId || !modelId) return false

  const channel = channels.find((item) => item.id === channelId)
  const model = channel?.models.find((item) => item.id === modelId)
  if (!model) return false

  return (model as ModelCapabilitySource).supportsMultimodal === true
}

export function findBlockedPngFiles<T extends PngAttachmentCandidate>(
  files: T[],
  supportsMultimodal: boolean,
): string[] {
  if (supportsMultimodal) return []
  return files
    .filter(isImageAttachment)
    .map((file) => file.filename ?? file.name ?? '图片')
}

export function removeBlockedPngEntries(entries: string[], supportsMultimodal: boolean): string[] {
  if (supportsMultimodal) return entries
  return entries.filter((entry) => !isImageAttachment({ filename: entry }))
}

const IMAGE_FILE_MENTION_RE = /@file:([^\n\r]+?\.(png|jpe?g|gif|webp|bmp|svg))(?=\s|$)/gi

export function extractPngFileMentions(text: string): string[] {
  const matches = [...text.matchAll(IMAGE_FILE_MENTION_RE)]
  return matches
    .map((match) => match[1])
    .filter((path): path is string => Boolean(path))
}
