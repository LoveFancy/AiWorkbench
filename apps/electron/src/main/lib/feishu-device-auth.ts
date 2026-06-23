/**
 * 飞书 CLI 连接器 — 认证服务
 *
 * OAuth 2.0 Device Authorization Grant (RFC 8628).
 * 应用注册通过 SDK registerApp() 完成（在 ipc.ts handler 中）.
 *
 * lark-cli 兼容存储（对齐 keychain_windows.go）：
 *   config.json → apps 数组 + currentApp
 *   Registry: HKCU\Software\LarkCli\keychain\lark-cli
 *     key = base64url(account)    account = appsecret:{appId} 或 {appId}:{userOpenId}
 *     val = base64(DPAPI(data, entropy=lark-cli\x00{account}))
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import { protectData, LARK_CLI_DIR } from './dpapi'
import { getEffectiveProxyUrl } from './proxy-settings-service'
import { HttpsProxyAgent } from 'https-proxy-agent'
import type { FeishuCliAuthState, FeishuCliDeviceCodeData, FeishuCliPollResult } from '@proma/shared'

const FEISHU_BASE = 'https://open.feishu.cn'
const FEISHU_ACCOUNTS = 'https://accounts.feishu.cn'
const CONFIG_PATH = join(LARK_CLI_DIR, 'config.json')

const REG_PATH = 'HKCU\\Software\\LarkCli\\keychain\\lark-cli'
const REG_FULL = 'HKEY_CURRENT_USER\\Software\\LarkCli\\keychain\\lark-cli'

// ===== 代理感知的 fetch =====

/**
 * 带系统代理的 fetch，用于飞书 CLI OAuth 请求。
 * Electron 原生 fetch 不走系统代理，这里通过 HttpsProxyAgent 补偿。
 */
async function proxyFetch(url: string, init?: RequestInit): Promise<Response> {
  const proxyUrl = await getEffectiveProxyUrl()
  if (proxyUrl) {
    console.log('[飞书 CLI 认证] 使用代理:', proxyUrl)
    const agent = new HttpsProxyAgent(proxyUrl)
    return fetch(url, { ...init, dispatcher: agent } as RequestInit & { dispatcher?: unknown })
  }
  return fetch(url, init)
}

const DEVICE_AUTH_SCOPE = [
  'offline_access',
  'calendar:calendar:read', 'calendar:calendar:create', 'calendar:calendar:update', 'calendar:calendar:delete',
  'calendar:calendar.event:read', 'calendar:calendar.event:create', 'calendar:calendar.event:update', 'calendar:calendar.event:delete',
  'calendar:calendar.free_busy:read',
  'im:message', 'im:message:readonly', 'im:message.send_as_user',
  'im:message.p2p_msg:get_as_user', 'im:message.group_msg:get_as_user',
  'im:message.reactions:read', 'im:message.reactions:write_only',
  'im:message.pins:read', 'im:message.pins:write_only',
  'im:chat:read', 'im:chat:update', 'im:chat.members:read', 'im:chat.members:write_only',
  'docx:document:readonly', 'docx:document:create', 'docx:document:write_only',
  'docs:document:copy', 'docs:document:export', 'docs:document.content:read',
  'drive:file:upload', 'drive:file:download', 'drive:drive.metadata:readonly',
  'sheets:spreadsheet:read', 'sheets:spreadsheet:write_only', 'sheets:spreadsheet:create',
  'wiki:wiki:readonly', 'wiki:space:read', 'wiki:node:read', 'wiki:node:create',
  'task:task:read', 'task:task:write',
  'mail:user_mailbox:readonly', 'mail:user_mailbox.message:send',
  'contact:user.basic_profile:readonly', 'contact:user:search',
  'approval:instance:read', 'approval:task:read',
  'search:message',
].join(' ')

// ===== 类型 =====

