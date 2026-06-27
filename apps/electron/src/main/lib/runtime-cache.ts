/**
 * 运行时检测结果磁盘缓存
 *
 * 目的：运行时检测（Node/Git/Bun/Git Bash）在慢机器上可能耗时数秒。
 * 把上一次的检测结果落盘，下次启动先用缓存即时返回，再在后台静默重测、推送刷新，
 * 从而消除"启动后一段时间内 getRuntimeStatus() 返回 null"的窗口。
 *
 * 缓存只是"乐观值"，后台重测始终会用真实结果覆盖，故无需做过期失效；
 * 仅用 schema 版本 + 平台做安全校验，避免格式变更或跨平台误用导致崩溃。
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import type { RuntimeStatus } from '@proma/shared'

/** 缓存 schema 版本：结构变更时递增，旧缓存自动失效 */
const CACHE_SCHEMA_VERSION = 1

interface RuntimeCacheFile {
  schemaVersion: number
  platform: NodeJS.Platform
  status: RuntimeStatus
}

function getCacheFilePath(): string {
  return join(app.getPath('userData'), 'runtime-cache.json')
}

/**
 * 同步读取运行时缓存。任何异常（文件不存在/损坏/格式不符/跨平台）都返回 null，
 * 调用方据此回退到实时检测。
 */
export function readRuntimeCache(): RuntimeStatus | null {
  try {
    const raw = readFileSync(getCacheFilePath(), 'utf-8')
    const parsed = JSON.parse(raw) as Partial<RuntimeCacheFile>

    if (
      parsed.schemaVersion !== CACHE_SCHEMA_VERSION ||
      parsed.platform !== process.platform ||
      !parsed.status ||
      typeof parsed.status !== 'object'
    ) {
      return null
    }

    // 最小形状校验：核心字段存在即可，细粒度由 TS 类型在写入侧保证
    const status = parsed.status
    if (!status.node || !status.git || !status.bun) {
      return null
    }

    return status
  } catch {
    return null
  }
}

/**
 * 写入运行时缓存。失败仅告警，不抛出——缓存写入失败不应影响启动。
 */
export function writeRuntimeCache(status: RuntimeStatus): void {
  try {
    const payload: RuntimeCacheFile = {
      schemaVersion: CACHE_SCHEMA_VERSION,
      platform: process.platform,
      status,
    }
    writeFileSync(getCacheFilePath(), JSON.stringify(payload), 'utf-8')
  } catch (error) {
    console.warn('[运行时缓存] 写入失败（已忽略）:', error)
  }
}
