import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AgentSendInput, AgentSessionMeta, PromaPermissionMode, SDKMessage } from '@proma/shared'

export const LOCAL_API_VERSION = 'v1'
export const LOCAL_API_DEFAULT_HOST = '127.0.0.1'
export const LOCAL_API_REMOTE_HOST = '0.0.0.0'
export const LOCAL_API_DEFAULT_PORT = 17373

export type LocalApiErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'invalid_json'
  | 'invalid_request'
  | 'session_not_found'
  | 'session_busy'
  | 'run_not_found'
  | 'too_many_runs'
  | 'permission_mode_forbidden'
  | 'agent_error'
  | 'internal_error'

export interface LocalApiSettings {
  enabled: boolean
  host: string
  port: number
  apiTokenHash: string | null
  corsOrigins: string[]
  allowRemoteAccess: boolean
  defaultPermissionMode: PromaPermissionMode
  allowBypassPermissions: boolean
  maxConcurrentRuns: number | null
  requestLoggingEnabled: boolean
}

export interface LocalApiPublicSettings {
  enabled: boolean
  host: string
  port: number
  hasApiToken: boolean
  corsOrigins: string[]
  allowRemoteAccess: boolean
  defaultPermissionMode: PromaPermissionMode
  allowBypassPermissions: boolean
  maxConcurrentRuns: number | null
  requestLoggingEnabled: boolean
}

export interface LocalApiTokenResetResult {
  token: string
  settings: LocalApiSettings
  publicSettings: LocalApiPublicSettings
}

export interface LocalApiCreateSessionBody {
  title?: string
  channelId?: string
  workspaceId?: string
  expertGroupId?: string
  expertPluginId?: string
  expertIntroduction?: string
}

export interface LocalApiSendMessageBody {
  userMessage?: string
  channelId?: string
  modelId?: string
  workspaceId?: string
  permissionMode?: PromaPermissionMode | 'ask'
  mentionedSkills?: string[]
  mentionedSessionIds?: string[]
  selectedMcpServers?: string[]
}

export interface LocalApiSseEvent {
  event: string
  data: Record<string, unknown>
}

export interface LocalApiRunRecord {
  runId: string
  sessionId: string
  startedAt: number
  finishedAt?: number
  events: LocalApiSseEvent[]
  clients: Set<ServerResponse>
}

export interface LocalApiServerDependencies {
  eventBus: {
    on(handler: (sessionId: string, payload: { kind: 'sdk_message'; message: SDKMessage } | { kind: 'proma_event'; event: { type: string; [key: string]: unknown } }) => void): () => void
  }
  getSettings: () => LocalApiSettings
  getAppVersion: () => string
  createAgentSession: (
    title?: string,
    channelId?: string,
    workspaceId?: string,
    expertGroupId?: string,
    expertPluginId?: string,
    expertIntroduction?: string,
  ) => AgentSessionMeta
  listAgentSessions: () => AgentSessionMeta[]
  getAgentSessionMeta: (id: string) => AgentSessionMeta | undefined
  getAgentSessionSDKMessages: (id: string) => SDKMessage[]
  isAgentSessionActive: (id: string) => boolean
  runAgentHeadless: (
    input: AgentSendInput,
    callbacks: {
      onError: (error: string) => void
      onComplete: () => void
      onTitleUpdated: (title: string) => void
      source?: 'bridge'
    },
  ) => Promise<void>
  stopAgent: (sessionId: string) => void
}

export interface LocalApiRequestContext {
  req: IncomingMessage
  res: ServerResponse
  method: string
  pathname: string
  searchParams: URLSearchParams
  startedAt: number
}
