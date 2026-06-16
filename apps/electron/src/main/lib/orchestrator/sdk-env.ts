/**
 * SDK 环境变量构建
 *
 * 将 API Key、Base URL、代理、Shell 等环境变量注入到 SDK 运行环境中。
 * 按 provider 类型分别设置认证方式：
 * - Kimi / Zhipu / Xiaomi → Bearer (ANTHROPIC_AUTH_TOKEN)
 * - MiniMax → Bearer + 超长超时
 * - 其余 → ANTHROPIC_API_KEY
 */

import type { ProviderType } from '@proma/shared'
import { getSdkConfigDir } from '../config-paths'
import { getEffectiveProxyUrl } from '../proxy-settings-service'
import { getRuntimeStatus } from '../runtime-init'
import { normalizeAnthropicBaseUrlForSdk, getPromaUserAgent } from '@proma/core'
import pkg from '../../../../package.json' with { type: 'json' }

export async function buildSdkEnv(
  apiKey: string,
  baseUrl: string | undefined,
  provider: ProviderType,
): Promise<Record<string, string | undefined>> {
  const DEFAULT_ANTHROPIC_URL = 'https://api.anthropic.com'

  // 从 process.env 继承系统变量，但清理所有 ANTHROPIC_ 前缀的变量，
  // 防止本地开发环境（如 ANTHROPIC_AUTH_TOKEN、ANTHROPIC_API_KEY、
  // ANTHROPIC_BASE_URL 等）干扰 SDK 的认证和请求目标。
  // 即使 index.ts 启动时已清理过一次，initializeRuntime() 中的
  // loadShellEnv() 可能从 shell 配置文件（~/.zshrc 等）重新注入这些变量。
  const cleanEnv: Record<string, string | undefined> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith('ANTHROPIC_')) {
      cleanEnv[key] = value
    }
  }

  const sdkEnv: Record<string, string | undefined> = {
    ...cleanEnv,
    // 提升输出 token 上限，避免 "exceeded 32000 output token maximum" 错误
    CLAUDE_CODE_MAX_OUTPUT_TOKENS: '64000',
    // 启用 Tasks 功能
    CLAUDE_CODE_ENABLE_TASKS: 'true',
    // 禁用实验性 beta 功能，使用稳定模式
    CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS: '1',
    // 配置隔离：让 SDK 使用独立的配置目录，不读取用户的 ~/.claude.json
    CLAUDE_CONFIG_DIR: getSdkConfigDir(),
  }

  // 认证方式按 provider 分支
  // - Kimi Coding Plan：只认 Bearer，通过 ANTHROPIC_CUSTOM_HEADERS 注入 Proma UA
  // - MiniMax Coding Plan：Claude Code 场景使用 Bearer（ANTHROPIC_AUTH_TOKEN）
  // - 通过 ANTHROPIC_AUTH_TOKEN 让 SDK 发 Authorization: Bearer
  // - 其它：ANTHROPIC_API_KEY（SDK 内部会同时带上 x-api-key 和 Bearer）
  if (provider === 'kimi-coding' || provider === 'zhipu-coding' || provider === 'xiaomi-token-plan') {
    sdkEnv.ANTHROPIC_AUTH_TOKEN = apiKey
    sdkEnv.ANTHROPIC_CUSTOM_HEADERS = `User-Agent: ${getPromaUserAgent(pkg.version)}`
  } else if (provider === 'minimax') {
    sdkEnv.ANTHROPIC_AUTH_TOKEN = apiKey
    sdkEnv.API_TIMEOUT_MS = '3000000'
    sdkEnv.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = '1'
  } else {
    sdkEnv.ANTHROPIC_API_KEY = apiKey
  }

  // 显式控制 ANTHROPIC_BASE_URL：仅在用户配置了自定义 Base URL 时注入
  // 使用统一的 normalizeAnthropicBaseUrlForSdk 规范化，SDK 内部会自动拼接 /v1/messages
  if (baseUrl && baseUrl !== DEFAULT_ANTHROPIC_URL) {
    sdkEnv.ANTHROPIC_BASE_URL = normalizeAnthropicBaseUrlForSdk(baseUrl)
  }

  const proxyUrl = await getEffectiveProxyUrl()
  if (proxyUrl) {
    sdkEnv.HTTPS_PROXY = proxyUrl
    sdkEnv.HTTP_PROXY = proxyUrl
  }

  // Windows 平台：配置 Shell 环境
  if (process.platform === 'win32') {
    const runtimeStatus = getRuntimeStatus()
    const shellStatus = runtimeStatus?.shell

    if (shellStatus) {
      if (shellStatus.gitBash?.available && shellStatus.gitBash.path) {
        sdkEnv.CLAUDE_CODE_SHELL = shellStatus.gitBash.path
        console.log(`[Agent 编排] 配置 Shell 环境: Git Bash (${shellStatus.gitBash.path})`)
      } else {
        console.warn('[Agent 编排] Windows 平台未检测到可用的 Git Bash')
      }
      sdkEnv.CLAUDE_BASH_NO_LOGIN = '1'
    }
  }

  // 针对 claude-agent-sdk 0.2.111+ 的 options.env 叠加语义加固：
  // SDK 将 options.env 叠加到 process.env 之上传递给子进程。
  // 若 shell 中存在 ANTHROPIC_CUSTOM_HEADERS、ANTHROPIC_MODEL 等变量，
  // 且 sdkEnv 未显式管理，叠加后会回流到 SDK 子进程。
  // 对于 sdkEnv 未显式管理的 ANTHROPIC_* 变量，显式置空字符串以覆盖回流。
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('ANTHROPIC_') && !(key in sdkEnv)) {
      sdkEnv[key] = ''
    }
  }

  return sdkEnv
}
