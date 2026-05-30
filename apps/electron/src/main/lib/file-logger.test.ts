import { afterEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { DEFAULT_MAX_LOG_BYTES, attachRendererLogCapture, installFileLogger, resetFileLoggerForTests } from './file-logger.ts'

interface ConsoleMessageDetails {
  level: 'debug' | 'error' | 'info' | 'warning'
  message: string
  lineNumber: number
  sourceId: string
}

type ConsoleMessageListener = (details: ConsoleMessageDetails) => void

function createTempLogsDir(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'proma-file-logger-'))
  return {
    dir,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  }
}

afterEach(() => {
  resetFileLoggerForTests()
})

describe('文件日志', () => {
  test('默认单个日志文件最大为 50MB', () => {
    expect(DEFAULT_MAX_LOG_BYTES).toBe(50 * 1024 * 1024)
  })

  test('主进程 console 会同步写入 main.log', () => {
    const temp = createTempLogsDir()
    try {
      installFileLogger(temp.dir, { mirrorToConsole: false })

      console.log('[测试] 主进程日志', { ok: true })
      console.error('[测试] 主进程错误', new Error('boom'))

      const content = readFileSync(join(temp.dir, 'main.log'), 'utf-8')
      expect(content).toContain('[INFO] [测试] 主进程日志')
      expect(content).toContain('ok: true')
      expect(content).toContain('[ERROR] [测试] 主进程错误')
      expect(content).toContain('Error: boom')
    } finally {
      temp.cleanup()
    }
  })

  test('重复初始化不会重复写入同一条 console 日志', () => {
    const temp = createTempLogsDir()
    try {
      installFileLogger(temp.dir, { mirrorToConsole: false })
      installFileLogger(temp.dir, { mirrorToConsole: false })

      console.warn('[测试] 单条警告')

      const content = readFileSync(join(temp.dir, 'main.log'), 'utf-8')
      expect(content.match(/\[测试\] 单条警告/g)?.length).toBe(1)
    } finally {
      temp.cleanup()
    }
  })

  test('主进程只写入 INFO 及以上级别', () => {
    const temp = createTempLogsDir()
    try {
      installFileLogger(temp.dir, { mirrorToConsole: false })

      console.debug('[测试] debug 不落盘')
      console.info('[测试] info 落盘')

      const content = readFileSync(join(temp.dir, 'main.log'), 'utf-8')
      expect(content).not.toContain('debug 不落盘')
      expect(content).toContain('[INFO] [测试] info 落盘')
    } finally {
      temp.cleanup()
    }
  })

  test('日志文件超过上限时只保留最近内容', () => {
    const temp = createTempLogsDir()
    try {
      installFileLogger(temp.dir, { maxBytes: 120, mirrorToConsole: false })

      console.log('第一条日志'.repeat(8))
      console.log('第二条日志'.repeat(8))

      const content = readFileSync(join(temp.dir, 'main.log'), 'utf-8')
      expect(Buffer.byteLength(content)).toBeLessThanOrEqual(120)
      expect(content).toContain('第二条日志')
    } finally {
      temp.cleanup()
    }
  })

  test('renderer console-message 会写入 renderer.log', () => {
    const temp = createTempLogsDir()
    try {
      const listeners = new Map<string, ConsoleMessageListener>()
      const win = {
        webContents: {
          on: (eventName: 'console-message', listener: ConsoleMessageListener) => {
            listeners.set(eventName, listener)
          },
        },
      }

      attachRendererLogCapture(win, temp.dir)
      listeners.get('console-message')?.({
        level: 'error',
        message: '渲染进程错误',
        lineNumber: 42,
        sourceId: 'renderer.js',
      })

      const content = readFileSync(join(temp.dir, 'renderer.log'), 'utf-8')
      expect(content).toContain('[ERROR] 渲染进程错误')
      expect(content).toContain('renderer.js:42')
    } finally {
      temp.cleanup()
    }
  })

  test('renderer 只写入 INFO 及以上级别', () => {
    const temp = createTempLogsDir()
    try {
      const listeners = new Map<string, ConsoleMessageListener>()
      const win = {
        webContents: {
          on: (eventName: 'console-message', listener: ConsoleMessageListener) => {
            listeners.set(eventName, listener)
          },
        },
      }

      attachRendererLogCapture(win, temp.dir)
      listeners.get('console-message')?.({
        level: 'debug',
        message: '渲染 debug 不落盘',
        lineNumber: 10,
        sourceId: 'renderer.js',
      })

      expect(existsSync(join(temp.dir, 'renderer.log'))).toBe(false)
    } finally {
      temp.cleanup()
    }
  })
})
