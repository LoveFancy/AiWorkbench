/**
 * Git Bash 环境检测模块（Windows 平台）
 *
 * 负责检测 Git for Windows 安装的 Git Bash 环境：
 * - 检测 bash.exe 可执行文件路径
 * - 验证 Bash 版本
 * - 提供环境可用性状态
 *
 * 检测策略：
 * 1. 常见安装路径（Program Files）
 * 2. 系统 PATH 查找（where bash）
 * 3. 从注册表读取 Git for Windows 安装路径
 */

import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { GitBashStatus } from '@proma/shared'
import { getGitForWindowsInstallPath } from './windows-env'
import { decodeCommandOutput } from './windows-command-output'

/**
 * 获取 Git for Windows 常见安装路径列表
 *
 * 在调用时读取 process.env，确保 loadWindowsEnv() 已执行后路径完整。
 */
function getCommonGitBashPaths(): string[] {
  const paths: string[] = []
  const scoop = process.env.SCOOP
  const localAppData = process.env.LOCALAPPDATA
  const programFiles = process.env.ProgramFiles || 'C:\\Program Files'

  // [GitBashDebug] 临时调试日志：打印生成候选路径所依赖的环境变量
  console.log(
    `[GitBashDebug] 环境变量快照: SCOOP=${scoop ?? '(未设置)'} | ` +
    `LOCALAPPDATA=${localAppData ?? '(未设置)'} | ProgramFiles=${programFiles}`,
  )

  // 包管理器安装位置（优先检测）
  if (scoop) {
    paths.push(
      join(scoop, 'apps', 'git', 'current', 'bin', 'bash.exe'),
      join(scoop, 'apps', 'git', 'current', 'usr', 'bin', 'bash.exe'),
    )
  }
  if (localAppData) {
    paths.push(
      join(localAppData, 'scoop', 'apps', 'git', 'current', 'bin', 'bash.exe'),
      join(localAppData, 'scoop', 'apps', 'git', 'current', 'usr', 'bin', 'bash.exe'),
    )
  }

  // 官方安装器默认位置
  paths.push(
    join(programFiles, 'Git', 'bin', 'bash.exe'),
    'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
    join(programFiles, 'Git', 'usr', 'bin', 'bash.exe'),
    'C:\\Program Files (x86)\\Git\\usr\\bin\\bash.exe',
  )

  // [GitBashDebug] 临时调试日志：打印完整候选路径列表
  console.log(
    `[GitBashDebug] 策略1 候选路径(${paths.length}):\n` +
    paths.map((p, i) => `  [${i + 1}] ${p}`).join('\n'),
  )

  return paths
}

/**
 * 验证 bash.exe 路径并获取版本
 *
 * @param bashPath - bash.exe 可执行文件路径
 * @returns Bash 版本号，如果验证失败返回 null
 */
