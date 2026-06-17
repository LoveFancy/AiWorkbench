/**
 * Orchestrator 共享常量 & 小工具函数
 */

import type { PromaPermissionMode } from '@proma/shared'
import { PROMA_PERMISSION_MODE_CONFIG } from '@proma/shared'

export const SDK_NATIVE_SEARCH_TOOLS = ['WebSearch'] as const

export function sdkPermissionModeForPromaMode(mode: PromaPermissionMode): PromaPermissionMode {
  return PROMA_PERMISSION_MODE_CONFIG[mode].sdkMode
}

export function mergeDisallowedTools(disallowedTools?: readonly string[]): string[] {
  return Array.from(new Set([...SDK_NATIVE_SEARCH_TOOLS, ...(disallowedTools ?? [])]))
}

/** 标题生成 Prompt */
export const TITLE_PROMPT = '根据用户的第一条消息，生成一个简短的对话标题（10字以内）。只输出标题，不要有任何其他内容、标点符号或引号。\n\n用户消息：'

/** 标题最大长度 */
export const MAX_TITLE_LENGTH = 20

/** 默认会话标题（用于判断是否需要自动生成） */
export const DEFAULT_SESSION_TITLE = '新 Agent 会话'

/** 默认模型 ID */
export const DEFAULT_MODEL_ID = 'claude-sonnet-4-6'

/**
 * 判断模型是否支持 1M context window beta（context-1m-2025-08-07）
 * 当前支持：Claude Sonnet 4 / 4.5 / 4.6、Opus 4.6 / 4.7 / 4.8、DeepSeek V4 系列、
 * 小米 MiMo V2.5 / V2.5 Pro / V2 Pro
 * 参考：https://docs.anthropic.com/en/docs/build-with-claude/context-windows
 */
export function supports1MContext(modelId: string): boolean {
  const m = modelId.toLowerCase()
  if (m.includes('haiku')) return false
  if (m.includes('claude')) {
    if (m.includes('sonnet-4')) return true
    if (m.includes('opus-4-6') || m.includes('opus-4-7') || m.includes('opus-4-8')) return true
    return false
  }
  if (m.includes('deepseek-v4')) return true
  if (m.includes('mimo-v2.5') || m.includes('mimo-v2-pro')) return true
  return false
}
