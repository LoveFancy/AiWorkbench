import { atom } from 'jotai'

export interface AuthAtomState {
  isLoggedIn: boolean
  jobId?: string
  /** 当前窗口会话已临时跳过登录；重启后仍会重新提示登录。 */
  loginSkipped?: boolean
}

export const authStateAtom = atom<AuthAtomState>({
  isLoggedIn: false,
})

export function canUseAppWithoutLogin(state: AuthAtomState): boolean {
  return state.isLoggedIn || state.loginSkipped === true
}

export interface LoginPresentation {
  showLoginOverlay: boolean
}

export function resolveLoginPresentation(state: AuthAtomState): LoginPresentation {
  return {
    showLoginOverlay: !canUseAppWithoutLogin(state),
  }
}

export const isLoggedInAtom = atom((get) => get(authStateAtom).isLoggedIn)
export const currentJobIdAtom = atom((get) => get(authStateAtom).jobId)

/** 登录对话框是否打开（由 LeftSidebar 等组件触发） */
export const loginDialogOpenAtom = atom(false)
