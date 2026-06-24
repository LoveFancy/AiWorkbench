import type { PasteProgressEntry } from './paste-progress-atom'

const MAX_CONCURRENCY = 5

/**
 * 并发粘贴队列，fire-and-forget
 * @param paths 源文件路径列表
 * @param targetDir 目标目录
 * @param mode 操作模式
 * @param onProgress 单文件进度回调
 * @param onComplete 全部完成回调
 */
export async function pastePathsToTarget(
  paths: string[],
  targetDir: string,
  mode: 'copy' | 'cut',
  onProgress: (entry: PasteProgressEntry) => void,
  onComplete: () => void,
): Promise<void> {
  const uniquePaths = Array.from(new Set(paths))
  if (uniquePaths.length === 0) {
    onComplete()
    return
  }

  // 标记所有路径为 pending
  for (const p of uniquePaths) {
    onProgress({ targetPath: p, status: 'pending' })
  }

  // 并发控制：信号量
  let running = 0
  const queue = [...uniquePaths]

  const processNext = async (): Promise<void> => {
    if (queue.length === 0) return
    const sourcePath = queue.shift()!
    running++

    try {
      if (mode === 'copy') {
        const destPath = await window.electronAPI.copyFile(sourcePath, targetDir)
        onProgress({ targetPath: sourcePath, status: 'done' })
      } else {
        await window.electronAPI.moveFile(sourcePath, targetDir)
        onProgress({ targetPath: sourcePath, status: 'done' })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '操作失败'
      console.error(`[ClipboardService] ${mode} 失败: ${sourcePath}`, err)
      onProgress({ targetPath: sourcePath, status: 'error', errorMessage: msg })
    } finally {
      running--
      await processNext()
    }
  }

  // 启动初始并发
  const workers = Array.from(
    { length: Math.min(MAX_CONCURRENCY, queue.length) },
    () => processNext(),
  )
  await Promise.all(workers)

  onComplete()
}
