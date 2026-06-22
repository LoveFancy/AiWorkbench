function parseVersionPart(part: string): number {
  const parsed = Number.parseInt(part, 10)
  return Number.isFinite(parsed) ? parsed : 0
}

export function comparePluginVersion(a: string, b: string): number {
  const left = a.replace(/^v/i, '').split(/[.-]/).map(parseVersionPart)
  const right = b.replace(/^v/i, '').split(/[.-]/).map(parseVersionPart)
  const length = Math.max(left.length, right.length)

  for (let index = 0; index < length; index += 1) {
    const leftPart = left[index] ?? 0
    const rightPart = right[index] ?? 0
    if (leftPart !== rightPart) return leftPart - rightPart
  }

  return 0
}

export function isPluginUpdateAvailable(marketplaceVersion?: string, installedVersion?: string): boolean {
  if (!marketplaceVersion?.trim() || !installedVersion?.trim()) return false
  return comparePluginVersion(marketplaceVersion.trim(), installedVersion.trim()) > 0
}
