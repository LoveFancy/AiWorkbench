/**
 * 将工作区文件路径写入系统剪贴板（通过 IPC 到主进程操作）
 */
export async function writePathsToSystemClipboard(paths: string[]): Promise<void> {
  if (paths.length === 0) return
  try {
    await window.electronAPI.writePathsToSystemClipboard(paths)
  } catch (err) {
    console.error('[ExportService] 写入系统剪贴板失败:', err)
  }
}

/**
 * 打开系统文件夹选择器，将文件复制到用户选择的目标目录
 */
export async function exportPathsToFolder(paths: string[]): Promise<void> {
  if (paths.length === 0) return
  const result = await window.electronAPI.openFolderDialog()
  if (!result) return

  const targetDir = result.path
  let copied = 0

  for (const sourcePath of paths) {
    try {
      await window.electronAPI.copyFile(sourcePath, targetDir)
      copied++
    } catch (err) {
      console.error(`[ExportService] 导出失败: ${sourcePath}`, err)
    }
  }

  if (copied > 0) {
    // 打开目标文件夹让用户看到结果
    window.electronAPI.showInFolder(targetDir).catch(() => {})
  }
}
