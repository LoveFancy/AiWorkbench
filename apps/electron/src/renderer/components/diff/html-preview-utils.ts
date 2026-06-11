export function isHtmlPreviewPath(filePath: string): boolean {
  const lower = filePath.trim().toLowerCase()
  return lower.endsWith('.html') || lower.endsWith('.htm')
}
