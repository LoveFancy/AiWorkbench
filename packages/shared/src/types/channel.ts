/**
 * 渠道（Channel）相关类型定义
 *
 * 渠道是用户配置的 AI 供应商连接，包含 API Key、模型列表等信息。
 * API Key 使用 Electron safeStorage 加密后存储在本地配置文件中。
 */

/**
 * 支持的 AI 供应商类型
 */
export type ProviderType =
  | 'anthropic'
  | 'anthropic-compatible'
  | 'openai'
  | 'deepseek'
  | 'google'
  | 'kimi-api'
  | 'kimi-coding'
  | 'zhipu'
  | 'zhipu-coding'
  | 'minimax'
  | 'huatai-anthropic'
  | 'doubao'
  | 'qwen'
  | 'xiaomi'
  | 'xiaomi-token-plan'
  | 'custom'

/**
 * 各供应商的默认 Base URL
 */
export const PROVIDER_DEFAULT_URLS: Record<ProviderType, string> = {
  anthropic: 'https://api.anthropic.com',
  'anthropic-compatible': '',
  openai: 'https://api.openai.com/v1',
  deepseek: 'https://api.deepseek.com/anthropic',
  google: 'https://generativelanguage.googleapis.com',
  'kimi-api': 'https://api.moonshot.cn/anthropic',
  'kimi-coding': 'https://api.kimi.com/coding/v1',
  zhipu: 'https://open.bigmodel.cn/api/paas/v4',
  'zhipu-coding': 'https://open.bigmodel.cn/api/anthropic',
  minimax: 'https://api.minimaxi.com/anthropic',
  'huatai-anthropic': 'http://168.63.65.40:8090/llm-service/v1/messages',
  doubao: 'https://ark.cn-beijing.volces.com/api/v3',
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  xiaomi: 'https://api.xiaomimimo.com/anthropic',
  'xiaomi-token-plan': 'https://token-plan-cn.xiaomimimo.com/anthropic',
  custom: '',
}

/**
 * 各供应商的默认模型列表
 */
