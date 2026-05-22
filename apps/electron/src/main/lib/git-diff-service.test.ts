import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'

const source = readFileSync(join(import.meta.dir, 'git-diff-service.ts'), 'utf-8')

describe('Git Diff 服务', () => {
  test('Git 命令不能使用同步 spawn 阻塞 Electron 主进程', () => {
    expect(source).not.toContain('spawnSync')
    expect(source).toContain("from 'child_process'")
    expect(source).toContain('spawn(')
  })
})
