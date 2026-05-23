import type { Channel, ProviderType } from '@proma/shared'
import { PROVIDER_DEFAULT_MODELS, PROVIDER_DEFAULT_URLS } from '@proma/shared'

interface PresetChannelDefinition {
  name: string
  provider: ProviderType
}

interface EnsurePresetChannelsInput {
  channels: Channel[]
  now: () => number
  createId: (provider: ProviderType) => string
  encryptApiKey: (plainKey: string) => string
}

interface EnsurePresetChannelsResult {
  channels: Channel[]
  changed: boolean
  addedNames: string[]
}

const PRESET_CHANNELS: PresetChannelDefinition[] = [
  { name: '华泰（Anthropic）', provider: 'huatai-anthropic' },
]

export function ensurePresetChannels(input: EnsurePresetChannelsInput): EnsurePresetChannelsResult {
  const channels = [...input.channels]
  const addedNames: string[] = []

  for (const preset of PRESET_CHANNELS) {
    if (hasMatchingChannel(channels, preset.provider)) {
      continue
    }

    const now = input.now()
    channels.push({
      id: input.createId(preset.provider),
      name: preset.name,
      provider: preset.provider,
      baseUrl: PROVIDER_DEFAULT_URLS[preset.provider],
      apiKey: input.encryptApiKey(''),
      models: PROVIDER_DEFAULT_MODELS[preset.provider] ?? [],
      enabled: false,
      createdAt: now,
      updatedAt: now,
    })
    addedNames.push(preset.name)
  }

  return {
    channels,
    changed: addedNames.length > 0,
    addedNames,
  }
}

function hasMatchingChannel(channels: Channel[], provider: ProviderType): boolean {
  const defaultUrl = PROVIDER_DEFAULT_URLS[provider]

  return channels.some((channel) => {
    if (channel.provider === provider) {
      return true
    }

    return defaultUrl !== '' && channel.baseUrl === defaultUrl
  })
}