interface LarkCliUser { userOpenId: string; userName: string }
interface LarkCliAppEntry {
  appId: string; appSecret: { source: string; id: string }
  brand: string; lang: string; defaultAs: string; users: LarkCliUser[]
}
interface LarkCliConfig { apps: LarkCliAppEntry[]; currentApp: string }

function readConfig(): LarkCliConfig | null {
  try { return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8')) } catch { return null }
}

function writeConfig(appId: string, openId: string, userName: string): void {
  const existing = readConfig()
  const apps = [...(existing?.apps ?? [])]
  const idx = apps.findIndex((a) => a.appId === appId)
  const entry: LarkCliAppEntry = {
    appId, brand: 'feishu', lang: 'zh', defaultAs: 'user',
    appSecret: { source: 'keychain', id: `appsecret:${appId}` },
    users: openId ? [{ userOpenId: openId, userName }] : [],
  }
  if (idx >= 0) apps[idx] = entry
  else apps.push(entry)
  if (!existsSync(LARK_CLI_DIR)) mkdirSync(LARK_CLI_DIR, { recursive: true })
  writeFileSync(CONFIG_PATH, JSON.stringify({ apps, currentApp: appId }, null, 2), 'utf-8')
}

// ===== Registry（只用 reg import，不解密） =====

/** 计算 lark-cli 兼容的值名：base64url(account) */
function regNameFor(account: string): string {
  return Buffer.from(account, 'utf-8').toString('base64url')
}

/** DPAPI 加密值，写入到 Registry */
function regSet(account: string, value: string): void {
  if (!existsSync(LARK_CLI_DIR)) mkdirSync(LARK_CLI_DIR, { recursive: true })
  const encryptedB64 = protectData(account, value)
  const regName = regNameFor(account)
  const regFile = join(LARK_CLI_DIR, '.r.reg')
  writeFileSync(regFile, `Windows Registry Editor Version 5.00\r\n\r\n[${REG_FULL}]\r\n"${regName}"="${encryptedB64}"\r\n`, 'utf-8')
  execSync(`reg import "${regFile}"`, { stdio: 'ignore' })
  try { rmSync(regFile, { force: true }) } catch { /* ignore */ }
}

/** 检查 Registry 中是否存在指定 key */
function regHas(account: string): boolean {
  try {
    execSync(`reg query "${REG_PATH}" /v "${regNameFor(account)}"`, { stdio: 'ignore' })
    return true
  } catch { return false }
}

// ===== 公开 API =====

export async function startFeishuDeviceAuth(appId: string, appSecret: string): Promise<FeishuCliDeviceCodeData> {
  regSet(`appsecret:${appId}`, appSecret)
  writeConfig(appId, '', '')

  const resp = await proxyFetch(`${FEISHU_ACCOUNTS}/oauth/v1/device_authorization`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: appId, client_secret: appSecret, grant_type: 'urn:ietf:params:oauth:grant-type:device_code', scope: DEVICE_AUTH_SCOPE }),
  })
  const data = await resp.json()
  if (!data.device_code) throw new Error('设备授权响应缺少 device_code')
  return { deviceCode: data.device_code, verificationUri: data.verification_uri_complete || data.verification_uri, expiresIn: data.expires_in ?? 600, interval: data.interval ?? 5 }
}

