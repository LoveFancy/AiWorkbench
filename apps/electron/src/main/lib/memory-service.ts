/**
 * 全局记忆配置服务
 *
 * 管理本地 MemOS 记忆配置的读写。
 * 存储在 ~/.proma/memory.json（全局共享）
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { getMemoryConfigPath } from './config-paths'
import type { MemoryConfig } from '@proma/shared'

/** 默认记忆配置 */
const DEFAULT_MEMORY_CONFIG: MemoryConfig = {
  enabled: false,
  serverUrl: 'http://168.64.22.211:8000',
  cubeId: '',
  ownerId: 'root',
  cubeName: '',
  apiKey: '',
  userId: '',
}

/**
 * 获取全局记忆配置
 */
export function getMemoryConfig(): MemoryConfig {
  const filePath = getMemoryConfigPath()

  if (!existsSync(filePath)) {
    return { ...DEFAULT_MEMORY_CONFIG }
  }

  try {
    const raw = readFileSync(filePath, 'utf-8')
    const data = JSON.parse(raw) as Record<string, unknown>

    return {
      enabled: typeof data.enabled === 'boolean' ? data.enabled : false,
      serverUrl: typeof data.serverUrl === 'string' && data.serverUrl ? data.serverUrl : DEFAULT_MEMORY_CONFIG.serverUrl,
      cubeId: typeof data.cubeId === 'string' ? data.cubeId : '',
      ownerId: typeof data.ownerId === 'string' ? data.ownerId : 'root',
      cubeName: typeof data.cubeName === 'string' ? data.cubeName : '',
      // 旧字段兼容
      apiKey: typeof data.apiKey === 'string' ? data.apiKey : '',
      userId: typeof data.userId === 'string' ? data.userId : '',
      baseUrl: typeof data.baseUrl === 'string' ? data.baseUrl : undefined,
    }
  } catch (error) {
    console.error('[记忆服务] 读取配置失败:', error)
    return { ...DEFAULT_MEMORY_CONFIG }
  }
}

/**
 * 保存全局记忆配置
 */
export function setMemoryConfig(config: MemoryConfig): void {
  const filePath = getMemoryConfigPath()
  try {
    writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf-8')
    console.log(`[记忆服务] 配置已更新 (enabled: ${config.enabled}, cubeId: ${config.cubeId ? config.cubeId.slice(0, 8) + '...' : '未设置'})`)
  } catch (error) {
    console.error('[记忆服务] 保存配置失败:', error)
    throw new Error('保存记忆配置失败')
  }
}