function verifyBashPath(bashPath: string): string | null {
  try {
    if (!existsSync(bashPath)) {
      // [GitBashDebug] 临时调试日志：文件不存在
      console.log(`[GitBashDebug] verify 跳过(文件不存在): ${bashPath}`)
      return null
    }

    // [GitBashDebug] 临时调试日志：文件存在，开始执行 --version
    console.log(`[GitBashDebug] verify 文件存在，执行 --version: ${bashPath}`)

    // 执行 bash --version 获取版本信息
    const output = execSync(`"${bashPath}" --version`, {
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const text = decodeCommandOutput(output)

    // [GitBashDebug] 临时调试日志：--version 原始输出片段
    console.log(
      `[GitBashDebug] verify --version 输出片段: ${text.trim().slice(0, 160)}`,
    )

    // 解析版本号（示例输出："GNU bash, version 5.2.15(1)-release (x86_64-pc-msys)"）
    const versionMatch = text.match(/version\s+(\S+)/)
    if (versionMatch?.[1]) {
      // 提取主版本号（如 "5.2.15(1)-release" → "5.2.15"）
      const cleanVersion = versionMatch[1]!.split('(')[0]!
      // [GitBashDebug] 临时调试日志：验证通过
      console.log(`[GitBashDebug] verify 通过: ${bashPath} (v${cleanVersion})`)
      return cleanVersion
    }

    // [GitBashDebug] 临时调试日志：文件可执行但无法解析版本
    console.warn(`[GitBashDebug] verify 无法解析版本号: ${bashPath}`)
    return null
  } catch (error) {
    // [GitBashDebug] 临时调试日志：执行 --version 抛错（权限/损坏/超时等）
    console.warn(
      `[GitBashDebug] verify 执行失败: ${bashPath} | ${(error as Error).message}`,
    )
    return null
  }
}

/**
 * 通过 where 命令查找 bash.exe
 *
 * @returns bash.exe 路径，失败返回 null
 */
function findBashInPath(): string | null {
  try {
    const output = execSync('where bash', {
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    // where 命令可能返回多个路径，取第一个
    const paths = decodeCommandOutput(output).trim().split(/\r?\n/)

    // [GitBashDebug] 临时调试日志：where bash 原始结果
    console.log(
      `[GitBashDebug] where bash 命中(${paths.length}):\n` +
      paths.map((p, i) => `  [${i + 1}] ${p.trim()}`).join('\n'),
    )

    for (const path of paths) {
      const trimmedPath = path.trim()
      // 优先选择包含 "Git" 的路径
      if (trimmedPath.toLowerCase().includes('git')) {
        // [GitBashDebug] 临时调试日志：优先选中含 git 的路径
        console.log(`[GitBashDebug] where bash 优先选中(含 git): ${trimmedPath}`)
        return trimmedPath
      }
    }

    // 没有 Git 相关路径，返回第一个
    const fallback = paths[0]?.trim() || null
    // [GitBashDebug] 临时调试日志：无含 git 路径，回退第一个
    console.log(`[GitBashDebug] where bash 无含 git 路径，回退: ${fallback ?? '(空)'}`)
    return fallback
  } catch (error) {
    // [GitBashDebug] 临时调试日志：where bash 命令失败（通常表示 PATH 中无 bash）
    console.warn(
      `[GitBashDebug] where bash 执行失败: ${(error as Error).message}`,
    )
    return null
  }
}

/**
 * 检测 Git Bash 环境
 *
 * 检测顺序：
 * 1. 尝试常见安装路径
 * 2. 从注册表读取 Git for Windows 安装路径
 * 3. 通过 where 命令在 PATH 中查找
 *
 * @returns Git Bash 状态
 */
export async function detectGitBash(): Promise<GitBashStatus> {
  // [GitBashDebug] 临时调试日志：检测开始
  console.log(
    `[GitBashDebug] ===== detectGitBash 开始 | platform=${process.platform} =====`,
  )
  // [GitBashDebug] 临时调试日志：打印 PATH（截断，避免过长）
  console.log(`[GitBashDebug] PATH=${(process.env.PATH ?? '(空)').slice(0, 600)}`)

  // 仅在 Windows 平台执行
  if (process.platform !== 'win32') {
    console.log('[GitBashDebug] 非 Windows 平台，直接返回不可用')
    return {
      available: false,
      path: null,
      version: null,
      error: '非 Windows 平台',
    }
  }

  // 策略 1：检查常见安装路径
  console.log('[GitBashDebug] ---- 策略1: 扫描常见安装路径 ----')
  for (const path of getCommonGitBashPaths()) {
    const version = verifyBashPath(path)
    if (version) {
      console.log(`[GitBashDebug] 策略1 命中: ${path} (v${version})`)
      return {
        available: true,
        path,
        version,
        error: null,
      }
    }
  }
  console.log('[GitBashDebug] 策略1 未命中')

  // 策略 2：从注册表读取安装路径
  console.log('[GitBashDebug] ---- 策略2: 读取注册表 GitForWindows ----')
  const gitInstallPath = getGitForWindowsInstallPath()
  console.log(`[GitBashDebug] 策略2 注册表 InstallPath=${gitInstallPath ?? '(未读到)'}`)
  if (gitInstallPath) {
    const candidatePaths = [
      join(gitInstallPath, 'bin', 'bash.exe'),
      join(gitInstallPath, 'usr', 'bin', 'bash.exe'),
    ]
    console.log(
      `[GitBashDebug] 策略2 候选路径:\n` +
      candidatePaths.map((p, i) => `  [${i + 1}] ${p}`).join('\n'),
    )

    for (const path of candidatePaths) {
      const version = verifyBashPath(path)
      if (version) {
        console.log(`[GitBashDebug] 策略2 命中: ${path} (v${version})`)
        return {
          available: true,
          path,
          version,
          error: null,
        }
      }
    }
  }
  console.log('[GitBashDebug] 策略2 未命中')

  // 策略 3：通过 where 命令查找
  console.log('[GitBashDebug] ---- 策略3: where bash ----')
  const pathBash = findBashInPath()
  if (pathBash) {
    const version = verifyBashPath(pathBash)
    if (version) {
      console.log(`[GitBashDebug] 策略3 命中: ${pathBash} (v${version})`)
      return {
        available: true,
        path: pathBash,
        version,
        error: null,
      }
    }
  }
  console.log('[GitBashDebug] 策略3 未命中')

  // 所有策略失败
  console.warn('[Git Bash 检测] 未找到可用的 Git Bash 环境')
  console.warn('[GitBashDebug] ===== 所有策略均未命中，检测失败 =====')
  return {
    available: false,
    path: null,
    version: null,
    error: '未找到 Git Bash 环境，请安装 Git for Windows',
  }
}
