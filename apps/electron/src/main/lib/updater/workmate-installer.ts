/**
 * WorkMate 安装器
 *
 * 安装前校验 → shell.openPath → 退出应用
 */

import { existsSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { shell } from 'electron'
import { compareVersion, extractVersionFromFileName } from './workmate-version'
import { getInstallerPath } from './workmate-manifest'

export interface InstallerCheckInput {
  fileName: string
  latestVersion: string
  releaseType: 'UPGRADE' | 'ROLLBACK'
  expectedSha256?: string
  expectedFileSize?: number
  currentVersion: string
}

export interface InstallerCheckResult {
  ok: boolean
  error?: string
  installerPath: string
}

/**
 * 安装前校验。
 *
 * 校验 7 项，任一失败返回 ok=false。
 */
export function verifyInstaller(input: InstallerCheckInput): InstallerCheckResult {
  const installerPath = getInstallerPath(input.fileName)

  // 1. 文件存在
  if (!existsSync(installerPath)) {
    return { ok: false, error: '安装包文件不存在', installerPath }
  }

  // 2. 文件大小校验
  if (input.expectedFileSize) {
    const actualSize = statSync(installerPath).size
    if (actualSize !== input.expectedFileSize) {
      return { ok: false, error: `安装包大小不匹配：期望 ${input.expectedFileSize}，实际 ${actualSize}`, installerPath }
    }
  }

  // 3. SHA-256 校验
  if (input.expectedSha256) {
    const actualSha256 = computeSha256(installerPath)
    if (actualSha256 !== input.expectedSha256) {
      return { ok: false, error: `安装包 SHA-256 不匹配`, installerPath }
    }
  }

  // 4. 安装包版本 == latestVersion
  const pkgVersion = extractVersionFromFileName(input.fileName)
  if (!pkgVersion || pkgVersion !== input.latestVersion) {
    return { ok: false, error: `安装包版本(${pkgVersion})与检测版本(${input.latestVersion})不一致`, installerPath }
  }

  // 5. 版本方向校验
  if (input.releaseType === 'UPGRADE') {
    if (compareVersion(pkgVersion, input.currentVersion) <= 0) {
      return { ok: false, error: `升级版本(${pkgVersion})不高于当前版本(${input.currentVersion})`, installerPath }
    }
  } else {
    if (compareVersion(pkgVersion, input.currentVersion) >= 0) {
      return { ok: false, error: `回退版本(${pkgVersion})不低于当前版本(${input.currentVersion})`, installerPath }
    }
  }

  return { ok: true, installerPath }
}

/**
 * 启动安装器并退出应用。
 *
 * @returns true 表示安装器已启动
 */
export async function launchInstaller(installerPath: string): Promise<boolean> {
  console.log('[安装] 启动安装器 %s', installerPath)

  const error = await shell.openPath(installerPath)

  if (error) {
    console.error('[安装] 启动安装器失败:', error)
    return false
  }

  console.log('[安装] 安装器已启动，即将退出应用')
  return true
}

function computeSha256(filePath: string): string {
  const { readFileSync } = require('node:fs')
  const hash = createHash('sha256')
  hash.update(readFileSync(filePath))
  return hash.digest('hex')
}
