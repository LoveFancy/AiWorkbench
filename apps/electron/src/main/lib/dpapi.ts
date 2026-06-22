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

export const LARK_CLI_DIR = join(homedir(), '.lark-cli')

// ===== 直接加载 prebuild =====

interface DpapiBindings {
  protectData(dataToEncrypt: Buffer, optionalEntropy: Buffer, scope: string): Buffer
  unprotectData(encryptData: Buffer, optionalEntropy: Buffer, scope: string): Buffer
}

let dpapi: DpapiBindings

function loadDpapi(): DpapiBindings {
  const platform = process.platform === 'win32' ? 'win32' : process.platform
  const arch = process.arch === 'x64' ? 'x64' : 'arm64'
  const filename = process.platform === 'win32' ? '@primno+dpapi.node' : `@primno+dpapi.node`

  // Electron 39 ships bundled @primno/dpapi
  const searchPaths = [
    join(__dirname, '..', 'node_modules', '@primno', 'dpapi', 'prebuilds', `${platform}-${arch}`, filename),
    join(__dirname, '..', '..', 'node_modules', '@primno', 'dpapi', 'prebuilds', `${platform}-${arch}`, filename),
  ]

  for (const p of searchPaths) {
    if (existsSync(p)) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        return require(p) as DpapiBindings
      } catch { /* try next */ }
    }
  }

  throw new Error(
    `DPAPI is not supported on this platform (${platform}-${arch}). ` +
    `Checked: ${searchPaths.join(', ')}`
  )
}

try {
  dpapi = loadDpapi()
} catch {
  // 非 Windows 环境不抛错，由 protectData / unprotectData 内部报错
  dpapi = null as unknown as DpapiBindings
}

// ===== 公开 API =====

/** DPAPI 加密，返回 base64(StdEncoding) 结果 */
export function protectData(account: string, data: string): string {
  if (!dpapi) {
    throw new Error('DPAPI is not supported on this platform.')
  }
  const entropy = Buffer.concat([
    Buffer.from('lark-cli', 'utf-8'),
    Buffer.from([0]),
    Buffer.from(account, 'utf-8'),
  ])
  const encrypted = dpapi.protectData(Buffer.from(data, 'utf-8'), entropy, 'CurrentUser')
  return Buffer.from(encrypted).toString('base64')
}

/** DPAPI 解密，返回原文 */
export function unprotectData(account: string, encryptedB64: string): string {
  if (!dpapi) {
    throw new Error('DPAPI is not supported on this platform.')
  }
  const entropy = Buffer.concat([
    Buffer.from('lark-cli', 'utf-8'),
    Buffer.from([0]),
    Buffer.from(account, 'utf-8'),
  ])
  const decrypted = dpapi.unprotectData(Buffer.from(encryptedB64, 'base64'), entropy, 'CurrentUser')
  return Buffer.from(decrypted).toString('utf-8')
}
