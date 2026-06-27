/**
 * Windows DPAPI 工具类 — 与 lark-cli (keychain_windows.go) 对齐
 *
 * 直接加载 @primno/dpapi 的 prebuild 二进制，绕过 node-gyp-build 在 
 * Bun workspace 下的模块解析问题（node-gyp-build 被 hoist 到 .bun 目录，
 * 在 @primno/dpapi 的 require 上下文里找不到）。
 *
 * - entropy 格式: "lark-cli\x00{account}"
 * - 加密后 base64(StdEncoding) 写入 Registry
 */

import { join } from 'node:path'
import { homedir } from 'node:os'
import { existsSync } from 'node:fs'
import { app } from 'electron'

export const LARK_CLI_DIR = join(homedir(), '.lark-cli')

// ===== 直接加载 prebuild =====

interface DpapiBindings {
  protectData(dataToEncrypt: Buffer, optionalEntropy: Buffer, scope: string): Buffer
  unprotectData(encryptData: Buffer, optionalEntropy: Buffer, scope: string): Buffer
}

let dpapi: DpapiBindings | null
let dpapiLoadError: Error | null = null

interface DpapiPrebuildOptions {
  isPackaged: boolean
  resourcesPath?: string
  dirname: string
  platform: NodeJS.Platform | string
  arch: string
}

const DPAPI_PREBUILD_FILENAME = '@primno+dpapi.node'

function normalizeDpapiPlatform(platform: NodeJS.Platform | string): string {
  return platform === 'win32' ? 'win32' : platform
}

function normalizeDpapiArch(arch: string): string {
  if (arch === 'x64' || arch === 'arm64') return arch
  return arch
}

function uniquePaths(paths: string[]): string[] {
  return Array.from(new Set(paths))
}

export function buildDpapiPrebuildCandidates(options: DpapiPrebuildOptions): string[] {
  const platform = normalizeDpapiPlatform(options.platform)
  const arch = normalizeDpapiArch(options.arch)
  const prebuildDirName = `${platform}-${arch}`
  const packagePrebuildParts = ['node_modules', '@primno', 'dpapi', 'prebuilds', prebuildDirName, DPAPI_PREBUILD_FILENAME]
  const candidates: string[] = []

  if (options.isPackaged && options.resourcesPath) {
    candidates.push(join(options.resourcesPath, 'dpapi-prebuilds', prebuildDirName, DPAPI_PREBUILD_FILENAME))
    candidates.push(join(options.resourcesPath, 'app.asar.unpacked', ...packagePrebuildParts))
  }

  candidates.push(join(options.dirname, '..', ...packagePrebuildParts))
  candidates.push(join(options.dirname, '..', '..', ...packagePrebuildParts))
  candidates.push(join(options.dirname, '..', '..', '..', ...packagePrebuildParts))
  candidates.push(join(process.cwd(), ...packagePrebuildParts))

  return uniquePaths(candidates)
}

export function resolveDpapiPrebuildPath(options: DpapiPrebuildOptions): string {
  const platform = normalizeDpapiPlatform(options.platform)
  const arch = normalizeDpapiArch(options.arch)
  const candidates = buildDpapiPrebuildCandidates(options)
  const found = candidates.find((candidate) => existsSync(candidate))

  if (found) return found

  throw new Error(
    `DPAPI is not supported on this platform (${platform}-${arch}). ` +
    `已检查路径: ${candidates.join('; ')}`
  )
}

function getResourcesPath(): string | undefined {
  const processWithResources = process as NodeJS.Process & { resourcesPath?: string }
  return processWithResources.resourcesPath
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function loadDpapi(): DpapiBindings {
  const options: DpapiPrebuildOptions = {
    isPackaged: app.isPackaged,
    resourcesPath: getResourcesPath(),
    dirname: __dirname,
    platform: process.platform,
    arch: process.arch,
  }
  const prebuildPath = resolveDpapiPrebuildPath(options)

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require(prebuildPath) as DpapiBindings
  } catch (error) {
    throw new Error(`DPAPI native 模块加载失败: ${prebuildPath}; ${formatError(error)}`)
  }
}

try {
  dpapi = loadDpapi()
  console.log('[DPAPI] prebuild 加载成功')
} catch (error) {
  // 非 Windows 环境不抛错，由 protectData / unprotectData 内部报错
  console.warn('[DPAPI] prebuild 加载失败，DPAPI 不可用:', (error as Error).message)
  dpapi = null
  dpapiLoadError = error instanceof Error ? error : new Error(String(error))
}

// ===== 公开 API =====

/** DPAPI 加密，返回 base64(StdEncoding) 结果 */
export function protectData(account: string, data: string): string {
  if (!dpapi) {
    throw new Error(dpapiLoadError?.message ?? 'DPAPI is not supported on this platform.')
  }
  try {
    const entropy = Buffer.concat([
      Buffer.from('lark-cli', 'utf-8'),
      Buffer.from([0]),
      Buffer.from(account, 'utf-8'),
    ])
    const encrypted = dpapi.protectData(Buffer.from(data, 'utf-8'), entropy, 'CurrentUser')
    console.log('[DPAPI] 加密成功, account:', account.substring(0, 8) + '...')
    return encrypted.toString('base64')
  } catch (err) {
    console.error('[DPAPI] 加密失败, account:', account.substring(0, 8) + '...', (err as Error).message)
    throw err
  }
}

/** DPAPI 解密，返回原文 */
export function unprotectData(account: string, encryptedB64: string): string {
  if (!dpapi) {
    throw new Error(dpapiLoadError?.message ?? 'DPAPI is not supported on this platform.')
  }
  // 校验 base64 格式，避免 Buffer.from(_, 'base64') 静默吞掉非法字符
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encryptedB64)) {
    throw new Error('无效的 base64 编码')
  }
  try {
    const entropy = Buffer.concat([
      Buffer.from('lark-cli', 'utf-8'),
      Buffer.from([0]),
      Buffer.from(account, 'utf-8'),
    ])
    const decrypted = dpapi.unprotectData(Buffer.from(encryptedB64, 'base64'), entropy, 'CurrentUser')
    console.log('[DPAPI] 解密成功, account:', account.substring(0, 8) + '...')
    return decrypted.toString('utf-8')
  } catch (err) {
    console.error('[DPAPI] 解密失败, account:', account.substring(0, 8) + '...', (err as Error).message)
    throw err
  }
}
