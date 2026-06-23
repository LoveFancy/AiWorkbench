/**
 * 本地 API 服务入口
 *
 * 负责把 HTTP Server 接到真实 Agent 服务和本地设置。
 */

import { app } from 'electron'
import { LocalApiServer } from './local-api-server'
import { agentEventBus, isAgentSessionActive, runAgentHeadless, stopAgent } from './agent-service'
import {
  createAgentSession,
  getAgentSessionMeta,
  getAgentSessionSDKMessages,
  listAgentSessions,
} from './agent-session-manager'
import {
  readLocalApiSettings,
  resetLocalApiToken,
  saveLocalApiSettings,
  toPublicLocalApiSettings,
} from './local-api-settings-service'
import type { LocalApiPublicSettings, LocalApiSettings, LocalApiTokenResetResult } from './local-api-types'

let server: LocalApiServer | null = null

function getServer(): LocalApiServer {
  if (server) return server
  server = new LocalApiServer({
    eventBus: agentEventBus,
    getSettings: readLocalApiSettings,
    getAppVersion: () => app.getVersion(),
    createAgentSession,
    listAgentSessions,
    getAgentSessionMeta,
    getAgentSessionSDKMessages,
    isAgentSessionActive,
    runAgentHeadless,
    stopAgent,
  })
  return server
}

export async function startLocalApiServer(): Promise<void> {
  const settings = readLocalApiSettings()
  if (!settings.enabled) return
  await getServer().start()
}

export async function stopLocalApiServer(): Promise<void> {
  if (!server) return
  await server.stop()
}

export async function restartLocalApiServer(): Promise<void> {
  await stopLocalApiServer()
  if (readLocalApiSettings().enabled) {
    await getServer().start()
  }
}

export function getLocalApiPublicSettings(): LocalApiPublicSettings {
  return toPublicLocalApiSettings(readLocalApiSettings())
}

export async function updateLocalApiSettings(updates: Partial<LocalApiSettings>): Promise<LocalApiPublicSettings> {
  const previous = readLocalApiSettings()
  const next = saveLocalApiSettings(updates)
  const needsRestart = previous.enabled !== next.enabled
    || previous.host !== next.host
    || previous.port !== next.port
    || previous.allowRemoteAccess !== next.allowRemoteAccess

  if (needsRestart) {
    await restartLocalApiServer()
  }

  return toPublicLocalApiSettings(next)
}

export async function resetLocalApiServiceToken(): Promise<LocalApiTokenResetResult> {
  return resetLocalApiToken()
}

export function getLocalApiServerStatus(): { running: boolean; url: string | null } {
  const settings = readLocalApiSettings()
  const address = server?.address()
  if (!address || typeof address === 'string') {
    return { running: false, url: null }
  }
  return {
    running: true,
    url: `http://${settings.host}:${address.port}`,
  }
}
