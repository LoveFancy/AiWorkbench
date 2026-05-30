import { describe, expect, test } from 'bun:test'
import { formatManagedPath } from './managed-path-display'

describe('formatManagedPath', () => {
  test('会话工作区文件显示为 session 相对路径', () => {
    const sessionPath = '/Users/qinxiao/WorkSpace/promawork/agent-workspaces/default/session-1'

    expect(formatManagedPath(`${sessionPath}/src/a.md`, { sessionPath })).toBe('session/src/a.md')
    expect(formatManagedPath(sessionPath, { sessionPath })).toBe('session/')
  })

  test('工作区共享文件显示为 work 相对路径', () => {
    const workspaceFilesPath = '/Users/qinxiao/WorkSpace/promawork/agent-workspaces/default/workspace-files'

    expect(formatManagedPath(`${workspaceFilesPath}/docs/note.md`, { workspaceFilesPath })).toBe('work/docs/note.md')
    expect(formatManagedPath(workspaceFilesPath, { workspaceFilesPath })).toBe('work/')
  })

  test('可从 basePaths 推断工作区和会话短路径', () => {
    const sessionPath = '/data/agent-workspaces/default/session-1'
    const workspaceFilesPath = '/data/agent-workspaces/default/workspace-files'

    expect(formatManagedPath(`${sessionPath}/todo.md`, { basePaths: [sessionPath, workspaceFilesPath] })).toBe('session/todo.md')
    expect(formatManagedPath(`${workspaceFilesPath}/note.md`, { basePaths: [sessionPath, workspaceFilesPath] })).toBe('work/note.md')
  })

  test('非托管路径保持真实路径', () => {
    expect(formatManagedPath('/tmp/outside.md', { sessionPath: '/data/session' })).toBe('/tmp/outside.md')
  })
})
