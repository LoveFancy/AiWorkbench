/**
 * 问题上报 Service
 *
 * 构建 multipart FormData，通过 httpUpload 提交到服务端
 * POST /workmate/api/issues
 */

import { app } from 'electron'
import { getUserProfile } from '../user-profile-service'
import { httpUpload, resolveApiBase } from '../../../shared/hteip-client'
import type { HttpResponse } from '../../../shared/hteip-client'

const UPLOAD_PATH = '/workmate/api/issues'

export interface IssueSubmitInput {
  description: string
  files: Array<{
    name: string       // 原始文件名
    data: Buffer       // 文件内容
    mimeType: string   // 如 image/png
  }>
}

interface UploadApiResponse {
  code: number
  message: string
  data?: {
    id: number
    status: string
    imageCount: number
    createdAt: string
  }
}

export interface IssueSubmitSuccess {
  success: true
  id: number
  imageCount: number
}

export interface IssueSubmitError {
  success: false
  error: string
}

export type IssueSubmitResult = IssueSubmitSuccess | IssueSubmitError

export const ISSUE_SUBMIT_IPC_CHANNEL = 'issue:submit'

function resolveJobId(): string {
  const profile = getUserProfile()
  return profile.userName?.trim() || 'unknown'
}

export async function submitIssue(input: IssueSubmitInput): Promise<IssueSubmitResult> {
  const platformMap: Record<string, string> = {
    win32: 'windows', darwin: 'mac', linux: 'linux'
  }

  const formData = new FormData()
  formData.append('description', input.description)
  formData.append('clientVersion', app.getVersion())
  formData.append('clientPlatform', platformMap[process.platform] ?? process.platform)

  // 按顺序追加图片
  for (const file of input.files) {
    formData.append(
      'files',
      new Blob([new Uint8Array(file.data)], { type: file.mimeType }),
      file.name
    )
  }

  console.log('[问题上报] POST %s%s (描述: %d 字, 图片: %d 张)',
    resolveApiBase(), UPLOAD_PATH,
    input.description.length,
    input.files.length
  )

  const res: HttpResponse<UploadApiResponse> = await httpUpload<UploadApiResponse>(
    UPLOAD_PATH,
    { formData },
  )

  if (res.ok && res.data?.code === 0 && res.data.data) {
    console.log('[问题上报] 提交成功: id=%d', res.data.data.id)
    return {
      success: true,
      id: res.data.data.id,
      imageCount: res.data.data.imageCount,
    }
  }

  const errorMsg = res.error || res.data?.message || `提交失败 (HTTP ${res.status})`
  console.error('[问题上报] 提交失败:', errorMsg)
  return { success: false, error: errorMsg }
}
