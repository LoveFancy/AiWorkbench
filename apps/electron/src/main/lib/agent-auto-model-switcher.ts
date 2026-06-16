/**
 * agent-auto-model-switcher — Auto Mode 跨模型切换模块
 *
 * 从 AgentOrchestrator 中抽取，负责：
 * - 读取 Auto Mode 配置 (settings.json)
 * - 构建可用模型集合
 * - 确定初始模型
 * - 候选模型选取 + 切换
 * - 同模型重试次数追踪
 *
 * 设计目标：最小化 agent-orchestrator.ts 的改动量，降低合并冲突风险。
 */

import { getSettings } from './settings-service'
import { listChannels, decryptApiKey } from './channel-manager'
import { getAgentSessionMeta, updateAgentSessionMeta } from './agent-session-manager'
import type { ProviderType } from '@proma/shared'

// ===== 常量 =====

/** 同模型最大重试次数（失败后重试 1 次，共 2 次机会，仍失败则切换模型） */
export const MAX_SAME_MODEL_RETRIES = 1

/** 默认模型 ID */
const DEFAULT_MODEL_ID = 'claude-sonnet-4-6'

// ===== 类型 =====

export interface AutoModeConfig {
  /** Auto Mode 是否启用 */
  enabled: boolean
  /** 候选模型 ID 列表 */
  candidatePool: string[]
  /** 系统当前可用模型 ID 集合 */
  availableModelIds: Set<string>
}

export interface ChannelSwitchInfo {
  channelId: string
  apiKey: string
  baseUrl: string
  provider: ProviderType
}

export interface AutoModeState {
  /** 当前激活的模型 ID */
  activeModelId: string
  /** 同模型连续失败次数 */
  sameModelAttempts: number
  /** 已尝试过的模型 ID 集合 */
  triedModelIds: Set<string>
}

// ===== 工具函数 =====

/**
 * 从候选池中选择下一个可用模型
 */
export function selectNextCandidateModel(
  currentModelId: string,
  candidatePool: string[],
  excludeModelIds: Set<string>,
  availableModels: Set<string>,
): string | null {
  const startIdx = candidatePool.indexOf(currentModelId)
  for (let i = startIdx >= 0 ? startIdx + 1 : 0; i < candidatePool.length; i++) {
    const candidate = candidatePool[i]
    if (candidate && !excludeModelIds.has(candidate) && availableModels.has(candidate)) {
      return candidate
    }
  }
  return null
}

// ===== 配置解析 =====

/**
 * 读取 Auto Mode 配置并构建可用模型集合
 */
export async function resolveAutoModeConfig(): Promise<AutoModeConfig> {
  const appSettings = getSettings()
  const enabled = appSettings.autoModeEnabled ?? false
  const candidatePool = appSettings.autoSwitchCandidateModels ?? []

  const availableModelIds = new Set<string>()
  const channels = listChannels()
  for (const c of channels) {
    if (c.enabled) {
      for (const m of c.models) {
        if (m.enabled) availableModelIds.add(m.id)
      }
    }
  }

  // 平台模型
  try {
    const { getPlatformChannel } = await import('../../models/model-service')
    const platformCh = getPlatformChannel()
    if (platformCh) {
      for (const m of platformCh.models) {
        if (m.enabled) availableModelIds.add(m.id)
      }
    }
  } catch { /* model-service 不可用则跳过 */ }

  return { enabled, candidatePool, availableModelIds }
}

// ===== 模型 → 渠道映射 =====

/**
 * 根据模型 ID 查找所属渠道
 *
 * Auto Mode 切换模型时，新模型可能属于不同的渠道（不同 endpoint / API Key），
 * 必须联动切换渠道信息以重建 sdkEnv。
 *
 * @returns 渠道信息，若模型不属于任何已启用渠道则返回 null
 */
export function findChannelForModel(modelId: string): ChannelSwitchInfo | null {
  const channels = listChannels()
  for (const ch of channels) {
    if (!ch.enabled) continue
    if (ch.models.some((m) => m.id === modelId && m.enabled)) {
      const apiKey = decryptApiKey(ch.id)
      return {
        channelId: ch.id,
        apiKey,
        baseUrl: ch.baseUrl,
        provider: ch.provider,
      }
    }
  }
  return null
}

// ===== 初始模型确定 =====

/**
 * 确定 Auto Mode 下的初始模型 ID
 *
 * 优先级：sessionMeta.activeModelId > 用户手动选的在候选池中的模型 > 候选池首项 > 默认模型
 */
export function resolveInitialModel(
  sessionId: string,
  userModelId: string | undefined,
  config: AutoModeConfig,
): { activeModelId: string; state: AutoModeState } {
  const defaultId = userModelId || DEFAULT_MODEL_ID

  if (!config.enabled || config.candidatePool.length === 0) {
    return {
      activeModelId: defaultId,
      state: { activeModelId: defaultId, sameModelAttempts: 0, triedModelIds: new Set() },
    }
  }

  const sm = getAgentSessionMeta(sessionId)
  const activeModelId = sm?.activeModelId
    ?? (userModelId && config.candidatePool.includes(userModelId) ? userModelId : null)
    ?? config.candidatePool[0]
    ?? DEFAULT_MODEL_ID

  const state: AutoModeState = {
    activeModelId,
    sameModelAttempts: 0,
    triedModelIds: new Set([activeModelId]),
  }

  console.log(`[Auto Mode] 初始模型: ${activeModelId} (candidates: ${config.candidatePool.length})`)
  return { activeModelId, state }
}
