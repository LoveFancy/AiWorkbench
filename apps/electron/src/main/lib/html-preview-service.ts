import { extname, dirname, relative } from 'node:path'
import { statSync, existsSync } from 'node:fs'
import type { HtmlPreviewResult } from '@proma/shared'

/**
 * 验证 targetPath 是否为有效的 HTML 文件（扩展名为 .html/.htm 且为普通文件）。
 * 不执行权限校验——权限由调用方在 isPathAllowed 中单独处理。
 */
export function isValidHtmlFile(resolvedPath: string): boolean {
  const ext = extname(resolvedPath).toLowerCase()
  if (ext !== '.html' && ext !== '.htm') return false
  if (!existsSync(resolvedPath)) return false
  const st = statSync(resolvedPath)
  return st.isFile()
}

/**
 * 基于已授权的 HTML 文件路径构造预览 URL。
 * registerDir 由调用方传入，通常是 registerPromaDirectoryPath。
 */
export function buildHtmlPreviewUrl(
  resolvedPath: string,
  registerDir: (dirPath: string) => string,
): HtmlPreviewResult {
  const rootDir = dirname(resolvedPath)
  const rootUrl = registerDir(rootDir)
  const entryPath = encodeURI(relative(rootDir, resolvedPath).replace(/\\/g, '/'))
  return {
    url: `${rootUrl}/${entryPath}`,
    resolvedPath,
  }
}
