import type { AgentPluginInstallInput, AgentPluginInstallProgress, AgentPluginInstallResult } from '@proma/shared'
import { installMarketplacePlugin } from './lib/plugin-marketplace-service'

interface InstallWorkerRequest {
  type: 'install'
  input: AgentPluginInstallInput
  authToken?: {
    encryptedToken: string
    token: string
  }
}

interface UtilityParentPort {
  on: (event: 'message', listener: (event: { data: unknown }) => void) => void
  postMessage: (message: unknown) => void
}

function parentPort(): UtilityParentPort {
  const port = process.parentPort as unknown as UtilityParentPort | undefined
  if (!port) throw new Error('插件安装 worker 未运行在 utility process 中')
  return port
}

function isInstallWorkerRequest(value: unknown): value is InstallWorkerRequest {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return record.type === 'install' && typeof record.input === 'object' && record.input !== null
}

function progress(input: AgentPluginInstallInput, stage: AgentPluginInstallProgress['stage'], message: string, value: number): void {
  parentPort().postMessage({
    type: 'progress',
    progress: {
      marketplaceId: input.marketplaceId,
      pluginName: input.pluginName,
      stage,
      message,
      progress: value,
    } satisfies AgentPluginInstallProgress,
  })
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

parentPort().on('message', (event) => {
  const request = event.data
  if (!isInstallWorkerRequest(request)) {
    parentPort().postMessage({ type: 'error', error: '插件安装 worker 收到无效请求' })
    return
  }

  void (async () => {
    try {
      progress(request.input, 'preparing', '正在准备插件安装', 5)
      const result: AgentPluginInstallResult = await installMarketplacePlugin(request.input, {
        decryptToken: request.authToken
          ? (token) => token === request.authToken?.encryptedToken ? request.authToken.token : token
          : undefined,
        onProgress: (event) => {
          progress(request.input, event.stage, event.message, event.progress)
        },
      })
      progress(request.input, 'done', '插件安装完成', 100)
      parentPort().postMessage({ type: 'result', result })
    } catch (error) {
      parentPort().postMessage({
        type: 'progress',
        progress: {
          marketplaceId: request.input.marketplaceId,
          pluginName: request.input.pluginName,
          stage: 'error',
          message: '插件安装失败',
          progress: 100,
          error: errorMessage(error),
        } satisfies AgentPluginInstallProgress,
      })
      parentPort().postMessage({ type: 'error', error: errorMessage(error) })
    }
  })()
})
