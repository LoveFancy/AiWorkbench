/**
 * Windows DPAPI 工具类 — 与 lark-cli (keychain_windows.go) 对齐
 *
 * - entropy 格式: "lark-cli\x00{account}"
 * - 加密后 base64(StdEncoding) 写入 Registry
 * - 通过 @primno/dpapi native addon 调用 CryptProtectData
 */

import { join } from 'node:path'
import { homedir } from 'node:os'
import { Dpapi } from '@primno/dpapi'

export const LARK_CLI_DIR = join(homedir(), '.lark-cli')

/** DPAPI 加密，返回 base64(StdEncoding) 结果 */
export function protectData(account: string, data: string): string {
  const entropy = Buffer.concat([
    Buffer.from('lark-cli', 'utf-8'),
    Buffer.from([0]),
    Buffer.from(account, 'utf-8'),
  ])
  const encrypted = Dpapi.protectData(Buffer.from(data, 'utf-8'), entropy, 'CurrentUser')
  return Buffer.from(encrypted).toString('base64')
}

/** DPAPI 解密，返回原文 */
export function unprotectData(account: string, encryptedB64: string): string {
  const entropy = Buffer.concat([
    Buffer.from('lark-cli', 'utf-8'),
    Buffer.from([0]),
    Buffer.from(account, 'utf-8'),
  ])
  const decrypted = Dpapi.unprotectData(Buffer.from(encryptedB64, 'base64'), entropy, 'CurrentUser')
  return Buffer.from(decrypted).toString('utf-8')
}