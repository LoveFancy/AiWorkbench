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

import type {
  RuntimeStatus,
  RuntimeInitOptions,
  ShellEnvironmentStatus,
  NodeRuntimeStatus,
  BunRuntimeStatus,
  GitRuntimeStatus,
} from '@proma/shared'
import { loadShellEnv } from './shell-env'
import { detectNodeRuntime } from './node-detector'
import { detectBunRuntime } from './bun-finder'
import { detectGitRuntime, getGitRepoStatus } from './git-detector'
import { detectGitBash } from './git-bash-detector'
import { readRuntimeCache, writeRuntimeCache } from './runtime-cache'

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

  // 2-5. 并行检测 Node / Bun / Git / Git Bash。
  // loadShellEnv 必须先完成（它在 Windows 上填充 PATH），各检测器依赖 PATH，
  // 故先 await loadShellEnv，再把四个检测器用 Promise.all 并发执行（已全部改为异步）。
  const skippedNode: NodeRuntimeStatus = {
    available: false,
    path: null,
    version: null,
    error: '已跳过 Node.js 检测',
  }
  const skippedBun: BunRuntimeStatus = {
    available: false,
    path: null,
    version: null,
    source: null,
    error: '已跳过 Bun 检测',
  }
  const skippedGit: GitRuntimeStatus = {
    available: false,
    version: null,
    path: null,
    error: '已跳过 Git 检测',
  }
  const detectShell = process.platform === 'win32' && !options.skipShellDetection

  const [nodeStatus, bunStatus, gitStatus, gitBashStatus] = await Promise.all([
    options.skipNodeDetection
      ? Promise.resolve(skippedNode)
      : detectNodeRuntime().then((r) => { console.log(`[perf] detectNodeRuntime → ${Date.now() - startTime}ms (累计)`); return r }),
    options.skipBunDetection
      ? Promise.resolve(skippedBun)
      : detectBunRuntime().then((r) => { console.log(`[perf] detectBunRuntime → ${Date.now() - startTime}ms (累计)`); return r }),
    options.skipGitDetection
      ? Promise.resolve(skippedGit)
      : detectGitRuntime().then((r) => { console.log(`[perf] detectGitRuntime → ${Date.now() - startTime}ms (累计)`); return r }),
    detectShell
      ? detectGitBash().then((r) => { console.log(`[perf] detectGitBash → ${Date.now() - startTime}ms (累计)`); return r }).catch((error) => {
          console.error('[运行时初始化] Shell 环境检测失败:', error)
          return null
        })
      : Promise.resolve(null),
  ])

  // 5. 组装 Shell 环境状态（仅 Windows）
  let shellEnvironmentStatus: ShellEnvironmentStatus | undefined
  if (detectShell && gitBashStatus) {
    shellEnvironmentStatus = {
      gitBash: gitBashStatus,
      // WSL 功能已屏蔽，不再检测
      wsl: {
        available: false,
        version: null,
        defaultDistro: null,
        distros: [],
        error: 'WSL 功能已屏蔽',
      },
      // 推荐策略：仅 Git Bash
      recommended: gitBashStatus.available ? 'git-bash' : null,
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

  // 落盘缓存：供下次启动即时返回（后台重测会再次覆盖）
  writeRuntimeCache(runtimeStatus)

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
 * 从磁盘缓存预热运行时状态（启动早期调用）。
 *
 * 仅填充内存缓存，使 getRuntimeStatus() 在后台实时检测完成前即可返回上次的结果，
 * 消除"启动后一段时间读到 null"的窗口。**不**设置 isInitialized，
 * 因此后台仍会执行真实检测并覆盖此乐观值。
 *
 * @returns 命中的缓存状态，未命中返回 null
 */
export function loadRuntimeCacheSync(): RuntimeStatus | null {
  if (runtimeStatusCache) return runtimeStatusCache
  const cached = readRuntimeCache()
  if (cached) {
    runtimeStatusCache = cached
    console.log('[运行时初始化] 已从磁盘缓存预热运行时状态（后台将重新检测）')
  }
  return cached
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
