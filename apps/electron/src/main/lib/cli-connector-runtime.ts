import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, delimiter, isAbsolute, join } from 'node:path'
import type { ConnectorsConfig } from '@proma/shared'
import { getConnectorsDir } from './config-paths'

export interface CliUserProvidedField {
  name: string
  label?: string
  type?: 'password' | 'text' | 'select'
  default?: string
  options?: string[]
  required?: boolean
}

export interface CliConnectorDefinition {
  runtime?: {
    type?: string
    version?: string
  }
  init?: Partial<Record<NodeJS.Platform, string>>
  versionCheck?: {
    command?: Partial<Record<NodeJS.Platform, string>>
    minVersion?: string
  }
  userProvidedData?: CliUserProvidedField[]
  status?: Partial<Record<NodeJS.Platform, string>>
  env?: Record<string, string>
}

export interface CliConnectorRuntime {
  commandPath?: string
  binDir?: string
  packageName?: string
  packageVersion?: string
}

interface StoredSecretValue {
  encrypted: boolean
  value: string
}

interface CliConnectorSecrets {
  version: 1
  encrypted: boolean
  data: Record<string, StoredSecretValue>
}

interface ElectronSafeStorage {
  isEncryptionAvailable(): boolean
  encryptString(value: string): Buffer
  decryptString(value: Buffer): string
}

const RESERVED_ENV_KEY_PATTERNS = [
  /^PATH$/i,
  /^HOME$/i,
  /^SHELL$/i,
  /^NODE_OPTIONS$/i,
  /^ELECTRON_RUN_AS_NODE$/i,
  /^ANTHROPIC_/i,
]

export function readCliConnectorDefinition(connectorDir: string): CliConnectorDefinition {
  const configPath = join(connectorDir, 'cli.json')
  if (!existsSync(configPath)) {
    throw new Error('连接器缺少 cli.json')
  }
  return JSON.parse(readFileSync(configPath, 'utf-8')) as CliConnectorDefinition
}

export function getPlatformCommand(commandMap: Partial<Record<NodeJS.Platform, string>> | undefined): string | null {
  return commandMap?.[process.platform] ?? null
}

export function parseCommandLine(commandLine: string): string[] {
  const args: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null

  for (let i = 0; i < commandLine.length; i += 1) {
    const char = commandLine[i]
    if (!char) continue
    if (quote) {
      if (char === quote) {
        quote = null
      } else {
        current += char
      }
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      continue
    }
    if (/\s/.test(char)) {
      if (current) {
        args.push(current)
        current = ''
      }
      continue
    }
    current += char
  }

  if (quote) throw new Error(`命令存在未闭合引号: ${commandLine}`)
  if (current) args.push(current)
  return args
}

export function validateCliUserProvidedData(definition: CliConnectorDefinition, userProvidedData: Record<string, string> | undefined): Record<string, string> {
  const values = userProvidedData ?? {}
  const result: Record<string, string> = {}

  for (const field of definition.userProvidedData ?? []) {
    const raw = values[field.name] ?? field.default ?? ''
    const value = String(raw).trim()
    if (field.required && !value) {
      throw new Error(`${field.label ?? field.name}不能为空`)
    }
    if (field.options?.length && value && !field.options.includes(value)) {
      throw new Error(`${field.label ?? field.name}取值无效`)
    }
    result[field.name] = value
  }

  return result
}

export function writeCliConnectorSecrets(connectorDir: string, definition: CliConnectorDefinition, values: Record<string, string>): void {
  const fields = new Map((definition.userProvidedData ?? []).map((field) => [field.name, field]))
  const data: Record<string, StoredSecretValue> = {}
  const safeStorage = getSafeStorage()

  for (const [key, value] of Object.entries(values)) {
    const field = fields.get(key)
    const shouldEncrypt = field?.type === 'password'
    if (shouldEncrypt && safeStorage?.isEncryptionAvailable()) {
      data[key] = {
        encrypted: true,
        value: safeStorage.encryptString(value).toString('base64'),
      }
    } else {
      if (shouldEncrypt) {
        console.warn(`[CLI连接器] safeStorage 不可用，${key} 将以明文存储`)
      }
      data[key] = { encrypted: false, value }
    }
  }

  const payload: CliConnectorSecrets = {
    version: 1,
    encrypted: Object.values(data).some((item) => item.encrypted),
    data,
  }
  writeFileSync(join(connectorDir, 'secrets.json'), JSON.stringify(payload, null, 2), 'utf-8')
}

