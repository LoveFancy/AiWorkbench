/**
 * 全局异常捕获与上报
 *
 * 在主进程注册全局错误监听器，将异常统一上报到观测服务。
 * 遵循"不漏不重"原则：每种错误源仅有一个监听点。
 */

import { reportErrorEvent } from './observability-service'
import { app, type WebContents } from 'electron'

/**
 * 致命错误判定：以下错误类型视为不可恢复，需上报后退出进程
 * - 资源耗尽（ENOMEM）
 * - 关键模块加载失败
 * - Electron 内部错误
 */
const FATAL_ERROR_PATTERNS = [
  /ENOMEM/,
  /JavaScript heap out of memory/,
  /FATAL: out of memory/,
  /Cannot find module '\.\/build\/Release\//,
]

function isFatalError(error: Error): boolean {
  const text = `${error.name} ${error.message} ${error.stack ?? ''}`
  return FATAL_ERROR_PATTERNS.some((re) => re.test(text))
}

export function registerGlobalErrorHandlers(): void {
  // 1) Node.js 未捕获异常
  process.on('uncaughtException', (error) => {
    console.error('[Global Error] 未捕获异常:', error)
    reportErrorEvent(error, { tags: { source: 'uncaughtException' } })
    if (isFatalError(error)) {
      // 致命错误：先同步上报（fire-and-forget），再退出
      setTimeout(() => app.exit(1), 1000)
    }
  })

  // 2) Node.js 未处理 Promise 拒绝
  process.on('unhandledRejection', (reason) => {
    console.error('[Global Error] 未处理的 Promise 拒绝:', reason)
    const error = reason instanceof Error ? reason : new Error(String(reason))
    reportErrorEvent(error, { tags: { source: 'unhandledRejection' } })
    // unhandledRejection 默认不退出进程（避免掩盖），仅上报
  })

  // 3) Electron 渲染进程崩溃
  app.on('render-process-gone', (_event, webContents: WebContents, details: { reason: string; exitCode: number }) => {
    const error = new Error(`渲染进程崩溃: ${details.reason} (exitCode=${details.exitCode})`)
    error.name = 'RenderProcessGoneError'
    reportErrorEvent(error, {
      tags: {
        source: 'render-process-gone',
        reason: details.reason,
        exitCode: String(details.exitCode),
        url: webContents.getURL(),
      },
    })
  })

  // 4) 子进程崩溃
  app.on('child-process-gone', (_event, details: { type: string; reason: string; exitCode: number }) => {
    const error = new Error(`子进程崩溃: ${details.type} ${details.reason} (exitCode=${details.exitCode})`)
    error.name = 'ChildProcessGoneError'
    reportErrorEvent(error, {
      tags: {
        source: 'child-process-gone',
        type: details.type,
        reason: details.reason,
        exitCode: String(details.exitCode),
      },
    })
  })
}
