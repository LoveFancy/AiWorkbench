import type { AgentPluginMarketplaceType } from '@proma/shared'

export interface InferredMarketplaceInput {
  id: string
  name: string
  source: string
  type: AgentPluginMarketplaceType
  branch?: string
}

export function supportsMarketplaceBranch(type: AgentPluginMarketplaceType): boolean {
  return type === 'github' || type === 'gitee' || type === 'gitlab'
}

function slugFromMarketplaceSource(source: string): string {
  const trimmed = source.trim().replace(/\/$/, '')
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed)
      const last = url.pathname.split('/').filter(Boolean).at(-1) ?? 'marketplace'
      return last.replace(/\.git$/, '').replace(/\.json$/, '') || 'marketplace'
    } catch {
      // 继续走通用路径解析
    }
  }
  const gitSshMatch = trimmed.match(/[:/]([^/:]+\/[^/]+?)(?:\.git)?$/)
  if (gitSshMatch?.[1]) return gitSshMatch[1].split('/').at(-1)?.replace(/\.git$/, '') ?? 'marketplace'
  const last = trimmed.split(/[\\/]/).filter(Boolean).at(-1) ?? 'marketplace'
  return last.replace(/\.git$/, '').replace(/\.json$/, '') || 'marketplace'
}

function inferMarketplaceBranchFromSource(source: string, type: AgentPluginMarketplaceType): string | undefined {
  if (!supportsMarketplaceBranch(type)) return undefined
  if (!/^https?:\/\//i.test(source)) return undefined

  try {
    const url = new URL(source)
    const segments = url.pathname.split('/').filter(Boolean)
    const treeIndex = type === 'gitlab'
      ? segments.findIndex((segment, index) => segment === 'tree' && segments[index - 1] === '-')
      : segments.indexOf('tree')
    const branch = treeIndex >= 0 ? segments[treeIndex + 1] : undefined
    return branch ? decodeURIComponent(branch) : undefined
  } catch {
    return undefined
  }
}

export function inferMarketplaceInput(sourceText: string): InferredMarketplaceInput {
  const rawSource = sourceText.trim()
  if (!rawSource) throw new Error('请输入插件市场地址或本地路径')

  let type: AgentPluginMarketplaceType = 'local'
  let source = rawSource
  if (/^git@github\.com:/i.test(source) || /^https?:\/\/github\.com\//i.test(source)) {
    type = 'github'
  } else if (/^git@gitee\.com:/i.test(source) || /^https?:\/\/gitee\.com\//i.test(source)) {
    type = 'gitee'
  } else if (/^git@[^:]*gitlab[^:]*:/i.test(source) || /^https?:\/\/[^/]*gitlab[^/]*\//i.test(source)) {
    type = 'gitlab'
  } else if (/^https?:\/\//i.test(source)) {
    type = 'raw'
  } else if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(source)) {
    type = 'github'
    source = `https://github.com/${source}`
  }

  const rawId = slugFromMarketplaceSource(source)
  const id = rawId.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'marketplace'
  const branch = inferMarketplaceBranchFromSource(source, type)
  return {
    id,
    name: id,
    source,
    type,
    ...(branch && { branch }),
  }
}
