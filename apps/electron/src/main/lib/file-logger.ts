import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { appendFile, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { inspect } from 'node:util'

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

/** 待写入缓冲：filePath -> 已格式化的日志行（含换行）。异步批量刷盘，避免阻塞主线程。 */
const pendingWrites = new Map<string, string[]>()
let flushScheduled = false
let exitHandlerRegistered = false

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

function appendRollingFile(filePath: string, line: string, maxBytes: number): void {
  const lineBuffer = Buffer.from(line)
  if (lineBuffer.byteLength >= maxBytes) {
    writeFileSync(filePath, trimTextToMaxBytesFromEnd(line, maxBytes), 'utf-8')
    return
  }

  const currentSize = existsSync(filePath) ? statSync(filePath).size : 0
  if (currentSize + lineBuffer.byteLength <= maxBytes) {
    appendFileSync(filePath, lineBuffer)
    return
  }

  const bytesToKeep = maxBytes - lineBuffer.byteLength
  const currentText = existsSync(filePath) ? readFileSync(filePath, 'utf-8') : ''
  const tail = trimTextToMaxBytesFromEnd(currentText, bytesToKeep)
  writeFileSync(filePath, tail + line, 'utf-8')
}

async function appendRollingFileAsync(filePath: string, text: string, maxBytes: number): Promise<void> {
  const textBuffer = Buffer.from(text)
  if (textBuffer.byteLength >= maxBytes) {
    await writeFile(filePath, trimTextToMaxBytesFromEnd(text, maxBytes), 'utf-8')
    return
  }

  let currentSize = 0
  try {
    currentSize = (await stat(filePath)).size
  } catch {
    currentSize = 0
  }

  if (currentSize + textBuffer.byteLength <= maxBytes) {
    await appendFile(filePath, textBuffer)
    return
  }

  const bytesToKeep = maxBytes - textBuffer.byteLength
  let currentText = ''
  try {
    currentText = await readFile(filePath, 'utf-8')
  } catch {
    currentText = ''
  }
  const tail = trimTextToMaxBytesFromEnd(currentText, bytesToKeep)
  await writeFile(filePath, tail + text, 'utf-8')
}

function trimExistingLogFile(filePath: string, maxBytes: number): void {
  if (!existsSync(filePath)) return
  const currentSize = statSync(filePath).size
  if (currentSize <= maxBytes) return

  const currentText = readFileSync(filePath, 'utf-8')
  writeFileSync(filePath, trimTextToMaxBytesFromEnd(currentText, maxBytes), 'utf-8')
}

function flushScheduledWrites(): void {
  flushScheduled = false
  for (const [filePath, lines] of pendingWrites) {
    if (lines.length === 0) continue
    const chunk = lines.join('')
    pendingWrites.set(filePath, [])
    void appendRollingFileAsync(filePath, chunk, activeMaxBytes).catch((error) => {
      originalConsole?.warn?.('[日志] 异步写入日志文件失败:', error)
    })
  }
}

function scheduleFlush(): void {
  if (flushScheduled) return
  flushScheduled = true
  setImmediate(flushScheduledWrites)
}

function enqueueLog(filePath: string, line: string): void {
  const existing = pendingWrites.get(filePath)
  if (existing) {
    existing.push(line)
  } else {
    pendingWrites.set(filePath, [line])
  }
  scheduleFlush()
}

/**
 * 同步刷盘所有待写入日志。用于进程退出兜底（'exit' 仅允许同步操作）与测试中"写入后立即读取"。
 */
export function flushFileLoggerSync(): void {
  for (const [filePath, lines] of pendingWrites) {
    if (lines.length === 0) continue
    const chunk = lines.join('')
    pendingWrites.set(filePath, [])
    try {
      appendRollingFile(filePath, chunk, activeMaxBytes)
    } catch (error) {
      originalConsole?.warn?.('[日志] 同步刷盘失败:', error)
    }
  }
}

function appendLog(logsDir: string, fileName: string, level: string, values: unknown[]): void {
  enqueueLog(join(logsDir, fileName), formatLogLine(level, values))
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

  // 进程退出兜底：'exit' 阶段仅允许同步操作，确保缓冲中的日志不丢失
  if (!exitHandlerRegistered) {
    exitHandlerRegistered = true
    process.once('exit', () => {
      try {
        flushFileLoggerSync()
      } catch {
        /* 退出阶段无能为力 */
      }
    })
  }

  for (const method of CONSOLE_METHODS) {
    originalConsole[method] = console[method].bind(console)
    console[method] = (...values: unknown[]) => {
      if (shouldWriteConsoleMethod(method)) {
        appendLog(logsDir, 'main.log', levelLabel(method), values)
      }
      if (shouldMirrorToConsole) {
        originalConsole?.[method]?.(...values)
      }
    }
  }
}

export function attachRendererLogCapture(win: RendererWindowLike, logsDir: string): void {
  win.webContents.on('console-message', ({ level, message, lineNumber, sourceId }) => {
    if (!shouldWriteRendererLevel(level)) return
    const location = sourceId ? `${sourceId}:${lineNumber}` : `line:${lineNumber}`
    appendLog(logsDir, 'renderer.log', rendererLevelLabel(level), [message, `(${location})`])
  })
}

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
  pendingWrites.clear()
  flushScheduled = false
}
