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
  decryptApiKey?: (encryptedKey: string) => string | null
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
  let changed = false

  for (const preset of PRESET_CHANNELS) {
    const existingIndex = findMatchingChannelIndex(channels, preset.provider)
    if (existingIndex !== -1) {
      const existing = channels[existingIndex]!
      const updated = syncPresetModels(existing, input.decryptApiKey)
      if (updated !== existing) {
        channels[existingIndex] = updated
        changed = true
      }
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
    changed = true
  }

  return {
    channels,
    changed,
    addedNames,
  }
}

function findMatchingChannelIndex(channels: Channel[], provider: ProviderType): number {
  const defaultUrl = PROVIDER_DEFAULT_URLS[provider]

  return channels.findIndex((channel) => {
    if (channel.provider === provider) {
      return true
    }

    return defaultUrl !== '' && channel.baseUrl === defaultUrl
  })
}

function syncPresetModels(channel: Channel, decryptApiKey?: (encryptedKey: string) => string | null): Channel {
  if (channel.provider !== 'huatai-anthropic') {
    return channel
  }

  const defaults = PROVIDER_DEFAULT_MODELS['huatai-anthropic'] ?? []
  if (defaults.length === 0) {
    return channel
  }

  const hasConfiguredKey = decryptApiKey ? (decryptApiKey(channel.apiKey)?.trim().length ?? 0) > 0 : false
  const existingById = new Map(channel.models.map((model) => [model.id, model]))
  const defaultIds = new Set(defaults.map((model) => model.id))
  const nextModels = defaults.map((model) => {
    const existing = existingById.get(model.id)
    if (!existing) {
      return model
    }

    return {
      ...existing,
      enabled: hasConfiguredKey ? existing.enabled : false,
    }
  })
  const customModels = channel.models
    .filter((model) => !defaultIds.has(model.id))
    .map((model) => ({
      ...model,
      enabled: hasConfiguredKey ? model.enabled : false,
    }))
  nextModels.push(...customModels)

  const changed =
    nextModels.length !== channel.models.length ||
    nextModels.some((model, index) => {
      const previous = channel.models[index]
      return !previous || previous.id !== model.id || previous.name !== model.name || previous.enabled !== model.enabled
    })

  if (!changed) {
    return channel
  }

  return {
    ...channel,
    models: nextModels,
  }
}
