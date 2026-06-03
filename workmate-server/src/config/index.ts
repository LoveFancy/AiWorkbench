import dotenv from 'dotenv'
import path from 'node:path'

dotenv.config()

interface Config {
  port: number
  host: string
  databaseUrl: string
  userIdEncryptionKey: string
  requireUserId: boolean
  defaultUserId: string
  modelPlatformApiUrl: string
  modelPlatformTimeoutMs: number
  observabilitySampleRate: number
  observabilityMaxEventsPerMinute: number
  logLevel: string
  logDir: string
}

function loadConfig(): Config {
  return {
    port: parseInt(process.env.PORT ?? '3000', 10),
    host: process.env.HOST ?? '0.0.0.0',

    databaseUrl: process.env.DATABASE_URL ?? '',

    userIdEncryptionKey: process.env.USER_ID_ENCRYPTION_KEY ?? '',

    requireUserId: process.env.REQUIRE_USER_ID !== 'false',
    defaultUserId: process.env.DEFAULT_USER_ID ?? 'test_user',

    modelPlatformApiUrl:
      process.env.MODEL_PLATFORM_API_URL ?? 'http://model-platform.htsc.com/api/v1',
    modelPlatformTimeoutMs: parseInt(
      process.env.MODEL_PLATFORM_TIMEOUT_MS ?? '10000',
      10
    ),

    observabilitySampleRate: parseFloat(
      process.env.OBSERVABILITY_SAMPLE_RATE ?? '1.0'
    ),
    observabilityMaxEventsPerMinute: parseInt(
      process.env.OBSERVABILITY_MAX_EVENTS_PER_MINUTE ?? '60',
      10
    ),

    logLevel: process.env.LOG_LEVEL ?? 'info',
    logDir: process.env.LOG_DIR ?? path.resolve(process.cwd(), 'logs'),
  }
}

export interface TestConfig extends Config {
  databaseUrl: string
}

function loadTestConfig(): TestConfig {
  const baseConfig = loadConfig()
  return {
    ...baseConfig,
    databaseUrl:
      process.env.DATABASE_URL ??
      'mysql://root:fxd1993@127.0.0.1:3306/workmate_server_test',
  }
}

export const config = process.env.NODE_ENV === 'test' ? loadTestConfig() : loadConfig()