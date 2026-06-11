import * as React from 'react'
import { useAtomValue } from 'jotai'
import type { PreviewFile } from '@/atoms/preview-atoms'
import { previewRefreshVersionAtom } from '@/atoms/preview-atoms'
import { HtmlPreviewFrame } from './HtmlPreviewFrame'
import { DiffTabContent } from './DiffTabContent'
import { getPreviewFileAccess } from './preview-open-path'

interface PreviewContentRouterProps {
  previewFile: PreviewFile
  dirPath: string
  sessionId: string
  sessionPath: string
  onEmptyDiff?: () => void
  toolbarActions?: React.ReactNode
}

export function PreviewContentRouter({
  previewFile,
  dirPath,
  sessionId,
  sessionPath,
  onEmptyDiff,
  toolbarActions,
}: PreviewContentRouterProps): React.ReactElement {
  const refreshVersionMap = useAtomValue(previewRefreshVersionAtom)
  const refreshVersion = refreshVersionMap.get(sessionId) ?? 0

  if (previewFile.previewKind === 'html') {
    return (
      <HtmlPreviewFrame
        filePath={previewFile.filePath}
        fileAccess={getPreviewFileAccess(sessionId, previewFile, sessionPath)}
        refreshVersion={refreshVersion}
      />
    )
  }

  return (
    <DiffTabContent
      key={`${sessionId}:${previewFile.filePath}`}
      filePath={previewFile.filePath}
      dirPath={dirPath}
      sessionId={sessionId}
      gitRoot={previewFile.gitRoot}
      previewOnly={previewFile.previewOnly}
      readOnly={previewFile.readOnly}
      basePaths={previewFile.basePaths}
      baseRef={previewFile.baseRef}
      onEmptyDiff={onEmptyDiff}
      toolbarActions={toolbarActions}
    />
  )
}
