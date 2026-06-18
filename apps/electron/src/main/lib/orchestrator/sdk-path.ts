/**
 * SDK CLI 路径解析 & 插件列表构建
 */

import { createRequire } from 'node:module'
import { join, dirname } from 'node:path'
import { existsSync } from 'node:fs'
import { app } from 'electron'
import { getAgentWorkspacePath } from '../config-paths'
import { buildPluginRuntimePaths } from '../plugin-registry-service'

/**
 * 解析 SDK native CLI binary 路径
 *
 * 0.2.113+ 起 SDK 改为按平台分发 native binary，通过 optionalDependencies 安装到
 * `@anthropic-ai/claude-agent-sdk-{platform}-{arch}` 子包，与主包 `@anthropic-ai/claude-agent-sdk`
 * 同级。binary 名 macOS/Linux 为 `claude`，Windows 为 `claude.exe`。
 *
 * SDK 作为 esbuild external 依赖，require.resolve 可在运行时解析主包入口路径，
 * 再沿父目录 `@anthropic-ai/` 找到同级的平台子包。
 *
 * 多种策略降级：createRequire → 全局 require → cwd/node_modules 手动查找
 * 打包环境下：asar 内的路径需要转换为 asar.unpacked 路径（即便 Proma 当前 `asar: false`
 * 兜底不伤人）。
 */
export function resolveSDKCliPath(): string {
  const subpkg = `claude-agent-sdk-${process.platform}-${process.arch}`
  const scopedSubpkg = `@anthropic-ai/${subpkg}`
  const binaryName = process.platform === 'win32' ? 'claude.exe' : 'claude'
  let binaryPath: string | null = null

  // 策略 1：createRequire（标准 ESM/CJS 互操作）
  try {
    const cjsRequire = createRequire(__filename)
    const sdkEntryPath = cjsRequire.resolve('@anthropic-ai/claude-agent-sdk')
    // sdkEntryPath: .../@anthropic-ai/claude-agent-sdk/sdk.mjs
    // anthropicDir:  .../@anthropic-ai
    const anthropicDir = dirname(dirname(sdkEntryPath))
    binaryPath = join(anthropicDir, subpkg, binaryName)
    console.log(`[Agent 编排] SDK binary 路径 (createRequire): ${binaryPath}`)
    if (!existsSync(binaryPath)) {
      const subpkgPackagePath = cjsRequire.resolve(`${scopedSubpkg}/package.json`)
      binaryPath = join(dirname(subpkgPackagePath), binaryName)
    }
  } catch (e) {
    console.warn('[Agent 编排] createRequire 解析 SDK 路径失败:', e)
  }

  // 策略 2：全局 require（esbuild CJS bundle 可能保留）
  if (!binaryPath || !existsSync(binaryPath)) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const sdkEntryPath = require.resolve('@anthropic-ai/claude-agent-sdk')
      const anthropicDir = dirname(dirname(sdkEntryPath))
      binaryPath = join(anthropicDir, subpkg, binaryName)
      if (!existsSync(binaryPath)) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const subpkgPackagePath = require.resolve(`${scopedSubpkg}/package.json`)
        binaryPath = join(dirname(subpkgPackagePath), binaryName)
      }
    } catch (e) {
      console.warn('[Agent 编排] require.resolve 解析 SDK 路径失败:', e)
    }
  }

  // 策略 3：从当前模块目录手动查找（打包后 __dirname 指向 app/dist/，上一级即 app/）
  // 注意：不使用 process.cwd()，因为打包后的 Electron 应用 cwd 通常是 '/'
  // 或用户主目录，与 app 安装目录无关。
  if (!binaryPath || !existsSync(binaryPath)) {
    binaryPath = join(__dirname, '..', '..', 'node_modules', '@anthropic-ai', subpkg, binaryName)
  }

  // 打包环境：将 .asar/ 路径转换为 .asar.unpacked/
  if (app.isPackaged && binaryPath.includes('.asar')) {
    binaryPath = binaryPath.replace(/\.asar([/\\])/, '.asar.unpacked$1')
  }

  return binaryPath
}

/** 构建 SDK local plugin 列表：当前工作区插件 + 已启用的全局插件 */
export function getAgentPluginPaths(workspaceSlug?: string): Array<{ type: 'local'; path: string }> {
  return [
    ...(workspaceSlug ? [{ type: 'local' as const, path: getAgentWorkspacePath(workspaceSlug) }] : []),
    ...buildPluginRuntimePaths(),
  ]
}
