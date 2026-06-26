import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { appendFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { inspect } from 'node:util'

const FLUSH_BATCH_DELAY_MS = 200
const MIN_FLUSH_INTERVAL_MS = 2000

type ConsoleMethod = 'debug' | 'error' | 'info' | 'log' | 'warn'
type RendererLogLevel = 'debug' | 'error' | 'info' | 'warning'

interface FileLoggerOptions {
  maxBytes?: number
  mirrorToConsole?: boolean
}

interface RendererConsoleMessageDetails {
  level: RendererLogLevel
  message: string
  lineNumber: number
  sourceId: string
}

interface RendererWebContentsLike {
  on(eventName: 'console-message', listener: (details: RendererConsoleMessageDetails) => void): void
}

interface RendererWindowLike {
  webContents: RendererWebContentsLike
}

const CONSOLE_METHODS: ConsoleMethod[] = ['debug', 'error', 'info', 'log', 'warn']
export const DEFAULT_MAX_LOG_BYTES = 10 * 1024 * 1024

let activeLogsDir: string | null = null
let originalConsole: Partial<Record<ConsoleMethod, (...data: unknown[]) => void>> | null = null
let activeMaxBytes = DEFAULT_MAX_LOG_BYTES
let shouldMirrorToConsole = true
let pendingEntries: LogEntry[] = []
let flushScheduled = false
let lastFlushTime = 0
let flushPromise: Promise<void> | null = null
let resolveFlushPromise: (() => void) | null = null

interface LogEntry {
  logsDir: string
  fileName: string
  line: string
  maxBytes: number
}

function levelLabel(method: ConsoleMethod): string {
  if (method === 'log') return 'INFO'
  return method.toUpperCase()
}

function rendererLevelLabel(level: RendererLogLevel): string {
  if (level === 'error') return 'ERROR'
  if (level === 'warning') return 'WARN'
  if (level === 'info') return 'INFO'
  return 'DEBUG'
}

function shouldWriteConsoleMethod(method: ConsoleMethod): boolean {
  return method !== 'debug'
}

function shouldWriteRendererLevel(level: RendererLogLevel): boolean {
  return level !== 'debug'
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') return value
  if (value instanceof Error) return value.stack ?? value.message
  return inspect(value, { colors: false, depth: 6, breakLength: 120 })
}

function formatLogLine(level: string, values: unknown[]): string {
  const timestamp = new Date().toISOString()
  const content = values.map(formatValue).join(' ')
  return `${timestamp} [${level}] ${content}\n`
}

function trimTextToMaxBytesFromEnd(text: string, maxBytes: number): string {
  let result = ''
  let size = 0
  const chars = Array.from(text)

  for (let index = chars.length - 1; index >= 0; index -= 1) {
    const char = chars[index]!
    const charSize = Buffer.byteLength(char)
    if (size + charSize > maxBytes) break
    result = char + result
    size += charSize
  }

  return result
}

function trimExistingLogFile(filePath: string, maxBytes: number): void {
  if (!existsSync(filePath)) return
  const currentSize = statSync(filePath).size
  if (currentSize <= maxBytes) return

  const currentText = readFileSync(filePath, 'utf-8')
  writeFileSync(filePath, trimTextToMaxBytesFromEnd(currentText, maxBytes), 'utf-8')
}

function flushPendingLogs(): void {
  const t0 = Date.now()
  lastFlushTime = t0
  flushScheduled = false
  const entries = pendingEntries
  pendingEntries = []

  // 按文件分组，同时记录该文件的最小 maxBytes（同一文件可能有不同限制）
  const byFile = new Map<string, { lines: string[]; maxBytes: number }>()
  for (const entry of entries) {
    const filePath = join(entry.logsDir, entry.fileName)
    const existing = byFile.get(filePath)
    if (existing) {
      existing.lines.push(entry.line)
      if (entry.maxBytes < existing.maxBytes) existing.maxBytes = entry.maxBytes
    } else {
      try { mkdirSync(entry.logsDir, { recursive: true }) } catch { /* ignore */ }
      byFile.set(filePath, { lines: [entry.line], maxBytes: entry.maxBytes })
    }
  }

  const writes: Promise<void>[] = []
  for (const [filePath, { lines, maxBytes }] of byFile) {
    const content = lines.join('')
    const contentBytes = Buffer.byteLength(content)
    const currentSize = existsSync(filePath) ? statSync(filePath).size : 0

    if (contentBytes >= maxBytes) {
      // 单次写入超过上限，截断
      writes.push(
        writeFile(filePath, trimTextToMaxBytesFromEnd(content, maxBytes), 'utf-8')
      )
    } else if (currentSize + contentBytes <= maxBytes) {
      // 文件还有空间，直接追加
      writes.push(
        appendFile(filePath, content, 'utf-8').catch((error) => {
          originalConsole?.warn?.('[日志] 异步写入日志文件失败:', error)
        })
      )
    } else {
      // 文件即将超限，保留尾部 + 新内容
      writes.push((async () => {
        try {
          const currentText = existsSync(filePath) ? readFileSync(filePath, 'utf-8') : ''
          const bytesToKeep = maxBytes - contentBytes
          const tail = trimTextToMaxBytesFromEnd(currentText, bytesToKeep)
          await writeFile(filePath, tail + content, 'utf-8')
        } catch (error) {
          originalConsole?.warn?.('[日志] 异步写入日志文件失败:', error)
        }
      })())
    }
  }

  const resolve = resolveFlushPromise
  flushPromise = null
  resolveFlushPromise = null
  // 等所有异步写入完成后再 resolve，保证 flushFileLogger() 等待语义不变
  if (resolve) {
    Promise.all(writes).then(() => {
      resolve()
      const elapsed = Date.now() - t0
      if (elapsed > 50) console.log(`[perf] file-logger flush: ${entries.length} entries → ${writes.length} files, ${elapsed}ms`)
    }).catch(() => resolve())
  }
}

function scheduleFlush(): void {
  if (flushScheduled) return
  flushScheduled = true
  const since = lastFlushTime === 0 ? MIN_FLUSH_INTERVAL_MS : Date.now() - lastFlushTime
  const delay = since >= MIN_FLUSH_INTERVAL_MS ? FLUSH_BATCH_DELAY_MS : MIN_FLUSH_INTERVAL_MS - since
  setTimeout(flushPendingLogs, delay)
}

function enqueueLog(logsDir: string, fileName: string, level: string, values: unknown[], maxBytes = DEFAULT_MAX_LOG_BYTES): void {
  pendingEntries.push({
    logsDir,
    fileName,
    line: formatLogLine(level, values),
    maxBytes,
  })
  if (!flushPromise) {
    flushPromise = new Promise((resolve) => {
      resolveFlushPromise = resolve
    })
  }
  scheduleFlush()
}

export function installFileLogger(logsDir: string, options: FileLoggerOptions = {}): void {
  if (activeLogsDir) return

  mkdirSync(logsDir, { recursive: true })
  activeLogsDir = logsDir
  activeMaxBytes = options.maxBytes ?? DEFAULT_MAX_LOG_BYTES
  shouldMirrorToConsole = options.mirrorToConsole ?? true
  originalConsole = {}

  trimExistingLogFile(join(logsDir, 'main.log'), activeMaxBytes)
  trimExistingLogFile(join(logsDir, 'renderer.log'), activeMaxBytes)

  for (const method of CONSOLE_METHODS) {
    originalConsole[method] = console[method].bind(console)
    console[method] = (...values: unknown[]) => {
      if (shouldWriteConsoleMethod(method)) {
        enqueueLog(logsDir, 'main.log', levelLabel(method), values, activeMaxBytes)
      }
      if (shouldMirrorToConsole) {
        setImmediate(() => originalConsole?.[method]?.(...values))
      }
    }
  }
}

export function attachRendererLogCapture(win: RendererWindowLike, logsDir: string): void {
  win.webContents.on('console-message', ({ level, message, lineNumber, sourceId }) => {
    if (!shouldWriteRendererLevel(level)) return
    const location = sourceId ? `${sourceId}:${lineNumber}` : `line:${lineNumber}`
    enqueueLog(logsDir, 'renderer.log', rendererLevelLabel(level), [message, `(${location})`], activeMaxBytes)
  })
}

export async function flushFileLogger(): Promise<void> {
  if (!flushPromise) return
  await flushPromise
}

export const flushFileLoggerForTests = flushFileLogger

export function resetFileLoggerForTests(): void {
  if (originalConsole) {
    for (const method of CONSOLE_METHODS) {
      const original = originalConsole[method]
      if (original) console[method] = original
    }
  }
  activeLogsDir = null
  originalConsole = null
  activeMaxBytes = DEFAULT_MAX_LOG_BYTES
  shouldMirrorToConsole = true
  if (flushScheduled) {
    flushPendingLogs()
  }
  pendingEntries = []
  flushPromise = null
  resolveFlushPromise = null
  flushScheduled = false
}
