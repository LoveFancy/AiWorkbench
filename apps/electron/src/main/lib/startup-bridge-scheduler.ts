interface StartupWebContentsLike {
  isLoading(): boolean
  once(eventName: 'did-finish-load' | 'did-fail-load', listener: () => void): void
}

interface StartupWindowLike {
  isDestroyed(): boolean
  webContents: StartupWebContentsLike
}

interface ScheduleAfterFirstWindowLoadOptions {
  fallbackDelayMs?: number
}

type StartBridgesCallback = (reason: string) => void

const DEFAULT_FALLBACK_DELAY_MS = 120_000

/**
 * 将 Bridge 启动延后到主窗口首轮加载完成后，避免飞书/钉钉等长连接初始化抢占首屏启动资源。
 */
export function scheduleAfterFirstWindowLoad(
  win: StartupWindowLike | null,
  startBridges: StartBridgesCallback,
  options: ScheduleAfterFirstWindowLoadOptions = {},
): void {
  let started = false
  let fallbackTimer: ReturnType<typeof setTimeout> | null = null
  const startOnce = (reason: string): void => {
    if (started) return
    started = true
    if (fallbackTimer) {
      clearTimeout(fallbackTimer)
      fallbackTimer = null
    }
    startBridges(reason)
  }

  if (!win || win.isDestroyed()) {
    startOnce('主窗口不可用')
    return
  }

  if (!win.webContents.isLoading()) {
    startOnce('主窗口已完成加载')
    return
  }

  win.webContents.once('did-finish-load', () => startOnce('主窗口 did-finish-load'))
  win.webContents.once('did-fail-load', () => startOnce('主窗口 did-fail-load'))

  fallbackTimer = setTimeout(() => {
    startOnce('等待主窗口加载超时')
  }, options.fallbackDelayMs ?? DEFAULT_FALLBACK_DELAY_MS)
  fallbackTimer.unref?.()
}
