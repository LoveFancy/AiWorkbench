import { describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AgentPluginInstallProgress, AgentPluginInstallResult } from '@proma/shared'
import type { PluginInstallUtilityProcess } from './plugin-install-utility-service.ts'
import { installMarketplacePluginInUtilityProcess } from './plugin-install-utility-service.ts'

class FakeUtilityProcess implements PluginInstallUtilityProcess {
  constructor(
    private readonly onMessage: (listener: (message: unknown) => void) => void,
    private readonly postedMessages: unknown[] = [],
  ) {}

  postMessage(message: unknown): void {
    this.postedMessages.push(message)
  }

  kill(): boolean {
    return true
  }

  on(event: 'message', listener: (message: unknown) => void): PluginInstallUtilityProcess
  on(event: 'exit', listener: (code: number) => void): PluginInstallUtilityProcess
  on(event: 'error', listener: (...args: unknown[]) => void): PluginInstallUtilityProcess
  on(event: 'message' | 'exit' | 'error', listener: ((message: unknown) => void) | ((code: number) => void) | ((...args: unknown[]) => void)): PluginInstallUtilityProcess {
    if (event === 'message') this.onMessage(listener as (message: unknown) => void)
    return this
  }
}

describe('插件安装 utility process 服务', () => {
  test('通过 utility process 安装插件并转发进度', async () => {
    const progressEvents: AgentPluginInstallProgress[] = []
    const result: AgentPluginInstallResult = {
      pluginId: 'user:remote/remote-plugin',
      status: 'installed',
      enabled: true,
    }
    const fakeProcess = new FakeUtilityProcess((listener) => {
      queueMicrotask(() => {
        listener({
          type: 'progress',
          progress: {
            marketplaceId: 'remote',
            pluginName: 'remote-plugin',
            stage: 'cloning',
            message: '正在下载插件',
            progress: 25,
          },
        })
        listener({ type: 'result', result })
      })
    })

    const actual = await installMarketplacePluginInUtilityProcess(
      { marketplaceId: 'remote', pluginName: 'remote-plugin', enable: true },
      {
        forkUtilityProcess: () => fakeProcess,
        onProgress: (progress) => progressEvents.push(progress),
      },
    )

    expect(actual).toEqual(result)
    expect(progressEvents).toEqual([{
      marketplaceId: 'remote',
      pluginName: 'remote-plugin',
      stage: 'cloning',
      message: '正在下载插件',
      progress: 25,
    }])
  })

  test('向 utility process 传递主进程解密后的市场 Token', async () => {
    const root = mkdtempSync(join(tmpdir(), 'proma-plugin-install-utility-'))
    try {
      const marketplacesPath = join(root, 'plugin-marketplaces.json')
      const postedMessages: unknown[] = []
      mkdirSync(root, { recursive: true })
      writeFileSync(
        marketplacesPath,
        JSON.stringify({
          version: 1,
          marketplaces: [{
            id: 'private-market',
            name: 'Private Market',
            source: 'https://github.com/org/private-market',
            type: 'github',
            enabled: true,
            addedAt: new Date().toISOString(),
            lastRefreshAt: null,
            auth: { type: 'token', tokenConfigured: true },
            authToken: 'encrypted:secret-token',
          }],
        }),
        'utf-8',
      )

      const fakeProcess = new FakeUtilityProcess((listener) => {
        queueMicrotask(() => {
          listener({
            type: 'result',
            result: {
              pluginId: 'user:private-market/private-plugin',
              status: 'installed',
              enabled: true,
            } satisfies AgentPluginInstallResult,
          })
        })
      }, postedMessages)

      await installMarketplacePluginInUtilityProcess(
        { marketplaceId: 'private-market', pluginName: 'private-plugin', enable: true },
        {
          forkUtilityProcess: () => fakeProcess,
          marketplacesPath,
          decryptToken: (token) => token.replace(/^encrypted:/, ''),
        },
      )

      expect(postedMessages[0]).toMatchObject({
        type: 'install',
        authToken: {
          encryptedToken: 'encrypted:secret-token',
          token: 'secret-token',
        },
      })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
