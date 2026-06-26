import { describe, expect, test } from 'bun:test'
import type { RemoteDownloadProgress } from '@proma/shared'
import { describeDownloadStatus } from './download-status.ts'

function progress(partial: Partial<RemoteDownloadProgress>): RemoteDownloadProgress {
  return { groupId: 'g', status: 'downloading', progress: 0, downloadedBytes: 0, totalBytes: 0, ...partial }
}

describe('describeDownloadStatus', () => {
  test('downloading：蓝点 + 百分比 + 进度条 + 取消', () => {
    const v = describeDownloadStatus(progress({ status: 'downloading', progress: 63 }))
    expect(v.tone).toBe('downloading')
    expect(v.label).toBe('正在下载')
    expect(v.percentText).toBe('63%')
    expect(v.showBar).toBe(true)
    expect(v.barPercent).toBe(63)
    expect(v.action).toBe('cancel')
  })

  test('installing/extracting：展示已解压文件数 + 真实百分比', () => {
    const v = describeDownloadStatus(progress({ status: 'installing', installStage: 'extracting', progress: 40, processedFiles: 6000, totalFiles: 15000 }))
    expect(v.tone).toBe('installing')
    expect(v.label).toBe('正在解压 6000/15000')
    expect(v.percentText).toBe('40%')
    expect(v.barPercent).toBe(40)
    expect(v.action).toBe('cancel')
  })

  test('installing/finalizing：校验文案 + 进度条停在 95', () => {
    const v = describeDownloadStatus(progress({ status: 'installing', installStage: 'finalizing', progress: 95 }))
    expect(v.label).toBe('正在校验并写入…')
    expect(v.percentText).toBeNull()
    expect(v.showBar).toBe(true)
    expect(v.barPercent).toBe(95)
  })

  test('error：红点 + 重试动作', () => {
    const v = describeDownloadStatus(progress({ status: 'error', error: 'x' }))
    expect(v.tone).toBe('error')
    expect(v.label).toBe('下载失败')
    expect(v.showBar).toBe(false)
    expect(v.action).toBe('retry')
  })

  test('cancelled：灰点 + 下载动作', () => {
    const v = describeDownloadStatus(progress({ status: 'cancelled' }))
    expect(v.tone).toBe('cancelled')
    expect(v.label).toBe('已取消')
    expect(v.action).toBe('download')
  })

  test('done：完成态无动作', () => {
    const v = describeDownloadStatus(progress({ status: 'done', progress: 100 }))
    expect(v.label).toBe('已完成')
    expect(v.showBar).toBe(false)
    expect(v.action).toBe('none')
  })
})
