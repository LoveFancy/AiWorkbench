import { accessSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { constants } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join, parse, resolve, win32 } from 'node:path'

interface ConfigRootBootstrap {
  customConfigDir?: string
}

export interface ConfigRootInfo {
  defaultPath: string
  currentPath: string
  customPath?: string
  pendingPath?: string
  requiresRestart: boolean
}

export interface ConfigRootServiceOptions {
  homeDir?: string
  defaultBaseDir?: string
  configDirName: string
  platform?: NodeJS.Platform
}

let activeConfigDir: string | undefined

function getHomeDir(options?: Pick<ConfigRootServiceOptions, 'homeDir'>): string {
  return options?.homeDir ?? homedir()
}

export function clearConfigRootOverride(): void {
  activeConfigDir = undefined
}

export function getDefaultConfigDir(options: ConfigRootServiceOptions): string {
  const pathJoin = options.platform === 'win32' ? win32.join : join
  return pathJoin(options.defaultBaseDir ?? getHomeDir(options), options.configDirName)
}

function getBootstrapPath(options: ConfigRootServiceOptions): string {
  const pathJoin = options.platform === 'win32' ? win32.join : join
  return pathJoin(getDefaultConfigDir(options), 'config-root.json')
}

function ensureDirectory(dirPath: string): void {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true })
  }

  const stat = statSync(dirPath)
  if (!stat.isDirectory()) {
    throw new Error('请选择一个文件夹作为数据目录')
  }
}

function ensureWritableDirectory(dirPath: string): void {
  ensureDirectory(dirPath)

  accessSync(dirPath, constants.W_OK)
}

function normalizeConfigDir(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) {
    throw new Error('数据目录不能为空')
  }
  if (!isAbsolute(trimmed)) {
    throw new Error('数据目录必须是绝对路径')
  }

  const normalized = resolve(trimmed)
  if (normalized === parse(normalized).root) {
    throw new Error('不能把系统根目录作为数据目录')
  }

  return normalized
}

function readBootstrap(options: ConfigRootServiceOptions): ConfigRootBootstrap {
  const bootstrapPath = getBootstrapPath(options)
  if (!existsSync(bootstrapPath)) return {}

  try {
    const raw = readFileSync(bootstrapPath, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<ConfigRootBootstrap>
    return {
      customConfigDir: typeof parsed.customConfigDir === 'string' ? parsed.customConfigDir : undefined,
    }
  } catch (error) {
    console.warn('[配置] 读取数据目录引导配置失败，使用默认目录:', error)
    return {}
  }
}

function readValidCustomConfigDir(options: ConfigRootServiceOptions): string | undefined {
  const bootstrap = readBootstrap(options)
  if (!bootstrap.customConfigDir) return undefined

  try {
    const customDir = normalizeConfigDir(bootstrap.customConfigDir)
    ensureWritableDirectory(customDir)
    return customDir
  } catch (error) {
    console.warn('[配置] 自定义数据目录不可用，使用默认目录:', error)
    return undefined
  }
}

export function resolveConfigDir(options: ConfigRootServiceOptions): string {
  if (activeConfigDir) return activeConfigDir

  const defaultDir = getDefaultConfigDir(options)
  const customDir = readValidCustomConfigDir(options)
  activeConfigDir = customDir ?? defaultDir
  ensureDirectory(activeConfigDir)

  return activeConfigDir
}

export function getConfigRootInfo(options: ConfigRootServiceOptions): ConfigRootInfo {
  const defaultPath = getDefaultConfigDir(options)
  const bootstrap = readBootstrap(options)
  const normalizedCustomPath = bootstrap.customConfigDir
    ? (() => {
        try {
          return normalizeConfigDir(bootstrap.customConfigDir)
        } catch {
          return undefined
        }
      })()
    : undefined
  const currentPath = resolveConfigDir(options)
  const pendingPath = normalizedCustomPath ?? defaultPath
  const requiresRestart = pendingPath !== currentPath

  return {
    defaultPath,
    currentPath,
    customPath: normalizedCustomPath,
    pendingPath: requiresRestart ? pendingPath : undefined,
    requiresRestart,
  }
}

export function setConfigRoot(dirPath: string, options: ConfigRootServiceOptions): ConfigRootInfo {
  const customDir = normalizeConfigDir(dirPath)
  ensureWritableDirectory(customDir)
  resolveConfigDir(options)

  const defaultDir = getDefaultConfigDir(options)
  mkdirSync(defaultDir, { recursive: true })
  writeFileSync(
    getBootstrapPath(options),
    JSON.stringify({ customConfigDir: customDir } satisfies ConfigRootBootstrap, null, 2),
    'utf-8'
  )

  const info = getConfigRootInfo(options)
  console.log(`[配置] 已更新自定义数据目录${info.requiresRestart ? '，重启后生效' : ''}: ${customDir}`)
  return info
}

export function resetConfigRoot(options: ConfigRootServiceOptions): ConfigRootInfo {
  resolveConfigDir(options)
  const bootstrapPath = getBootstrapPath(options)
  if (existsSync(bootstrapPath)) {
    rmSync(bootstrapPath, { force: true })
  }

  const info = getConfigRootInfo(options)
  console.log(`[配置] 已恢复默认数据目录${info.requiresRestart ? '，重启后生效' : ''}`)
  return info
}
