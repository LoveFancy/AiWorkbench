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
  const mediaType = candidate.mediaType?.trim().toLowerCase()
  if (mediaType === 'image/png') return true

  const filename = (candidate.filename ?? candidate.name)?.trim().toLowerCase()
  return Boolean(filename && /\.png(?:$|[?#])/.test(filename))
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
    .filter(isPngAttachment)
    .map((file) => file.filename ?? file.name ?? 'PNG 图片')
}

export function removeBlockedPngEntries(entries: string[], supportsMultimodal: boolean): string[] {
  if (supportsMultimodal) return entries
  return entries.filter((entry) => !isPngAttachment({ filename: entry }))
}

export function extractPngFileMentions(text: string): string[] {
  const matches = [...text.matchAll(/@file:([^\n\r]+?\.png)(?=\s|$)/gi)]
  return matches
    .map((match) => match[1])
    .filter((path): path is string => Boolean(path && isPngAttachment({ filename: path })))
}
