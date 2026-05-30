export interface ManagedPathRoots {
  sessionPath?: string | null
  workspaceFilesPath?: string | null
  basePaths?: string[] | null
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '')
}

function toRelativePath(rootPath: string, filePath: string): string | null {
  const root = normalizePath(rootPath)
  const target = normalizePath(filePath)

  if (target === root) return ''
  if (!target.startsWith(`${root}/`)) return null

  return target.slice(root.length + 1)
}

export function formatManagedPath(filePath: string, roots: ManagedPathRoots): string {
  if (roots.sessionPath) {
    const relative = toRelativePath(roots.sessionPath, filePath)
    if (relative !== null) return relative ? `session/${relative}` : 'session/'
  }

  if (roots.workspaceFilesPath) {
    const relative = toRelativePath(roots.workspaceFilesPath, filePath)
    if (relative !== null) return relative ? `work/${relative}` : 'work/'
  }

  for (const basePath of roots.basePaths ?? []) {
    const normalizedBasePath = normalizePath(basePath)
    const isWorkspaceRoot = normalizedBasePath.endsWith('/workspace-files')
    const relative = toRelativePath(basePath, filePath)
    if (relative === null) continue

    return relative
      ? `${isWorkspaceRoot ? 'work' : 'session'}/${relative}`
      : `${isWorkspaceRoot ? 'work' : 'session'}/`
  }

  return filePath
}
