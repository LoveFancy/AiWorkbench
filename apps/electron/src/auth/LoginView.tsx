import { useState } from 'react'
import { useSetAtom } from 'jotai'
import { authStateAtom } from './atoms'
import { X } from 'lucide-react'

type LoginState = 'idle' | 'ready' | 'loading' | 'error' | 'success'

export function LoginView({
  onLoginSuccess,
  onClose,
  onQuit,
  allowSkip = true,
  onSkip,
}: {
  onLoginSuccess: () => void
  onClose?: () => void
  onQuit?: () => void
  allowSkip?: boolean
  onSkip?: () => void
}) {
  const [jobId, setJobId] = useState('')
  const [password, setPassword] = useState('')
  const [state, setState] = useState<LoginState>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const setAuth = useSetAtom(authStateAtom)

  const canSubmit = jobId.trim() !== '' && password.trim() !== ''

  const handleJobIdChange = (value: string) => {
    setJobId(value)
    setState(value && password ? 'ready' : 'idle')
    setErrorMsg('')
  }

  const handlePasswordChange = (value: string) => {
    setPassword(value)
    setState(jobId && value ? 'ready' : 'idle')
    setErrorMsg('')
  }

  const handleLogin = async () => {
    if (!canSubmit) return
    setState('loading')
    try {
      const result = await (window.electronAPI as any).auth.login(jobId, password)
      if (result.success) {
        setState('success')
        setAuth({ isLoggedIn: true, jobId: result.jobId })
        setTimeout(onLoginSuccess, 1000)
      } else {
        setState('error')
        setErrorMsg(result.message)
        setPassword('')
      }
    } catch {
      setState('error')
      setErrorMsg('网络异常，请重试')
      setPassword('')
    }
  }

  const handleSkip = () => {
    setAuth({ isLoggedIn: false, loginSkipped: true })
    ;(onSkip ?? onLoginSuccess)()
  }

  const handleClose = () => {
    onClose?.()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && canSubmit && state !== 'loading') {
      handleLogin()
    }
    if (e.key === 'Escape') {
      handleClose()
    }
  }

  return (
    <div className="flex items-center justify-center h-full">
      <div className="bg-background rounded-xl shadow-2xl border p-6 w-[300px] relative">
        {/* 关闭按钮：弹窗模式有 onClose，强制登录模式有 onQuit */}
        {(onClose || onQuit) && (
          <button
            onClick={() => { onClose?.(); onQuit?.() }}
            className="absolute top-2 right-2 size-7 flex items-center justify-center rounded-full transition-colors text-foreground/40 hover:bg-foreground/10 hover:text-foreground"
            aria-label="关闭"
          >
            <X size={16} />
          </button>
        )}

        {/* Logo + 欢迎文案 */}
        <div className="text-center mb-4">
          <h2 className="text-lg font-semibold mb-1">登录</h2>
          <p className="text-xs text-muted-foreground">请输入 OA 工号和密码</p>
        </div>

        <div className="space-y-3">
          {/* 工号输入框 */}
          <input
            type="text"
            placeholder="工号"
            value={jobId}
            onChange={(e) => handleJobIdChange(e.target.value)}
            disabled={state === 'loading'}
            autoFocus
            className="w-full px-2.5 py-1.5 text-sm border rounded-md bg-background"
          />

          {/* 密码输入框 */}
          <input
            type="password"
            placeholder="密码"
            value={password}
            onChange={(e) => handlePasswordChange(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={state === 'loading'}
            className="w-full px-2.5 py-1.5 text-sm border rounded-md bg-background"
          />

          {/* 登录按钮 */}
          <button
            disabled={!canSubmit || state === 'loading'}
            onClick={handleLogin}
            className="w-full py-1.5 text-sm rounded-md bg-primary text-primary-foreground disabled:opacity-50"
          >
            {state === 'loading' ? '登录中...' : '登 录'}
          </button>

          {/* 错误提示 */}
          {state === 'error' && (
            <p className="text-xs text-red-500 text-center">{errorMsg}</p>
          )}

          {/* 跳过登录 / 返回 */}
          {onClose && (
            <p
              className="text-xs text-muted-foreground text-center cursor-pointer hover:underline"
              onClick={handleClose}
            >
              暂不登录，返回
            </p>
          )}
          {!onClose && allowSkip && (
            <p
              className="text-xs text-muted-foreground text-center cursor-pointer hover:underline"
              onClick={handleSkip}
            >
              跳过登录，直接使用
            </p>
          )}

          {/* 强制登录模式：退出应用 */}
          {!onClose && !allowSkip && onQuit && (
            <p
              className="text-xs text-muted-foreground/60 text-center cursor-pointer hover:text-muted-foreground hover:underline transition-colors"
              onClick={onQuit}
            >
              退出应用
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
