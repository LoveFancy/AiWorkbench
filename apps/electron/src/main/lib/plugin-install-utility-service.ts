import { join } from 'node:path'
import type { AgentPluginInstallInput, AgentPluginInstallProgress, AgentPluginInstallResult } from '@proma/shared'
import { AGENT_IPC_CHANNELS } from '@proma/shared'
import { getMarketplaceInstallToken } from './plugin-marketplace-service'

interface PluginInstallWorkerResultMessage {
  type: 'result'
  result: AgentPluginInstallResult
}

interface PluginInstallWorkerProgressMessage {
  type: 'progress'
  progress: AgentPluginInstallProgress
}

interface PluginInstallWorkerErrorMessage {
  type: 'error'
  error: string
}

type PluginInstallWorkerMessage =
  | PluginInstallWorkerResultMessage
  | PluginInstallWorkerProgressMessage
  | PluginInstallWorkerErrorMessage

interface ElectronRuntime {
  app: Electron.App
  BrowserWindow: typeof Electron.BrowserWindow
  utilityProcess: typeof Electron.UtilityProcess
}

export interface PluginInstallUtilityProcess {
  postMessage: (message: unknown) => void
  kill: () => boolean
  on(event: 'message', listener: (message: unknown) => void): PluginInstallUtilityProcess
  on(event: 'exit', listener: (code: number) => void): PluginInstallUtilityProcess
  on(event: 'error', listener: (...args: unknown[]) => void): PluginInstallUtilityProcess
}

interface InstallMarketplacePluginInUtilityProcessOptions {
  forkUtilityProcess?: () => PluginInstallUtilityProcess
  onProgress?: (progress: AgentPluginInstallProgress) => void
  marketplacesPath?: string
  decryptToken?: (token: string) => string
}

function electronRuntime(): ElectronRuntime {
  return require('electron') as ElectronRuntime
}

function workerPath(): string {
  const { app } = electronRuntime()
  return app.isPackaged
    ? join(process.resourcesPath, 'app.asar.unpacked', 'dist', 'plugin-install-worker.cjs')
    : join(__dirname, 'plugin-install-worker.cjs')
}

function forkPluginInstallWorker(): PluginInstallUtilityProcess {
  const { utilityProcess } = electronRuntime()
  return utilityProcess.fork(workerPath(), [], {
    serviceName: 'workmate-plugin-install-worker',
    stdio: 'pipe',
  }) as PluginInstallUtilityProcess
}

function isWorkerMessage(message: unknown): message is PluginInstallWorkerMessage {
  if (typeof message !== 'object' || message === null) return false
  const record = message as Record<string, unknown>
  return record.type === 'result' || record.type === 'progress' || record.type === 'error'
}

export function broadcastPluginInstallProgress(progress: AgentPluginInstallProgress): void {
  const { BrowserWindow } = electronRuntime()
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(AGENT_IPC_CHANNELS.PLUGIN_INSTALL_PROGRESS, progress)
  }
}

export async function installMarketplacePluginInUtilityProcess(
  input: AgentPluginInstallInput,
  options: InstallMarketplacePluginInUtilityProcessOptions = {},
): Promise<AgentPluginInstallResult> {
  const child = options.forkUtilityProcess?.() ?? forkPluginInstallWorker()
  const onProgress = options.onProgress ?? broadcastPluginInstallProgress

  return await new Promise<AgentPluginInstallResult>((resolve, reject) => {
    let settled = false

    const settle = (callback: () => void): void => {
      if (settled) return
      settled = true
      callback()
    }

    child.on('message', (message) => {
      if (!isWorkerMessage(message)) return

      if (message.type === 'progress') {
        onProgress(message.progress)
        return
      }

      if (message.type === 'result') {
        settle(() => resolve(message.result))
        return
      }

      settle(() => reject(new Error(message.error)))
    })

    child.on('exit', (code) => {
      settle(() => reject(new Error(`插件安装进程异常退出 (${code})`)))
    })

    child.on('error', (...args) => {
      const message = args.map((item) => String(item)).join(' ')
      settle(() => reject(new Error(message || '插件安装进程异常')))
    })

    child.postMessage({
      type: 'install',
      input,
      authToken: getMarketplaceInstallToken(input.marketplaceId, {
        ...(options.marketplacesPath && { marketplacesPath: options.marketplacesPath }),
        ...(options.decryptToken && { decryptToken: options.decryptToken }),
      }) ?? undefined,
    })
  })
}
