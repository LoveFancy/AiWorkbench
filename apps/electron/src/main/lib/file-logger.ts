import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { inspect } from 'node:util'

type ConsoleMethod = 'debug' | 'error' | 'info' | 'log' | 'warn'

interface FileLoggerOptions {
  maxBytes?: number
  mirrorToConsole?: boolean
}

interface RendererWebContentsLike {
  on(
    eventName: 'console-message',
    listener: (event: unknown, level: number, message: string, line: number, sourceId: string) => void,
  ): void
}

interface RendererWindowLike {
  webContents: RendererWebContentsLike
}

const CONSOLE_METHODS: ConsoleMethod[] = ['debug', 'error', 'info', 'log', 'warn']
export const DEFAULT_MAX_LOG_BYTES = 50 * 1024 * 1024

let activeLogsDir: string | null = null
let originalConsole: Partial<Record<ConsoleMethod, (...data: unknown[]) => void>> | null = null
let activeMaxBytes = DEFAULT_MAX_LOG_BYTES
let shouldMirrorToConsole = true

function levelLabel(method: ConsoleMethod): string {
  if (method === 'log') return 'INFO'
  return method.toUpperCase()
}

function rendererLevelLabel(level: number): string {
  if (level >= 3) return 'ERROR'
  if (level === 2) return 'WARN'
  if (level === 1) return 'INFO'
  return 'DEBUG'
}

function shouldWriteConsoleMethod(method: ConsoleMethod): boolean {
  return method !== 'debug'
}

function shouldWriteRendererLevel(level: number): boolean {
  return level >= 1
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

function appendLog(logsDir: string, fileName: string, level: string, values: unknown[], maxBytes = DEFAULT_MAX_LOG_BYTES): void {
  try {
    mkdirSync(logsDir, { recursive: true })
    appendRollingFile(join(logsDir, fileName), formatLogLine(level, values), maxBytes)
  } catch (error) {
    originalConsole?.warn?.('[日志] 写入日志文件失败:', error)
  }
}

export function installFileLogger(logsDir: string, options: FileLoggerOptions = {}): void {
  if (activeLogsDir) return

  mkdirSync(logsDir, { recursive: true })
  activeLogsDir = logsDir
  activeMaxBytes = options.maxBytes ?? DEFAULT_MAX_LOG_BYTES
  shouldMirrorToConsole = options.mirrorToConsole ?? true
  originalConsole = {}

  for (const method of CONSOLE_METHODS) {
    originalConsole[method] = console[method].bind(console)
    console[method] = (...values: unknown[]) => {
      if (shouldWriteConsoleMethod(method)) {
        appendLog(logsDir, 'main.log', levelLabel(method), values, activeMaxBytes)
      }
      if (shouldMirrorToConsole) {
        originalConsole?.[method]?.(...values)
      }
    }
  }
}

export function attachRendererLogCapture(win: RendererWindowLike, logsDir: string): void {
  win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (!shouldWriteRendererLevel(level)) return
    const location = sourceId ? `${sourceId}:${line}` : `line:${line}`
    appendLog(logsDir, 'renderer.log', rendererLevelLabel(level), [message, `(${location})`], activeMaxBytes)
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
}
