import type { ActiveView } from '@/atoms/active-view'
import type { AppMode } from '@/atoms/app-mode'

interface ShouldShowAgentRightPanelInput {
  appMode: AppMode
  currentSessionId: string | null | undefined
  automationFormOpen: boolean
  activeView: ActiveView
}

export function shouldShowAgentRightPanel({
  appMode,
  currentSessionId,
  automationFormOpen,
  activeView,
}: ShouldShowAgentRightPanelInput): boolean {
  if (appMode !== 'agent' || !currentSessionId || automationFormOpen) {
    return false
  }

  return activeView !== 'automations' &&
    activeView !== 'agent-skills' &&
    !activeView.startsWith('expert-')
}
