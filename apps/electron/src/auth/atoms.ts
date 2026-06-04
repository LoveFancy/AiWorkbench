import { atom } from 'jotai'

export interface AuthAtomState {
  isLoggedIn: boolean
  jobId?: string
}

export const authStateAtom = atom<AuthAtomState>({
  isLoggedIn: false,
})

export const isLoggedInAtom = atom((get) => get(authStateAtom).isLoggedIn)
export const currentJobIdAtom = atom((get) => get(authStateAtom).jobId)

/** 登录对话框是否打开（由 LeftSidebar 等组件触发） */
export const loginDialogOpenAtom = atom(false)
