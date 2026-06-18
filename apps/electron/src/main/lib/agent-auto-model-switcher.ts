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

/**
 * 候选模型引用
 *
 * 包含模型 ID 和可选的渠道 ID。
 * 当同一模型 ID 跨多个渠道时，通过 channelId 精确指定使用哪个渠道。
 */
export interface CandidateModelRef {
  modelId: string
  channelId?: string
}

export interface AutoModeConfig {
  /** Auto Mode 是否启用 */
  enabled: boolean
  /** 候选模型列表（含渠道信息） */
  candidatePool: CandidateModelRef[]
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
 *
 * 从当前模型位置向后遍历，到末尾后回绕到开头继续搜索，
 * 跳过已尝试和不可用的模型。
 */
export function selectNextCandidateModel(
  currentModelId: string,
  candidatePool: CandidateModelRef[],
  excludeModelIds: Set<string>,
  availableModels: Set<string>,
): CandidateModelRef | null {
  const n = candidatePool.length
  if (n === 0) return null

  // 查找当前模型在候选池中的位置
  let startIdx = candidatePool.findIndex((c) => c.modelId === currentModelId)
  if (startIdx === -1) startIdx = -1  // 未找到则从 -1 开始，下一轮从 0 开始

  const skipped: string[] = []

  // 从 startIdx+1 到末尾，再回绕到 0 到 startIdx（遍历一圈）
  for (let offset = 1; offset <= n; offset++) {
    const i = (startIdx + offset) % n
    const candidate = candidatePool[i]
    if (!candidate) continue
    if (excludeModelIds.has(candidate.modelId)) { skipped.push(`${candidate.modelId}(已尝试)`); continue }
    if (!availableModels.has(candidate.modelId)) { skipped.push(`${candidate.modelId}(不可用)`); continue }
    return candidate
  }

  console.log(`[Auto Mode] selectNextCandidateModel 未找到下一个候选: current=${currentModelId}, pool=[${candidatePool.map(c => c.modelId).join(', ')}], tried=[${[...excludeModelIds].join(', ')}], availableCount=${availableModels.size}, skipped=[${skipped.join(', ') || '无'}]`)
  return null
}

// ===== 配置解析 =====

/**
 * 读取 Auto Mode 配置并构建可用模型集合
 *
 * 将 settings 中的候选列表（可能是 string[] 或 CandidateModelRef[]）归一化为 CandidateModelRef[]。
 */
export async function resolveAutoModeConfig(): Promise<AutoModeConfig> {
  const appSettings = getSettings()
  const enabled = appSettings.autoModeEnabled ?? false
  const rawPool: Array<string | CandidateModelRef> = appSettings.autoSwitchCandidateModels ?? []

  const candidatePool: CandidateModelRef[] = rawPool.map((item) => {
    if (typeof item === 'string') {
      return { modelId: item }
    }
    return item as CandidateModelRef
  })

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

  // 诊断：候选池中有哪些模型不在可用集合中
  if (enabled && candidatePool.length > 0) {
    const missing = candidatePool.filter((c) => !availableModelIds.has(c.modelId))
    if (missing.length > 0) {
      console.log(`[Auto Mode] 候选池中 ${missing.length}/${candidatePool.length} 个模型不可用: [${missing.map(c => c.modelId).join(', ')}]`)
    }
  }

  return { enabled, candidatePool, availableModelIds }
}

// ===== 模型 → 渠道映射 =====

/**
 * 根据模型 ID 查找所属渠道
 *
 * Auto Mode 切换模型时，新模型可能属于不同的渠道（不同 endpoint / API Key），
 * 必须联动切换渠道信息以重建 sdkEnv。
 *
 * @param modelId 模型 ID
 * @param channelId 可选，指定渠道 ID 以在模型 ID 跨多个渠道时精确匹配
 * @returns 渠道信息，若模型不属于任何已启用渠道则返回 null
 */
export function findChannelForModel(modelId: string, channelId?: string): ChannelSwitchInfo | null {
  const channels = listChannels()
  for (const ch of channels) {
    if (!ch.enabled) continue
    if (channelId && ch.id !== channelId) continue
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
  const pool = config.candidatePool

  if (!config.enabled || pool.length === 0) {
    return {
      activeModelId: defaultId,
      state: { activeModelId: defaultId, sameModelAttempts: 0, triedModelIds: new Set() },
    }
  }

  const sm = getAgentSessionMeta(sessionId)
  const activeModelId = sm?.activeModelId
    ?? (userModelId && pool.some((c) => c.modelId === userModelId) ? userModelId : null)
    ?? pool[0]!.modelId
    ?? DEFAULT_MODEL_ID

  const state: AutoModeState = {
    activeModelId,
    sameModelAttempts: 0,
    triedModelIds: new Set([activeModelId]),
  }

  console.log(`[Auto Mode] 初始模型: ${activeModelId} (candidates: ${config.candidatePool.length})`)
  return { activeModelId, state }
}
