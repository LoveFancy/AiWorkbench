/**
 * WorkMate 服务统一初始化
 *
 * 在 bootstrap 中调用 initWorkmateServices()，负责：
 * 1. 观测上报服务初始化
 * 2. 全局异常捕获注册
 * 3. 渲染进程 IPC 桥接
 *
 * 不侵入 Proma 核心文件，所有 WorkMate 特定逻辑集中于此。
 */

import { init as initObservability, shutdown as shutdownObservability } from './observability-service'
import { registerGlobalErrorHandlers } from './error-handler'
import { resolveApiBase } from '../../shared/hteip-client'
import type { ObservabilityConfig } from '../../types/workmate'

let _serverUrl: string | null = null

function getWorkmateServerUrl(): string {
  if (_serverUrl) return _serverUrl
  _serverUrl = resolveApiBase()
  return _serverUrl
}

export function initWorkmateServices(): void {
  // 1. 全局异常捕获（必须在最前面注册）
  registerGlobalErrorHandlers()

  // 2. 观测上报初始化
  const serverUrl = getWorkmateServerUrl()
  const config: ObservabilityConfig = {
    enabled: true,
    url: `${serverUrl}/workmate/observability/events`.replace(/\/+$/, ''),
    timeoutMs: 5000,
    maxQueueSize: 200,
    flushIntervalMs: 5000,
    maxBatchSize: 50,
    // sampleRate / maxEventsPerMinute 暂不启用，字段保留
    enableBreadcrumbs: true,
    maxBreadcrumbs: 20,
    maxEventBytes: 256 * 1024,
  }
  initObservability(config)

  console.log('[WorkMate] 观测上报服务已初始化, url=%s', config.url)
}

export async function shutdownWorkmateServices(): Promise<void> {
  await shutdownObservability()
}
