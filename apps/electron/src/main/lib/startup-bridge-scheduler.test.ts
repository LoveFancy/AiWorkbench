import { describe, expect, test } from 'bun:test'
import { scheduleAfterFirstWindowLoad } from './startup-bridge-scheduler'

type Listener = () => void

class WebContentsStub {
  private listeners = new Map<string, Listener[]>()
  private loading: boolean

  constructor(loading: boolean) {
    this.loading = loading
  }

  isLoading(): boolean {
    return this.loading
  }

  once(eventName: string, listener: Listener): void {
    this.listeners.set(eventName, [...(this.listeners.get(eventName) ?? []), listener])
  }

  emit(eventName: string): void {
    this.loading = false
    const listeners = this.listeners.get(eventName) ?? []
    this.listeners.delete(eventName)
    for (const listener of listeners) listener()
  }
}

class WindowStub {
  readonly webContents: WebContentsStub
  private destroyed = false

  constructor(loading: boolean) {
    this.webContents = new WebContentsStub(loading)
  }

  isDestroyed(): boolean {
    return this.destroyed
  }

  destroy(): void {
    this.destroyed = true
  }
}

describe('启动 Bridge 调度', () => {
  test('主窗口仍在加载时等待 did-finish-load 后启动', () => {
    const win = new WindowStub(true)
    const reasons: string[] = []

    scheduleAfterFirstWindowLoad(win, (reason) => {
      reasons.push(reason)
    }, { fallbackDelayMs: 10_000 })

    expect(reasons).toEqual([])

    win.webContents.emit('did-finish-load')

    expect(reasons).toEqual(['主窗口 did-finish-load'])
  })

  test('已加载完成的窗口会立即启动且只启动一次', () => {
    const win = new WindowStub(false)
    const reasons: string[] = []

    scheduleAfterFirstWindowLoad(win, (reason) => {
      reasons.push(reason)
    }, { fallbackDelayMs: 10_000 })
    win.webContents.emit('did-finish-load')

    expect(reasons).toEqual(['主窗口已完成加载'])
  })

  test('主窗口加载失败时也会启动 Bridge', () => {
    const win = new WindowStub(true)
    const reasons: string[] = []

    scheduleAfterFirstWindowLoad(win, (reason) => {
      reasons.push(reason)
    }, { fallbackDelayMs: 10_000 })

    win.webContents.emit('did-fail-load')
    win.webContents.emit('did-finish-load')

    expect(reasons).toEqual(['主窗口 did-fail-load'])
  })

  test('主窗口长时间未完成加载时使用超时兜底', async () => {
    const win = new WindowStub(true)
    const reasons: string[] = []

    scheduleAfterFirstWindowLoad(win, (reason) => {
      reasons.push(reason)
    }, { fallbackDelayMs: 1 })

    await new Promise((resolve) => setTimeout(resolve, 5))
    win.webContents.emit('did-finish-load')

    expect(reasons).toEqual(['等待主窗口加载超时'])
  })
})
