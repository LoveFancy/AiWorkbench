/**
 * 运行时初始化协调器
 *
 * 负责协调所有运行时初始化逻辑，包括：
 * 1. Shell 环境加载（macOS）
 * 2. Node.js 运行时检测
 * 3. Bun 运行时检测
 * 4. Git 运行时检测
 * 5. Shell 环境检测（Windows - Git Bash）
 */

import type { RuntimeStatus, RuntimeInitOptions, ShellEnvironmentStatus } from '@proma/shared'
import { loadShellEnv } from './shell-env'
import { detectNodeRuntime } from './node-detector'
import { detectBunRuntime } from './bun-finder'
import { detectGitRuntime, getGitRepoStatus } from './git-detector'
import { detectGitBash } from './git-bash-detector'

/** 运行时状态缓存 */
let runtimeStatusCache: RuntimeStatus | null = null

/** 初始化标志 */
let isInitialized = false

/**
 * 初始化运行时环境
 *
 * 按顺序执行：
 * 1. loadShellEnv() - 加载 Shell 环境（仅 macOS 打包环境）
 * 2. detectNodeRuntime() - 检测 Node.js 运行时
 * 3. detectBunRuntime() - 检测 Bun 运行时
 * 4. detectGitRuntime() - 检测 Git 运行时
 * 5. detectShellEnvironment() - 检测 Shell 环境（仅 Windows）
 *
 * @param options - 初始化选项
 * @returns 运行时状态
 */
export async function initializeRuntime(options: RuntimeInitOptions = {}): Promise<RuntimeStatus> {
  const startTime = Date.now()

  // 1. 加载 Shell 环境
  let envLoaded = false

  if (!options.skipEnvLoad) {
    try {
      const shellEnvResult = await loadShellEnv()
      envLoaded = shellEnvResult.success
    } catch (error) {
      console.error('[运行时初始化] Shell 环境加载失败:', error)
      envLoaded = false
    }
  }

  // 2. 检测 Node.js 运行时
  const nodeStatus = options.skipNodeDetection
    ? {
        available: false,
        path: null,
        version: null,
        error: '已跳过 Node.js 检测',
      }
    : await detectNodeRuntime()

  // 3. 检测 Bun 运行时
  const bunStatus = options.skipBunDetection
    ? {
        available: false,
        path: null,
        version: null,
        source: null,
        error: '已跳过 Bun 检测',
      }
    : await detectBunRuntime()

  // 4. 检测 Git 运行时
  const gitStatus = options.skipGitDetection
    ? {
        available: false,
        version: null,
        path: null,
        error: '已跳过 Git 检测',
      }
    : await detectGitRuntime()

  // 5. 检测 Shell 环境（仅 Windows 平台）
  let shellEnvironmentStatus: ShellEnvironmentStatus | undefined

  if (process.platform === 'win32' && !options.skipShellDetection) {
    try {
      const gitBashStatus = await detectGitBash()

      // WSL 功能已屏蔽，不再检测
      const wslNotReady = {
        available: false,
        version: null,
        defaultDistro: null,
        distros: [],
        error: 'WSL 功能已屏蔽',
      }

      // 推荐策略：仅 Git Bash
      const recommended: 'git-bash' | null = gitBashStatus.available ? 'git-bash' : null

      shellEnvironmentStatus = {
        gitBash: gitBashStatus,
        wsl: wslNotReady,
        recommended,
      }

    } catch (error) {
      console.error('[运行时初始化] Shell 环境检测失败:', error)
    }
  }

  // 构建运行时状态
  const runtimeStatus: RuntimeStatus = {
    node: nodeStatus,
    bun: bunStatus,
    git: gitStatus,
    shell: shellEnvironmentStatus,
    envLoaded,
    initializedAt: Date.now(),
  }

  // 缓存状态
  runtimeStatusCache = runtimeStatus
  isInitialized = true

  const duration = Date.now() - startTime
  const shellSummary = shellEnvironmentStatus
    ? `${shellEnvironmentStatus.recommended || 'none'}`
    : 'skipped'
  console.log(
    `[运行时初始化] 完成 (${duration}ms) | ` +
    `node=${nodeStatus.available ? nodeStatus.version : '✗'} ` +
    `git=${gitStatus.available ? gitStatus.version : '✗'} ` +
    `bun=${bunStatus.available ? bunStatus.version : '✗'} ` +
    `shell=${shellSummary} env=${envLoaded ? 'ok' : 'skip'}`,
  )

  return runtimeStatus
}

/**
 * 获取当前运行时状态
 *
 * @returns 运行时状态，如果未初始化返回 null
 */
export function getRuntimeStatus(): RuntimeStatus | null {
  return runtimeStatusCache
}

/**
 * 检查运行时是否已初始化
 *
 * @returns 是否已初始化
 */
export function isRuntimeInitialized(): boolean {
  return isInitialized
}

/**
 * 重新初始化运行时
 *
 * @param options - 初始化选项
 * @returns 新的运行时状态
 */
export async function reinitializeRuntime(options: RuntimeInitOptions = {}): Promise<RuntimeStatus> {
  isInitialized = false
  runtimeStatusCache = null
  return initializeRuntime(options)
}

// 重新导出子模块的函数，方便外部使用
export { getGitRepoStatus } from './git-detector'
export { detectNodeRuntime } from './node-detector'
export { detectBunRuntime } from './bun-finder'
export { loadShellEnv } from './shell-env'