export const PROVIDER_DEFAULT_MODELS: Partial<Record<ProviderType, ChannelModel[]>> = {
  deepseek: [
    { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', enabled: true },
    { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', enabled: true },
  ],
  'kimi-api': [
    { id: 'kimi-k2.6', name: 'Kimi K2.6', enabled: true },
  ],
  'kimi-coding': [
    { id: 'kimi-for-coding', name: 'Kimi for Coding', enabled: true },
  ],
  minimax: [
    { id: 'MiniMax-M3', name: 'MiniMax-M3', enabled: true },
    { id: 'MiniMax-M2.7', name: 'MiniMax-M2.7', enabled: true },
  ],
  zhipu: [
    { id: 'glm-5.1', name: 'GLM-5.1', enabled: true },
  ],
  'zhipu-coding': [
    { id: 'glm-5.1', name: 'GLM-5.1', enabled: true },
  ],
  'huatai-anthropic': [
    { id: 'saas-doubao-15-pro-32k', name: 'saas-doubao-15-pro-32k', enabled: false, supportsMultimodal: false },
    { id: 'saas-deepseek-v32', name: 'saas-deepseek-v32', enabled: false, supportsMultimodal: false },
    { id: 'local-deepseek-v32', name: 'local-deepseek-v32', enabled: false, supportsMultimodal: false },
    { id: 'local-qwen36-27b', name: 'local-qwen36-27b', enabled: false, supportsMultimodal: true },
    { id: 'local-qwen3-235b-nothink-moe', name: 'local-qwen3-235b-nothink-moe', enabled: false, supportsMultimodal: false },
    { id: 'saas-doubao-seed-20-pro', name: 'saas-doubao-seed-20-pro', enabled: false, supportsMultimodal: true },
    { id: 'saas-kimi-k25', name: 'saas-kimi-k25', enabled: false, supportsMultimodal: true },
    { id: 'saas-kimi-k26', name: 'saas-kimi-k26', enabled: false, supportsMultimodal: true },
    { id: 'saas-qwen35-397b', name: 'saas-qwen35-397b', enabled: false, supportsMultimodal: true },
    { id: 'local-qwen3-vl-30b', name: 'local-qwen3-vl-30b', enabled: false, supportsMultimodal: true },
    { id: 'saas-glm-51', name: 'saas-glm-51', enabled: false, supportsMultimodal: true },
    { id: 'saas-qwen36-plus', name: 'saas-qwen36-plus', enabled: false, supportsMultimodal: false },
    { id: 'saas-deepseek-v4-flash', name: 'saas-deepseek-v4-flash', enabled: false, supportsMultimodal: false },
    { id: 'saas-deepseek-v4-pro', name: 'saas-deepseek-v4-pro', enabled: false, supportsMultimodal: false },
  ],
  xiaomi: [
    { id: 'mimo-v2.5-pro', name: 'MiMo V2.5 Pro', enabled: true },
    { id: 'mimo-v2-pro', name: 'MiMo V2 Pro', enabled: true },
    { id: 'mimo-v2.5', name: 'MiMo V2.5', enabled: true },
    { id: 'mimo-v2-omni', name: 'MiMo V2 Omni', enabled: true },
    { id: 'mimo-v2-flash', name: 'MiMo V2 Flash', enabled: true },
  ],
  'xiaomi-token-plan': [
    { id: 'mimo-v2.5-pro', name: 'MiMo V2.5 Pro', enabled: true },
    { id: 'mimo-v2-pro', name: 'MiMo V2 Pro', enabled: true },
    { id: 'mimo-v2.5', name: 'MiMo V2.5', enabled: true },
    { id: 'mimo-v2-omni', name: 'MiMo V2 Omni', enabled: true },
    { id: 'mimo-v2-flash', name: 'MiMo V2 Flash', enabled: true },
  ],
}

/**
 * 供应商显示名称
 */
export const PROVIDER_LABELS: Record<ProviderType, string> = {
  anthropic: 'Anthropic',
  'anthropic-compatible': 'Anthropic 兼容格式',
  openai: 'OpenAI',
  deepseek: 'DeepSeek',
  google: 'Google',
  'kimi-api': 'Kimi API (Anthropic 协议)',
  'kimi-coding': 'Kimi Coding Plan',
  zhipu: '智谱 AI',
  'zhipu-coding': '智谱 Coding Plan',
  minimax: 'MiniMax (API&编程包)',
  'huatai-anthropic': '华泰（Anthropic 格式）',
  doubao: '豆包',
  qwen: '通义千问',
  xiaomi: '小米 MiMo (API)',
  'xiaomi-token-plan': '小米 MiMo Token Plan',
  custom: 'OpenAI 兼容格式',
}

/**
 * 支持 Agent 模式的供应商类型
 *
 * Agent SDK 通过 Anthropic 兼容协议调用 `/v1/messages` 端点，
 * 因此所有 Anthropic 协议兼容的供应商都可以用于 Agent。
 */
export const AGENT_COMPATIBLE_PROVIDERS: ReadonlySet<ProviderType> = new Set<ProviderType>([
  'anthropic',
  'anthropic-compatible',
  'deepseek',
  'kimi-api',
  'kimi-coding',
  'zhipu-coding',
  'minimax',
  'huatai-anthropic',
  'xiaomi',
  'xiaomi-token-plan',
])

/**
 * 判断供应商是否兼容 Agent 模式
 */
export function isAgentCompatibleProvider(provider: ProviderType): boolean {
  return AGENT_COMPATIBLE_PROVIDERS.has(provider)
}

/**
 * 渠道中的模型配置
 */
export interface ChannelModel {
  /** 模型唯一标识（如 claude-sonnet-4-5-20250929） */
  id: string
  /** 模型显示名称 */
  name: string
  /** 是否启用 */
  enabled: boolean
  /** 是否支持多模态图片理解 */
  supportsMultimodal?: boolean
}

/**
 * 渠道配置
 *
 * 存储在 ~/.proma/channels.json 中，apiKey 字段为加密后的 base64 字符串
 */
export interface Channel {
  /** 渠道唯一标识 */
  id: string
  /** 渠道名称（用户自定义） */
  name: string
  /** AI 供应商类型 */
  provider: ProviderType
  /** API Base URL */
  baseUrl: string
  /** 加密后的 API Key（base64 编码） */
  apiKey: string
  /** 是否已配置 API Key（由主进程解密后派生，避免渲染进程误判加密空值） */
  apiKeyConfigured?: boolean
  /** 可用模型列表 */
  models: ChannelModel[]
  /** 是否启用 */
  enabled: boolean
  /** 创建时间戳 */
  createdAt: number
  /** 更新时间戳 */
  updatedAt: number
}

/**
 * 创建渠道时的输入数据（apiKey 为明文）
 */
export interface ChannelCreateInput {
  name: string
  provider: ProviderType
  baseUrl: string
  /** 明文 API Key，主进程会加密后存储 */
  apiKey: string
  models: ChannelModel[]
  enabled: boolean
}

/**
 * 更新渠道时的输入数据（所有字段可选）
 */
export interface ChannelUpdateInput {
  name?: string
  provider?: ProviderType
  baseUrl?: string
  /** 明文 API Key，为空字符串表示不更新 */
  apiKey?: string
  models?: ChannelModel[]
  enabled?: boolean
}

/**
 * 渠道配置文件格式
 */
export interface ChannelsConfig {
  /** 配置版本号 */
  version: number
  /** 渠道列表 */
  channels: Channel[]
}

/**
 * 连接测试结果
 */
export interface ChannelTestResult {
  /** 是否成功 */
  success: boolean
  /** 结果消息 */
  message: string
}

/**
 * 拉取模型的输入参数（无需已保存的渠道，直接传入凭证）
 */
export interface FetchModelsInput {
  provider: ProviderType
  baseUrl: string
  /** 明文 API Key */
  apiKey: string
}

/**
 * 拉取模型的结果
 */
export interface FetchModelsResult {
  /** 是否成功 */
  success: boolean
  /** 结果消息 */
  message: string
  /** 获取到的模型列表 */
  models: ChannelModel[]
}

/**
 * 测试单个模型的输入参数（无需已保存的渠道，直接传入当前表单凭证）
 */
export interface ChannelModelTestInput extends FetchModelsInput {
  /** 要测试的模型 ID */
  model: string
}

/**
 * 测试单个模型的结果
 */
export interface ChannelModelTestResult {
  /** 是否成功 */
  success: boolean
  /** 结果消息 */
  message: string
  /** 模型返回的文本内容 */
  content?: string
}

/**
 * 渠道相关 IPC 通道常量
 */
export const CHANNEL_IPC_CHANNELS = {
  /** 获取所有渠道列表 */
  LIST: 'channel:list',
  /** 创建渠道 */
  CREATE: 'channel:create',
  /** 更新渠道 */
  UPDATE: 'channel:update',
  /** 删除渠道 */
  DELETE: 'channel:delete',
  /** 解密获取明文 API Key */
  DECRYPT_KEY: 'channel:decrypt-key',
  /** 测试渠道连接 */
  TEST: 'channel:test',
  /** 从供应商拉取可用模型列表 */
  FETCH_MODELS: 'channel:fetch-models',
  /** 直接测试连接（无需已保存渠道，传入明文凭证） */
  TEST_DIRECT: 'channel:test-direct',
  /** 直接测试单个模型（无需已保存渠道，传入明文凭证和模型 ID） */
  TEST_MODEL_DIRECT: 'channel:test-model-direct',
} as const
