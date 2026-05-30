import { describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { createAgentFileEntry, findManagedFileEntryRoot } from './agent-file-entry-service.ts'

function withTempRoot(run: (root: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), 'proma-agent-file-entry-'))
  try {
    run(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

describe('Agent 文件创建', () => {
  test('在托管目录下创建空文件', () => {
    withTempRoot((root) => {
      const entry = createAgentFileEntry({
        parentDir: root,
        name: 'notes.md',
        type: 'file',
        managedRoot: root,
      })

      expect(entry).toEqual({
        name: 'notes.md',
        path: resolve(root, 'notes.md'),
        isDirectory: false,
        size: 0,
      })
      expect(readFileSync(entry.path, 'utf-8')).toBe('')
    })
  })

  test('在托管目录下创建文件夹', () => {
    withTempRoot((root) => {
      const entry = createAgentFileEntry({
        parentDir: root,
        name: 'docs',
        type: 'directory',
        managedRoot: root,
      })

      expect(entry.isDirectory).toBe(true)
      expect(statSync(entry.path).isDirectory()).toBe(true)
    })
  })

  test('拒绝路径穿越和工作区外目录', () => {
    withTempRoot((root) => {
      expect(() => createAgentFileEntry({
        parentDir: root,
        name: '../escape.md',
        type: 'file',
        managedRoot: root,
      })).toThrow('名称不能包含路径分隔符')

      expect(() => createAgentFileEntry({
        parentDir: tmpdir(),
        name: 'escape.md',
        type: 'file',
        managedRoot: root,
      })).toThrow('只能在托管文件目录下创建')
    })
  })

  test('同名文件存在时拒绝覆盖', () => {
    withTempRoot((root) => {
      createAgentFileEntry({
        parentDir: root,
        name: 'notes.md',
        type: 'file',
        managedRoot: root,
      })

      expect(() => createAgentFileEntry({
        parentDir: root,
        name: 'notes.md',
        type: 'file',
        managedRoot: root,
      })).toThrow('同名文件或文件夹已存在')
      expect(existsSync(join(root, 'notes.md'))).toBe(true)
    })
  })

  test('只匹配托管根目录及其子目录', () => {
    withTempRoot((root) => {
      const workspaceFiles = join(root, 'workspace-files')
      const sessionDir = join(root, 'session-1')
      expect(findManagedFileEntryRoot(join(workspaceFiles, 'docs'), [workspaceFiles, sessionDir])).toBe(workspaceFiles)
      expect(findManagedFileEntryRoot(join(root, 'skills'), [workspaceFiles, sessionDir])).toBeNull()
    })
  })
})
