import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import type { ConnectorsConfig } from '@proma/shared'
import { clearConfigDirNameForTest, getConnectorsConfigPath, getConnectorsDir, getDefaultConnectorsDir } from './config-paths'
import { clearConfigRootOverride, setConfigRoot } from './config-root-service'
import { syncDefaultConnectorsToWorkspace } from './agent-workspace-manager'

let root: string

describe('syncDefaultConnectorsToWorkspace', () => {
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'proma-connectors-sync-'))
    clearConfigRootOverride()
    clearConfigDirNameForTest()
    setConfigRoot(join(root, 'custom-next-run'), { homeDir: root, configDirName: '.workmate-dev' })
    mkdirSync(join(root, '.workmate-dev', 'agent-workspaces', 'default'), { recursive: true })
  })

  afterEach(() => {
    clearConfigRootOverride()
    clearConfigDirNameForTest()
    rmSync(root, { recursive: true, force: true })
  })

  test('已有 hi-agent 连接器会同步新版 cli.json 以使用 SkillHub Token', () => {
    const defaultHiAgentDir = join(getDefaultConnectorsDir(), 'hi-agent')
    mkdirSync(defaultHiAgentDir, { recursive: true })
    writeFileSync(join(defaultHiAgentDir, 'connector.json'), JSON.stringify({
      type: 'cli',
      displayName: '泰为 HiAgent',
      version: '1.0.4',
      skillDirs: ['skills/talents-cli'],
    }, null, 2), 'utf-8')
    writeFileSync(join(defaultHiAgentDir, 'cli.json'), JSON.stringify({
      userProvidedData: [],
      env: {
        HTSKILL_TOKEN: '{{HTSKILL_TOKEN}}',
        AGENTOS_ENV: 'uat',
      },
    }, null, 2), 'utf-8')

    const workspaceHiAgentDir = join(getConnectorsDir('default'), 'hi-agent')
    mkdirSync(workspaceHiAgentDir, { recursive: true })
    writeFileSync(join(workspaceHiAgentDir, 'connector.json'), JSON.stringify({
      type: 'cli',
      displayName: '用户保留的展示名',
    }, null, 2), 'utf-8')
    writeFileSync(join(workspaceHiAgentDir, 'cli.json'), JSON.stringify({
      userProvidedData: [
        { name: 'HTSKILL_TOKEN', type: 'password', required: true },
      ],
      env: {
        HTSKILL_TOKEN: '{{HTSKILL_TOKEN}}',
        AGENTOS_ENV: '{{AGENTOS_ENV}}',
      },
    }, null, 2), 'utf-8')
    writeFileSync(getConnectorsConfigPath('default'), JSON.stringify({
      version: '1.0',
      connectors: {
        'hi-agent': {
          type: 'cli',
          enabled: true,
          source: 'preset',
          displayName: '用户保留的展示名',
        },
      },
    } satisfies ConnectorsConfig, null, 2), 'utf-8')

    syncDefaultConnectorsToWorkspace('default')

    const syncedCli = JSON.parse(readFileSync(join(workspaceHiAgentDir, 'cli.json'), 'utf-8')) as {
      userProvidedData?: unknown[]
      env?: Record<string, string>
    }
    const preservedMeta = JSON.parse(readFileSync(join(workspaceHiAgentDir, 'connector.json'), 'utf-8')) as {
      displayName?: string
    }
    const connectors = JSON.parse(readFileSync(getConnectorsConfigPath('default'), 'utf-8')) as ConnectorsConfig

    expect(syncedCli.userProvidedData).toEqual([])
    expect(syncedCli.env?.HTSKILL_TOKEN).toBe('{{HTSKILL_TOKEN}}')
    expect(syncedCli.env?.AGENTOS_ENV).toBe('uat')
    expect(preservedMeta.displayName).toBe('用户保留的展示名')
    expect(connectors.connectors['hi-agent']?.enabled).toBe(true)
  })
})
