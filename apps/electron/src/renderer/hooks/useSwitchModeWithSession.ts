import * as React from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { appModeAtom, type AppMode } from '@/atoms/app-mode'
import {
  conversationsAtom,
  currentConversationIdAtom,
} from '@/atoms/chat-atoms'
import {
  agentSessionsAtom,
  currentAgentSessionIdAtom,
  currentAgentWorkspaceIdAtom,
} from '@/atoms/agent-atoms'
import { tabsAtom } from '@/atoms/tab-atoms'
import { useCreateSession } from './useCreateSession'
import { useOpenSession } from './useOpenSession'
import { selectModeSessionTarget } from '@/lib/mode-session-restore'

export type SwitchModeWithSession = (targetMode: Exclude<AppMode, 'scratch'>) => Promise<void>

export function useSwitchModeWithSession(): SwitchModeWithSession {
  const setMode = useSetAtom(appModeAtom)
  const openSession = useOpenSession()
  const { createChat, createAgent } = useCreateSession()

  const conversations = useAtomValue(conversationsAtom)
  const agentSessions = useAtomValue(agentSessionsAtom)
  const currentConversationId = useAtomValue(currentConversationIdAtom)
  const currentAgentSessionId = useAtomValue(currentAgentSessionIdAtom)
  const currentWorkspaceId = useAtomValue(currentAgentWorkspaceIdAtom)
  const tabs = useAtomValue(tabsAtom)

  return React.useCallback<SwitchModeWithSession>(async (targetMode) => {
    const isChatMode = targetMode === 'chat'
    const target = selectModeSessionTarget({
      mode: targetMode,
      lastSessionId: isChatMode ? currentConversationId : currentAgentSessionId,
      sessions: isChatMode ? conversations : agentSessions,
      tabs,
      currentWorkspaceId: isChatMode ? undefined : currentWorkspaceId,
    })

    if (target.kind === 'open') {
      openSession(targetMode, target.sessionId, target.title)
      return
    }

    setMode(targetMode)
    if (isChatMode) {
      await createChat({ draft: true })
    } else {
      await createAgent({ draft: true })
    }
  }, [
    agentSessions,
    conversations,
    createAgent,
    createChat,
    currentAgentSessionId,
    currentConversationId,
    currentWorkspaceId,
    openSession,
    setMode,
    tabs,
  ])
}