export function readCliConnectorSecrets(connectorDir: string): Record<string, string> {
  const secretsPath = join(connectorDir, 'secrets.json')
  if (!existsSync(secretsPath)) return {}
  const raw = JSON.parse(readFileSync(secretsPath, 'utf-8')) as Partial<CliConnectorSecrets> | Record<string, string>

  if ('data' in raw && raw.data && typeof raw.data === 'object') {
    const values: Record<string, string> = {}
    const safeStorage = getSafeStorage()
    for (const [key, item] of Object.entries(raw.data)) {
      if (!item.encrypted) {
        values[key] = item.value
        continue
      }
      if (!safeStorage?.isEncryptionAvailable()) {
        throw new Error(`safeStorage 不可用，无法解密连接器密钥: ${key}`)
      }
      values[key] = safeStorage.decryptString(Buffer.from(item.value, 'base64'))
    }
    return values
  }

  // 兼容早期明文结构。
  return Object.fromEntries(
    Object.entries(raw)
      .filter(([, value]) => typeof value === 'string')
      .map(([key, value]) => [key, value as string]),
  )
}

export function writeCliConnectorRuntime(connectorDir: string, runtime: CliConnectorRuntime): void {
  writeFileSync(join(connectorDir, 'runtime.json'), JSON.stringify(runtime, null, 2), 'utf-8')
}

export function readCliConnectorRuntime(connectorDir: string): CliConnectorRuntime {
  const runtimePath = join(connectorDir, 'runtime.json')
  if (!existsSync(runtimePath)) return {}
  return JSON.parse(readFileSync(runtimePath, 'utf-8')) as CliConnectorRuntime
}

export function resolveCliConnectorEnv(definition: CliConnectorDefinition, secrets: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {}

  for (const [key, template] of Object.entries(definition.env ?? {})) {
    assertAllowedEnvKey(key)
    const match = template.match(/^\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}$/)
    if (match) {
      const sourceKey = match[1]!
      if (!(sourceKey in secrets)) {
        throw new Error(`cli.json.env 引用了未配置字段: ${sourceKey}`)
      }
      env[key] = secrets[sourceKey] ?? ''
      continue
    }
    if (template.includes('{{')) {
      throw new Error(`cli.json.env 模板格式不支持: ${key}`)
    }
    env[key] = template
  }

  return env
}

export function collectCliConnectorEnv(workspaceSlug: string, connectorsConfig: ConnectorsConfig): Record<string, string> {
  const env: Record<string, string> = {}
  const pathParts: string[] = []
  const connectorsDir = getConnectorsDir(workspaceSlug)

  for (const [connectorId, connector] of Object.entries(connectorsConfig.connectors)) {
    if (!connector.enabled || connector.type !== 'cli') continue
    if (!isSafeConnectorId(connectorId)) {
      console.warn(`[CLI连接器] 跳过非法连接器ID: ${connectorId}`)
      continue
    }

    const connectorDir = join(connectorsDir, connectorId)
    if (!existsSync(join(connectorDir, 'cli.json'))) continue
    try {
      const definition = readCliConnectorDefinition(connectorDir)
      const secrets = readCliConnectorSecrets(connectorDir)
      Object.assign(env, resolveCliConnectorEnv(definition, secrets))

      const runtime = readCliConnectorRuntime(connectorDir)
      if (runtime.binDir) {
        pathParts.push(runtime.binDir)
      } else if (runtime.commandPath && isAbsolute(runtime.commandPath)) {
        pathParts.push(dirname(runtime.commandPath))
      }
    } catch (err) {
      console.warn(`[CLI连接器] 读取运行时环境失败 (${connectorId}):`, err)
    }
  }

  if (pathParts.length > 0) {
    env.PATH = [...pathParts, process.env.PATH ?? ''].filter(Boolean).join(delimiter)
  }

  return env
}

function assertAllowedEnvKey(key: string): void {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
    throw new Error(`非法环境变量名: ${key}`)
  }
  if (RESERVED_ENV_KEY_PATTERNS.some((pattern) => pattern.test(key))) {
    throw new Error(`不允许连接器覆盖保留环境变量: ${key}`)
  }
}

function isSafeConnectorId(connectorId: string): boolean {
  return /^[a-zA-Z0-9._-]+$/.test(connectorId) && connectorId !== '.' && connectorId !== '..'
}

function getSafeStorage(): ElectronSafeStorage | null {
  try {
    const electron = require('electron') as { safeStorage?: ElectronSafeStorage }
    return electron.safeStorage ?? null
  } catch {
    return null
  }
}