export async function pollFeishuDeviceAuth(
  appId: string, appSecret: string, deviceCode: string, phase = 1,
): Promise<FeishuCliPollResult> {
  const resp = await proxyFetch(`${FEISHU_BASE}/open-apis/authen/v2/oauth/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grant_type: 'urn:ietf:params:oauth:grant-type:device_code', device_code: deviceCode, client_id: appId, client_secret: appSecret }),
  })
  const body = await resp.json()
  if (body.error === 'authorization_pending' || body.error === 'slow_down') return { pending: true, phase }
  if (body.error === 'expired_token') throw new Error('device_code 已过期')

  const at = body.data?.access_token || body.access_token
  if (!at) throw new Error(`获取 token 失败: ${JSON.stringify(body).slice(0, 200)}`)
  const rt = body.data?.refresh_token || body.refresh_token

  if (phase === 1 && !rt) {
    await new Promise((r) => setTimeout(r, 5000))
    const r2 = await proxyFetch(`${FEISHU_ACCOUNTS}/oauth/v1/device_authorization`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: appId, client_secret: appSecret, grant_type: 'urn:ietf:params:oauth:grant-type:device_code', scope: DEVICE_AUTH_SCOPE }),
    })
    const b2 = await r2.json()
    return { pending: true, phase: 2, deviceCode: b2.device_code, verificationUri: b2.verification_uri_complete || b2.verification_uri, expiresIn: b2.expires_in ?? 600, interval: b2.interval ?? 5 }
  }

  let openId = '', userName = ''
  try {
    const u = await (await proxyFetch(`${FEISHU_BASE}/open-apis/authen/v1/user_info`, { headers: { Authorization: `Bearer ${at}` } })).json()
    if (u.code === 0 && u.data) { openId = u.data.open_id; userName = u.data.name }
  } catch { /* ignore */ }
  if (!openId) { openId = appId; userName = appId.slice(0, 12) }

  // 存 token 到 keychain（对齐 StoredUAToken 结构）
  const now = Date.now()
  const tokenJson = JSON.stringify({
    userOpenId: openId, appId, accessToken: at, refreshToken: rt,
    expiresAt: now + (body.data?.expires_in ?? body.expires_in ?? 7200) * 1000,
    refreshExpiresAt: now + (body.data?.refresh_token_expires_in ?? body.refresh_token_expires_in ?? 604800) * 1000,
    scope: body.data?.scope || body.scope || '',
    grantedAt: now,
  })
  regSet(`${appId}:${openId}`, tokenJson)
  writeConfig(appId, openId, userName)

  console.log(`[飞书 CLI] 认证完成 (user: ${userName})`)
  return { pending: false, phase, accessToken: at, refreshToken: rt, expiresIn: body.data?.expires_in ?? body.expires_in ?? 6900, scope: body.data?.scope || body.scope || '', userName, openId }
}

export function getFeishuCliAuthStatus(): FeishuCliAuthState {
  const cfg = readConfig()
  if (!cfg?.currentApp) return { status: 'disconnected' }
  const appId = cfg.currentApp
  const app = cfg.apps.find((a) => a.appId === appId)
  if (!app) return { status: 'disconnected' }
  if (!app.users.some((u) => regHas(`${appId}:${u.userOpenId}`))) return { status: 'disconnected' }
  return { status: 'connected', appId, userName: app.users[0].userName }
}

export async function unbindFeishuCli(): Promise<boolean> {
  const cfg = readConfig()
  const appId = cfg?.currentApp
  if (appId) {
    // 只删当前 app 的 Registry 值
    const app = cfg!.apps.find((a) => a.appId === appId)
    regDelete(`appsecret:${appId}`)
    if (app) {
      for (const u of app.users) {
        regDelete(`${appId}:${u.userOpenId}`)
      }
    }
    // 从 config.json 中移除当前 app，保留其他 app
    const remaining = cfg!.apps.filter((a) => a.appId !== appId)
    if (remaining.length > 0) {
      writeFileSync(CONFIG_PATH, JSON.stringify({ apps: remaining, currentApp: remaining[0].appId }, null, 2), 'utf-8')
    } else {
      try { rmSync(CONFIG_PATH, { force: true }) } catch { /* ignore */ }
    }
  }
  return true
}

/** 删除 Registry 中指定 key 的单个值 */
function regDelete(account: string): void {
  try {
    execSync(`reg delete "${REG_PATH}" /v "${regNameFor(account)}" /f`, { stdio: 'ignore' })
  } catch { /* ignore */ }
}
