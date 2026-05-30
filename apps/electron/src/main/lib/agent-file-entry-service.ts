import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'
import type { FileEntry } from '@proma/shared'

export type AgentFileEntryType = 'directory' | 'file'

export interface CreateAgentFileEntryInput {
  parentDir: string
  name: string
  type: AgentFileEntryType
  managedRoot: string
}

export function findManagedFileEntryRoot(parentDir: string, managedRoots: string[]): string | null {
  const resolvedParentDir = resolve(parentDir)
  return managedRoots.find((root) => {
    const resolvedRoot = resolve(root)
    return isPathInsideRoot(resolvedParentDir, resolvedRoot)
  }) ?? null
}

function assertSafeEntryName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('名称不能为空')
  if (trimmed === '.' || trimmed === '..') throw new Error('名称不能为特殊目录')
  if (trimmed.includes('/') || trimmed.includes('\\')) throw new Error('名称不能包含路径分隔符')
  if (trimmed.includes('\0')) throw new Error('名称包含非法字符')
  return trimmed
}

function isPathInsideRoot(path: string, root: string): boolean {
  const relativePath = relative(root, path)
  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath))
}

export function createAgentFileEntry(input: CreateAgentFileEntryInput): FileEntry {
  const name = assertSafeEntryName(input.name)
  const managedRoot = resolve(input.managedRoot)
  const parentDir = resolve(input.parentDir)
  if (!isPathInsideRoot(parentDir, managedRoot)) {
    throw new Error('只能在托管文件目录下创建')
  }
  if (!existsSync(parentDir) || !statSync(parentDir).isDirectory()) {
    throw new Error('目标目录不存在')
  }

  const targetPath = resolve(parentDir, name)
  if (!isPathInsideRoot(targetPath, managedRoot)) {
    throw new Error('只能在托管文件目录下创建')
  }
  if (existsSync(targetPath)) {
    throw new Error('同名文件或文件夹已存在')
  }

  if (input.type === 'directory') {
    mkdirSync(targetPath)
    return {
      name,
      path: targetPath,
      isDirectory: true,
    }
  }

  writeFileSync(targetPath, '', 'utf-8')
  return {
    name,
    path: targetPath,
    isDirectory: false,
    size: 0,
  }
}
