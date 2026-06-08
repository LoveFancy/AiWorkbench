/**
 * 渲染进程观测上报 IPC 桥接
 *
 * 通过 window.electronAPI.reportRendererError() 将渲染进程错误
 * 转发到主进程的 observabilityService.reportErrorEvent()。
 */

export interface RendererErrorPayload {
  name: string
  message: string
  stack?: string
  componentStack?: string
}

/**
 * 上报渲染进程错误到主进程。
 * 渲染进程上报失败不抛错，避免错误覆盖。
 */
export async function reportRendererErrorViaIpc(payload: RendererErrorPayload): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api = (window as any).electronAPI
    if (api?.reportRendererError) {
      await api.reportRendererError(payload)
    }
  } catch {
    // 渲染进程上报失败不抛错，避免错误覆盖
  }
}
