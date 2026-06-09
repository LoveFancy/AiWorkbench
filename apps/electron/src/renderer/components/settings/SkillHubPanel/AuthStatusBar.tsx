import React from 'react'
import { RefreshCw, ShieldCheck, ShieldAlert, ShieldOff } from 'lucide-react'

interface AuthStatus {
  authenticated: boolean
  expiresAt?: number
  remainingSeconds?: number
}

interface AuthStatusBarProps {
  status: AuthStatus | null
  loading: boolean
  onAuthenticate: () => void
  onRetry: () => void
}

export function AuthStatusBar({ status, loading, onAuthenticate, onRetry }: AuthStatusBarProps): React.ReactElement {
  // 正在认证中
  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/30 border border-border rounded-lg text-sm text-muted-foreground">
        <RefreshCw size={14} className="animate-spin" />
        <span>正在连接 SkillHub...</span>
      </div>
    )
  }

  // 未认证
  if (!status || !status.authenticated) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm">
        <ShieldOff size={14} className="text-amber-600" />
        <span className="text-amber-700 flex-1">未登录 SkillHub</span>
        <button
          onClick={onAuthenticate}
          className="px-2 py-1 rounded bg-amber-600 text-white text-xs hover:bg-amber-700 transition-colors"
        >
          前往登录
        </button>
      </div>
    )
  }

  // 已认证
  const remainingMin = status.remainingSeconds ? Math.ceil(status.remainingSeconds / 60) : 0
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-sm">
      <ShieldCheck size={14} className="text-green-600" />
      <span className="text-green-700 flex-1">
        已连接 · Skill 列表可用
        {remainingMin > 0 && remainingMin < 30 && (
          <span className="text-amber-600 ml-1">（约 {remainingMin} 分钟后过期）</span>
        )}
      </span>
      <span className="text-green-500 text-xs">✅</span>
    </div>
  )
}

/**
 * 错误状态栏（SkillHub 不可用）
 */
export function AuthErrorBar({ onRetry }: { onRetry: () => void }): React.ReactElement {
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm">
      <ShieldAlert size={14} className="text-red-600" />
      <span className="text-red-700 flex-1">⚠️ SkillHub 不可用</span>
      <button
        onClick={onRetry}
        className="px-2 py-1 rounded bg-red-600 text-white text-xs hover:bg-red-700 transition-colors"
      >
        重试
      </button>
    </div>
  )
}
