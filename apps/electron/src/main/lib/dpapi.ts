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

function loadDpapi(): DpapiBindings {
  const platform = process.platform === 'win32' ? 'win32' : process.platform
  const arch = process.arch === 'x64' ? 'x64' : 'arm64'
  const filename = '@primno+dpapi.node'

  // 生产环境：electron-builder 将 prebuilds 打入 extraResources/dpapi-prebuilds/
  // 开发环境：node_modules/@primno/dpapi/prebuilds/ 通过 __dirname 定位
  const prebuildsDir = app.isPackaged
    ? join(process.resourcesPath, 'dpapi-prebuilds')
    : join(__dirname, '..', 'node_modules', '@primno', 'dpapi', 'prebuilds')

  const prebuildPath = join(prebuildsDir, `${platform}-${arch}`, filename)

  if (existsSync(prebuildPath)) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require(prebuildPath) as DpapiBindings
  }

  throw new Error(
    `DPAPI is not supported on this platform (${platform}-${arch}). ` +
    `Checked: ${prebuildPath}`
  )
}

try {
  dpapi = loadDpapi()
  console.log('[DPAPI] prebuild 加载成功')
} catch (err) {
  // 非 Windows 环境不抛错，由 protectData / unprotectData 内部报错
  console.warn('[DPAPI] prebuild 加载失败，DPAPI 不可用:', (err as Error).message)
  dpapi = null
}

// ===== 公开 API =====

/** DPAPI 加密，返回 base64(StdEncoding) 结果 */
export function protectData(account: string, data: string): string {
  if (!dpapi) {
    throw new Error('DPAPI is not supported on this platform.')
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
    throw new Error('DPAPI is not supported on this platform.')
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
