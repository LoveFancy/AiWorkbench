import type { Channel } from '@proma/shared'
import type { SelectedModel } from '../atoms/chat-atoms'

export function hasConfiguredApiKey(channel: Pick<Channel, 'id' | 'apiKeyConfigured'>): boolean {
  return channel.id === 'proma-official' || channel.apiKeyConfigured === true
}

function isUsableModel(channels: Channel[], selected: SelectedModel): boolean {
  const channel = channels.find((item) => item.id === selected.channelId)
  if (!channel?.enabled) return false
  if (!hasConfiguredApiKey(channel)) return false
  return channel.models.some((model) => model.id === selected.modelId && model.enabled)
}

function findFirstUsableModel(channels: Channel[]): SelectedModel | null {
  for (const channel of channels) {
    if (!channel.enabled) continue
    if (!hasConfiguredApiKey(channel)) continue
    const model = channel.models.find((item) => item.enabled)
    if (model) {
      return {
        channelId: channel.id,
        modelId: model.id,
      }
    }
  }

  return null
}

export function hasUsableChatModel(channels: Channel[]): boolean {
  return findFirstUsableModel(channels) !== null
}

export function resolveSelectedModel(
  channels: Channel[],
  current: SelectedModel | null,
): SelectedModel | null {
  if (current && isUsableModel(channels, current)) return current
  return findFirstUsableModel(channels)
}

export function resolveAgentSelectedModel(
  channels: Channel[],
  agentChannelIds: string[],
  current: SelectedModel | null,
): SelectedModel | null {
  const selectableChannelIds = new Set(agentChannelIds)
  if (current && selectableChannelIds.has(current.channelId) && isUsableModel(channels, current)) {
    return current
  }

  const promaOfficial = channels.find((channel) => channel.id === 'proma-official')
  if (promaOfficial?.enabled && hasConfiguredApiKey(promaOfficial)) {
    const model = promaOfficial.models.find((item) => item.enabled)
    if (model) {
      return {
        channelId: promaOfficial.id,
        modelId: model.id,
      }
    }
  }

  for (const channel of channels) {
    if (!channel.enabled || !selectableChannelIds.has(channel.id)) continue
    if (!hasConfiguredApiKey(channel)) continue
    const model = channel.models.find((item) => item.enabled)
    if (model) {
      return {
        channelId: channel.id,
        modelId: model.id,
      }
    }
  }

  return null
}
