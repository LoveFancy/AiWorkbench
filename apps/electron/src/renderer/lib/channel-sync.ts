import type { Channel } from '@proma/shared'
import type { SelectedModel } from '@/atoms/chat-atoms'
import { resolveSelectedModel } from './model-selection'

interface ChannelSnapshotResult {
  channels: Channel[]
  selectedModel: SelectedModel | null
}

export function applySavedChannelSnapshot(
  channels: Channel[],
  savedChannel: Channel,
  currentModel: SelectedModel | null,
): ChannelSnapshotResult {
  const index = channels.findIndex((channel) => channel.id === savedChannel.id)
  const nextChannels = index === -1
    ? [...channels, savedChannel]
    : channels.map((channel) => (channel.id === savedChannel.id ? savedChannel : channel))

  return {
    channels: nextChannels,
    selectedModel: resolveSelectedModel(nextChannels, currentModel),
  }
}
