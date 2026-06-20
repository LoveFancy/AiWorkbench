/**
 * RetryingNotice — 重试提示组件（Chat / Agent 共用）
 *
 * 可折叠的重试状态提示，包含：
 * - 折叠态：图标 + 一句话状态描述 + 倒计时
 * - 展开态：重试记录列表（由调用方通过 renderHistoryItem 插槽自定义）
 *
 * 通过泛型 T 适配不同模式的历史条目类型：
 * - Chat 模式：ChatRetryAttempt
 * - Agent 模式：RetryAttempt
 */

import * as React from 'react'
import { RotateCw, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react'

export interface RetryingNoticeProps<T = unknown> {
  /** 当前尝试次数 */
  currentAttempt: number
  /** 最大尝试次数 */
  maxAttempts: number
  /** 是否已失败 */
  failed: boolean
  /** 上次尝试的延迟秒数（用于倒计时，failed 时忽略） */
  delaySeconds: number
  /** 上次失败原因简述 */
  reason?: string
  /** 上次尝试的时间戳（毫秒，用于倒计时计算） */
  lastAttemptTimestamp?: number
  /** 历史记录列表 */
  history: T[]
  /** 渲染单条历史记录 */
  renderHistoryItem: (item: T, index: number) => React.ReactNode
}

export function RetryingNotice<T>({
  currentAttempt,
  maxAttempts,
  failed,
  delaySeconds,
  reason,
  lastAttemptTimestamp,
  history,
  renderHistoryItem,
}: RetryingNoticeProps<T>): React.ReactElement {
  const [expanded, setExpanded] = React.useState(false)
  const [countdown, setCountdown] = React.useState(0)

  // 倒计时逻辑
  React.useEffect(() => {
    if (failed || history.length === 0 || !lastAttemptTimestamp) {
      setCountdown(0)
      return
    }

    const updateCountdown = (): void => {
      const elapsed = (Date.now() - lastAttemptTimestamp) / 1000
      const remaining = Math.max(0, delaySeconds - elapsed)
      setCountdown(Math.ceil(remaining))
      if (remaining <= 0) setCountdown(0)
    }

    updateCountdown()
    const timer = setInterval(updateCountdown, 100)
    return () => clearInterval(timer)
  }, [failed, delaySeconds, lastAttemptTimestamp, history.length])

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20 p-3 mb-3">
      {/* 折叠态头部 */}
      <button
        type="button"
        className="flex items-center gap-2 w-full text-left hover:opacity-80 transition-opacity"
        onClick={() => setExpanded(!expanded)}
      >
        {failed ? (
          <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400 shrink-0" />
        ) : (
          <RotateCw className="size-4 animate-spin text-amber-600 dark:text-amber-400 shrink-0" />
        )}
        <span className="text-sm text-amber-900 dark:text-amber-100 flex-1">
          {failed
            ? `模型调用失败 · 已重试 ${currentAttempt}/${maxAttempts} 次`
            : countdown > 0
              ? `模型暂时不可用 · 第 ${currentAttempt}/${maxAttempts} 次重试 · ${countdown}秒后继续`
              : `模型暂时不可用 · 正在进行第 ${currentAttempt}/${maxAttempts} 次重试`}
          {reason && ` · 原因: ${reason}`}
        </span>
        {expanded ? (
          <ChevronDown className="size-4 text-amber-600 dark:text-amber-400 shrink-0" />
        ) : (
          <ChevronRight className="size-4 text-amber-600 dark:text-amber-400 shrink-0" />
        )}
      </button>

      {/* 展开态：重试记录 */}
      {expanded && history.length > 0 && (
        <div className="mt-3 space-y-2 border-t border-amber-200 dark:border-amber-800 pt-3">
          <div className="text-xs font-medium text-amber-900 dark:text-amber-100">
            重试记录：
          </div>
          {history.map((item, index) => renderHistoryItem(item, index))}
          {!failed && (
            <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300 pl-6">
              <RotateCw className="size-3 animate-spin" />
              <span>
                {countdown > 0
                  ? `${countdown}秒后开始第 ${currentAttempt} 次重试`
                  : `正在进行第 ${currentAttempt} 次重试...`}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
