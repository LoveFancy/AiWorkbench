import type { AppMode } from '@/atoms/app-mode'
import type { TabItem } from '@/atoms/tab-atoms'

export interface ModeSessionCandidate {
  id: string
  title: string
  archived?: boolean
  workspaceId?: string | null
}

export type ModeSessionTarget =
  | { kind: 'open'; sessionId: string; title: string }
  | { kind: 'create-draft' }

export interface SelectModeSessionTargetInput {
  mode: Exclude<AppMode, 'scratch'>
  lastSessionId: string | null
  sessions: ModeSessionCandidate[]
  tabs: TabItem[]
  currentWorkspaceId?: string | null
}

export function selectModeSessionTarget(input: SelectModeSessionTargetInput): ModeSessionTarget {
  const { mode, lastSessionId, sessions, tabs, currentWorkspaceId } = input
  const availableSessions = sessions.filter((session) => (
    !session.archived
      && (mode !== 'agent' || !currentWorkspaceId || session.workspaceId === currentWorkspaceId)
  ))

  if (lastSessionId) {
    const lastSession = availableSessions.find((session) => session.id === lastSessionId)
    if (lastSession) {
      return { kind: 'open', sessionId: lastSession.id, title: lastSession.title }
    }
  }

  const openedTab = tabs.find((tab) => tab.type === mode)
  if (openedTab) {
    return { kind: 'open', sessionId: openedTab.sessionId, title: openedTab.title }
  }

  const recentSession = availableSessions[0]
  if (recentSession) {
    return { kind: 'open', sessionId: recentSession.id, title: recentSession.title }
  }

  return { kind: 'create-draft' }
}
