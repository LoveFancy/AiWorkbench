import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ipcSource = readFileSync(join(import.meta.dir, 'ipc.ts'), 'utf8')
const preloadSource = readFileSync(join(import.meta.dir, '../preload/index.ts'), 'utf8')
const detachedWindowSource = readFileSync(join(import.meta.dir, 'lib/detached-preview-window.ts'), 'utf8')

describe('HTML 预览 IPC', () => {
  test('主进程使用授权目录 token 准备 HTML 预览', () => {
    expect(ipcSource).toContain('IPC_CHANNELS.PREPARE_HTML_PREVIEW')
    expect(ipcSource).toContain('registerPromaDirectoryPath')
    expect(ipcSource).toContain('normalizeFileAccessOptions(access)')
    expect(ipcSource).toContain('getAllowedCandidateBasePaths(options)')
    expect(ipcSource).toContain('isPathAllowed(resolved, options)')
    expect(ipcSource).toContain("extname(resolved).toLowerCase()")
  })

  test('preload 暴露 prepareHtmlPreview', () => {
    expect(preloadSource).toContain('prepareHtmlPreview:')
    expect(preloadSource).toContain('IPC_CHANNELS.PREPARE_HTML_PREVIEW')
  })

  test('独立预览窗口按 previewKind 区分窗口签名', () => {
    expect(detachedWindowSource).toContain('previewKind: input.previewKind')
  })
})
