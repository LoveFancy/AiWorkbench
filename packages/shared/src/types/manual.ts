/**
 * 使用手册相关类型定义
 *
 * 客户端两种查阅方式：
 *   - GET /workmate/manual?version=N  → Markdown 纯文本（不含图片），客户端内渲染
 *   - GET /workmate/manual/html         → HTML 图文版，浏览器中打开
 */

/** 服务端 GET /workmate/manual 返回的 data 字段（Markdown 与 HTML 接口共用） */
export interface ManualApiResponse {
  /** 是否需要更新 */
  needUpdate: boolean
  /** 手册标题 */
  title?: string
  /** 手册内容（manual 接口为 Markdown 纯文本，html 接口为 HTML 图文） */
  content?: string
  /** 版本号（整数，从 1 开始递增） */
  version?: number
  /** 更新时间（ISO 8601） */
  updatedAt?: string
  /** 无需更新时的提示信息 */
  message?: string
}

/** 客户端缓存的版本信息 */
export interface ManualVersion {
  /** 版本号（0 表示内置版本） */
  version: number
  /** 手册标题 */
  title: string
  /** 缓存时间戳（内置版本为 0） */
  cachedAt: number
}

/** 渲染进程使用的手册内容 */
export interface ManualContent {
  /** 版本号（0 表示内置版本） */
  version: number
  /** 手册标题 */
  title: string
  /** Markdown 内容（纯文本，不含图片） */
  content: string
  /** 缓存时间（内置版本为 0） */
  cachedAt: number
  /** 内容来源 */
  source: 'server' | 'cache' | 'builtin'
}

/** 手册 IPC 通道常量 */
export const MANUAL_IPC_CHANNELS = {
  /** 检查更新并获取 Markdown 内容（三级降级） */
  CHECK_AND_GET: 'manual:check-and-get',
  /** 获取内置 fallback 内容 */
  GET_BUILT_IN: 'manual:get-built-in',
  /** 获取图文版并在浏览器中打开 */
  OPEN_HTML: 'manual:open-html',
} as const
