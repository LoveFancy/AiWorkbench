/**
 * 文件路径工具函数 — 纯函数，无 React 依赖
 *
 * 抽取自 FileBrowser.tsx，供 FileBrowser、SidePanel、FileTreeItem 等组件共用。
 */

/** 归一化：移除路径尾部斜杠 */
export function normalizeFsPath(filePath: string): string {
  return filePath.replace(/[/\\]+$/, '')
}

/** 获取父目录路径 */
export function getParentPath(filePath: string): string {
  const normalized = normalizeFsPath(filePath)
  const index = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'))
  return index > 0 ? normalized.slice(0, index) : normalized
}

/** 判断 parentPath 是否为 childPath 的祖先或相同路径 */
export function isSameOrChildPath(parentPath: string, childPath: string): boolean {
  const parent = normalizeFsPath(parentPath)
  const child = normalizeFsPath(childPath)
  return child === parent || child.startsWith(parent + '/') || child.startsWith(parent + '\\')
}

/** 判断目标路径是否落在 rootPath 内 */
export function isPathUnderRoot(rootPath: string, targetPath: string): boolean {
  if (!rootPath || !targetPath) return false
  const root = rootPath.replace(/[/\\]+$/, '')
  if (targetPath === root) return true
  return targetPath.startsWith(root + '/') || targetPath.startsWith(root + '\\')
}

/** 计算目标路径相对 rootPath 的祖先目录集合（不含 rootPath 自身、含目标的所有上级） */
export function computeRevealAncestors(rootPath: string, targetPath: string): Set<string> {
  const ancestors = new Set<string>()
  if (!rootPath || !targetPath) return ancestors
  const root = rootPath.replace(/[/\\]+$/, '')
  if (targetPath === root) return ancestors
  const sep = targetPath.includes('\\') ? '\\' : '/'
  if (!targetPath.startsWith(root + sep)) return ancestors
  const relative = targetPath.slice(root.length + sep.length)
  const parts = relative.split(/[/\\]/).filter(Boolean)
  let current = root
  for (let i = 0; i < parts.length - 1; i++) {
    current = current + sep + parts[i]
    ancestors.add(current)
  }
  return ancestors
}

/**
 * 过滤并批量移动文件到目标目录。
 * 自动跳过已在目标目录中的文件、以及目标目录是自身或子目录的情况。
 * @returns 实际移动的文件数量，0 表示无需操作
 */
export function filterMovablePaths(paths: string[], targetDir: string): string[] {
  const uniquePaths = Array.from(new Set(paths))
  return uniquePaths.filter((path) => {
    if (normalizeFsPath(getParentPath(path)) === normalizeFsPath(targetDir)) return false
    if (isSameOrChildPath(path, targetDir)) return false
    return true
  })
}
