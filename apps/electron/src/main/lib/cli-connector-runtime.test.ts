import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, delimiter, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import type { ConnectorsConfig } from '@proma/shared'
import { clearConfigDirNameForTest, getConnectorsDir } from './config-paths'
import { clearConfigRootOverride, setConfigRoot } from './config-root-service'
import { collectCliConnectorEnv, writeCliConnectorRuntime, writeCliConnectorSecrets } from './cli-connector-runtime'

let root: string

describe('collectCliConnectorEnv', () => {
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'proma-cli-connector-runtime-'))
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

  test('hi-agent 启用后使用 SkillHub Token 注入运行环境且不读取 connector secrets', async () => {
    const connectorDir = join(getConnectorsDir('default'), 'hi-agent')
    mkdirSync(connectorDir, { recursive: true })
    writeFileSync(join(connectorDir, 'cli.json'), JSON.stringify({
      env: {
        HTSKILL_TOKEN: '{{HTSKILL_TOKEN}}',
        AGENTOS_ENV: 'uat',
      },
    }, null, 2), 'utf-8')
    writeCliConnectorRuntime(connectorDir, {
      commandPath: join(root, 'bin', process.platform === 'win32' ? 'talents.cmd' : 'talents'),
    })

    const env = await collectCliConnectorEnv('default', {
      version: '1.0',
      connectors: {
        'hi-agent': {
          type: 'cli',
          enabled: true,
          source: 'preset',
          displayName: '泰为 hiagent',
        },
      },
    } satisfies ConnectorsConfig, {
      getSkillHubToken: async () => 'fresh-skillhub-token',
    })

    expect(env.HTSKILL_TOKEN).toBe('fresh-skillhub-token')
    expect(env.AGENTOS_ENV).toBe('uat')
    expect(env.PATH?.split(delimiter)[0]).toBe(join(root, 'bin'))
  })

  test('通用 CLI 连接器仍从 secrets.json 注入运行环境', async () => {
    const connectorDir = join(getConnectorsDir('default'), 'huatai-gitlab')
    mkdirSync(connectorDir, { recursive: true })
    writeFileSync(join(connectorDir, 'cli.json'), JSON.stringify({
      userProvidedData: [
        { name: 'GITLAB_TOKEN', label: 'GitLab Token', type: 'password', required: true },
      ],
      env: {
        GITLAB_HOST: 'gitlab.htzq.htsc.com.cn',
        GITLAB_TOKEN: '{{GITLAB_TOKEN}}',
      },
    }, null, 2), 'utf-8')
    const commandPath = join(root, 'glab')
    writeCliConnectorRuntime(connectorDir, { commandPath })
    writeCliConnectorSecrets(connectorDir, {
      userProvidedData: [
        { name: 'GITLAB_TOKEN', label: 'GitLab Token', type: 'password', required: true },
      ],
    }, {
      GITLAB_TOKEN: 'gitlab-token',
    })

    const env = await collectCliConnectorEnv('default', {
      version: '1.0',
      connectors: {
        'huatai-gitlab': {
          type: 'cli',
          enabled: true,
          source: 'preset',
          displayName: '华泰 GitLab',
        },
      },
    } satisfies ConnectorsConfig)

    expect(env.GITLAB_HOST).toBe('gitlab.htzq.htsc.com.cn')
    expect(env.GITLAB_TOKEN).toBe('gitlab-token')
    expect(env.PATH?.split(delimiter)[0]).toBe(dirname(commandPath))
  })
})
