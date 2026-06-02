import { describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { listAgentSlashCommandsFromPaths, scanSlashCommandsInDir } from './agent-slash-command-service.ts'

function createTempRoot(): { root: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), 'proma-slash-command-'))
  return {
    root,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  }
}

describe('Agent slash command 服务', () => {
  test('扫描 commands 目录下的 Markdown 命令', () => {
    const temp = createTempRoot()
    try {
      const commandsDir = join(temp.root, 'commands')
      mkdirSync(commandsDir, { recursive: true })
      writeFileSync(
        join(commandsDir, 'review.md'),
        [
          '---',
          'description: 审查当前改动',
          'argument-hint: [范围]',
          '---',
          '',
          '请审查当前改动。',
        ].join('\n'),
        'utf-8',
      )

      const commands = scanSlashCommandsInDir(commandsDir, {
        source: 'workspace',
        sourceLabel: '当前工作区',
      })

      expect(commands).toEqual([
        {
          name: 'review',
          command: '/review',
          description: '审查当前改动',
          argumentHint: '[范围]',
          source: 'workspace',
          sourceLabel: '当前工作区',
          filePath: join(commandsDir, 'review.md'),
        },
      ])
    } finally {
      temp.cleanup()
    }
  })

  test('子目录仅作为来源标签并忽略非 Markdown 文件', () => {
    const temp = createTempRoot()
    try {
      const commandsDir = join(temp.root, 'commands')
      mkdirSync(join(commandsDir, 'git'), { recursive: true })
      writeFileSync(join(commandsDir, 'git', 'commit.md'), '生成提交信息', 'utf-8')
      writeFileSync(join(commandsDir, 'notes.txt'), '不是命令', 'utf-8')

      const commands = scanSlashCommandsInDir(commandsDir, {
        source: 'workspace',
        sourceLabel: '当前工作区',
      })

      expect(commands.map((command) => command.command)).toEqual(['/commit'])
      expect(commands[0]?.sourceLabel).toBe('当前工作区:git')
      expect(commands[0]?.description).toBe('生成提交信息')
    } finally {
      temp.cleanup()
    }
  })

  test('列出工作区、内置插件和用户插件命令', () => {
    const temp = createTempRoot()
    try {
      const workspaceDir = join(temp.root, 'workspace')
      const builtinPluginDir = join(temp.root, 'default-plugins', 'superpowers')
      const userPluginDir = join(temp.root, 'user-plugins', 'market', 'frontend-design')
      mkdirSync(join(workspaceDir, 'commands'), { recursive: true })
      mkdirSync(join(builtinPluginDir, 'commands'), { recursive: true })
      mkdirSync(join(userPluginDir, 'commands'), { recursive: true })
      writeFileSync(join(workspaceDir, 'commands', 'release.md'), '发布', 'utf-8')
      writeFileSync(join(builtinPluginDir, 'commands', 'brainstorming.md'), '头脑风暴', 'utf-8')
      writeFileSync(join(userPluginDir, 'commands', 'design.md'), '设计', 'utf-8')

      const commands = listAgentSlashCommandsFromPaths({
        workspaceSlug: 'default',
        workspacePath: workspaceDir,
        builtinPluginPaths: [{ id: 'builtin:superpowers', name: 'superpowers', path: builtinPluginDir }],
        userPluginPaths: [{ id: 'user:market/frontend-design', name: 'frontend-design', path: userPluginDir }],
      })

      expect(commands.map((command) => `${command.source}:${command.command}:${command.sourceLabel}`)).toEqual([
        'builtin:/brainstorming:superpowers',
        'user:/design:frontend-design',
        'workspace:/release:default',
      ])
    } finally {
      temp.cleanup()
    }
  })
})
