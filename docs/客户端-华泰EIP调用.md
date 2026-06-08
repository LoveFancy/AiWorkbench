# 客户端：统一 HTTP 请求工具（EIP 网关）

编辑时间：2026年6月3日

> **关联文档**：[客户端-登录.md](./客户端-登录.md)、[客户端-模型列表.md](./客户端-模型列表.md)、[客户端-升级检测.md](./客户端-升级检测.md)
>
> 本文档定义统一的 HTTP 请求层，自动注入 EIPGW-TOKEN Cookie，供模型拉取、升级检测、观测上报等模块复用。

---

## 一、设计目标

各业务模块（models、upgrade、observability）都需要向 WorkMate Server 发请求，且必须携带 `Cookie: EIPGW-TOKEN=<jwt>`。与其在每个模块中重复 Cookie 构建和错误处理逻辑，不如抽取一个轻量的统一请求工具。

### 核心原则

1. **单文件模块**：仅一个 `hteip-client.ts`，不建复杂目录
2. **REST 风格接口**：`url + method + params/body`
3. **自动注入 Cookie**：调用方无需关心 Token
4. **不抛异常**：所有错误通过返回值表达，调用方自行判断
5. **可替换**：不修改原有代码即可接入

---

## 二、接口定义

```typescript
// apps/electron/src/shared/hteip-client.ts

import { getToken } from '../auth'

// ---- 请求选项 ----

export interface HttpRequestOptions {
  /** HTTP 方法 */
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  /**
   * 查询参数（自动拼接到 URL 上）
   * 仅对 GET/DELETE 生效，POST/PUT/PATCH 会放入 body
   */
  params?: Record<string, string | number | boolean>
  /**
   * 请求体（POST/PUT/PATCH 时使用）
   * 若同时提供 params 和 body，POST/PUT 使用 body 作为请求体，
   * params 拼接到 URL
   */
  body?: unknown
  /** 额外请求头（会与 Cookie 合并） */
  headers?: Record<string, string>
  /** 超时时间（毫秒），默认 10_000 */
  timeoutMs?: number
  /** 信号（用于外部取消） */
  signal?: AbortSignal
}

export interface HttpResponse<T = unknown> {
  /** HTTP 状态码，网络错误时为 0 */
  status: number
  /** 是否成功（2xx） */
  ok: boolean
  /** 响应体（已 JSON 解析） */
  data: T | null
  /** 错误信息 */
  error?: string
}

// ---- 默认值 ----

const DEFAULT_TIMEOUT_MS = 10_000

// ---- 核心请求函数 ----

/**
 * 发起 HTTP 请求，自动注入 EIPGW-TOKEN Cookie。
 *
 * 使用示例：
 *
 *   // GET 请求
 *   const res = await httpGet<ModelListResponse>('/workmate/models', {
 *     params: { platform: 'win32' },
 *   })
 *
 *   // POST 请求
 *   const res = await httpPost('/workmate/observability/events', {
 *     body: { events: [...] },
 *   })
 *
 *   // 通用请求
 *   const res = await httpRequest<UpgradeResult>('/workmate/upgrade/check', {
 *     method: 'GET',
 *     params: { currentVersion: '1.0.0', platform: 'win32' },
 *   })
 */
export async function httpRequest<T = unknown>(
  url: string,
  options: HttpRequestOptions,
): Promise<HttpResponse<T>> {
  const { method, params, body, headers: extraHeaders, timeoutMs, signal } = options
  const timeout = timeoutMs ?? DEFAULT_TIMEOUT_MS

  // 1. 构建完整 URL（拼接查询参数）
  const fullUrl = buildUrl(url, method, params)

  // 2. 构建请求头（自动注入 Cookie）
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...buildAuthCookie(),
    ...extraHeaders,
  }

  // 3. 构建请求体
  const requestBody = (method === 'POST' || method === 'PUT' || method === 'PATCH')
    ? JSON.stringify(body ?? params)
    : undefined

  // 4. 发起请求
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    // 外部信号合并
    const combinedSignal = signal
      ? combineSignals(signal, controller.signal)
      : controller.signal

    const response = await fetch(fullUrl, {
      method,
      headers,
      body: requestBody,
      signal: combinedSignal,
    })

    clearTimeout(timeoutId)

    const data = await response.json().catch(() => null)

    return {
      status: response.status,
      ok: response.ok,
      data: data as T,
    }
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))
    if (error.name === 'AbortError') {
      return { status: 0, ok: false, data: null, error: '请求超时' }
    }
    return { status: 0, ok: false, data: null, error: error.message }
  }
}

// ---- 便捷方法 ----

export function httpGet<T = unknown>(
  url: string,
  options?: Omit<HttpRequestOptions, 'method'>,
): Promise<HttpResponse<T>> {
  return httpRequest<T>(url, { ...options, method: 'GET' })
}

export function httpPost<T = unknown>(
  url: string,
  options?: Omit<HttpRequestOptions, 'method'>,
): Promise<HttpResponse<T>> {
  return httpRequest<T>(url, { ...options, method: 'POST' })
}

export function httpPut<T = unknown>(
  url: string,
  options?: Omit<HttpRequestOptions, 'method'>,
): Promise<HttpResponse<T>> {
  return httpRequest<T>(url, { ...options, method: 'PUT' })
}

export function httpDelete<T = unknown>(
  url: string,
  options?: Omit<HttpRequestOptions, 'method'>,
): Promise<HttpResponse<T>> {
  return httpRequest<T>(url, { ...options, method: 'DELETE' })
}

// ---- 内部工具 ----

/** 构建完整 URL，GET/DELETE 时将 params 拼为 query string */
function buildUrl(
  url: string,
  method: string,
  params?: Record<string, string | number | boolean>,
): string {
  if (!params) return url

  const isReadMethod = method === 'GET' || method === 'DELETE'
  if (!isReadMethod) return url // POST/PUT/PATCH 的 params 放入 body

  const searchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    searchParams.set(key, String(value))
  }
  const qs = searchParams.toString()
  if (!qs) return url

  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}${qs}`
}

/** 自动从 auth 模块读取 Token 构建 Cookie 请求头 */
function buildAuthCookie(): Record<string, string> {
  const token = getToken()
  if (token) {
    return { 'Cookie': `EIPGW-TOKEN=${token}` }
  }
  return {}
}

/** 合并两个 AbortSignal（任一 abort 则合并后也 abort） */
function combineSignals(s1: AbortSignal, s2: AbortSignal): AbortSignal {
  const controller = new AbortController()
  const onAbort = () => controller.abort()
  s1.addEventListener('abort', onAbort)
  s2.addEventListener('abort', onAbort)
  // 如果已经 abort，立即触发
  if (s1.aborted || s2.aborted) controller.abort()
  return controller.signal
}
```

---

## 三、使用示例

### 3.1 模型拉取（models 模块中使用）

```typescript
// apps/electron/src/models/model-service.ts

import { httpGet } from '../shared/hteip-client'
import type { ModelListResponse } from './types'

export async function fetchUserModels(forceRefresh = false): Promise<ModelListResponse> {
  const { ok, data } = await httpGet<{ code: number; data: ModelListResponse }>(
    `${_serverUrl}/workmate/models`,
  )

  if (!ok || !data || data.code !== 0) {
    return { apiKey: '', models: [], total: 0 }
  }

  return data.data
}
```

### 3.2 升级检测（upgrade 模块中使用）

```typescript
// apps/electron/src/upgrade/upgrade-service.ts

import { httpGet } from '../shared/hteip-client'
import { app } from 'electron'

export async function checkForUpgrade(): Promise<UpgradeCheckResult> {
  const { ok, data } = await httpGet<{ code: number; data: UpgradeCheckResult }>(
    `${_serverUrl}/workmate/upgrade/check`,
    {
      params: {
        currentVersion: app.getVersion(),
        platform: process.platform,
      },
    },
  )

  if (!ok || !data || data.code !== 0) {
    return emptyResult()
  }

  return data.data
}
```

### 3.3 观测上报（observability 模块中使用）

```typescript
// observability 模块中

import { httpPost } from '../shared/hteip-client'

export async function flushEvents(events: ReportEvent[]): Promise<void> {
  const { ok } = await httpPost(`${_serverUrl}/workmate/observability/events`, {
    body: { events },
  })

  if (!ok) {
    // 回写队列，下次重试
    eventQueue.unshift(...events)
  }
}
```

### 3.4 不带 Token 也可用

```typescript
// 未登录时 getToken() 返回 null，Cookie 为空，请求仍能发出
// 服务端根据 X-EIPGW-USERID 判空返回 401
const { status } = await httpGet(`${_serverUrl}/workmate/models`)
if (status === 401) {
  // 需要登录
}
```

---

## 四、目录结构

```
apps/electron/src/shared/
└── hteip-client.ts         # 统一 HTTP 请求工具（单文件）
```

---

## 五、文件变更清单

### 新增文件

```
apps/electron/src/shared/
└── hteip-client.ts         # 单文件，无额外目录
```

### 修改原有文件

| 文件 | 修改内容 | 修改量 |
|------|---------|--------|
| 无 | 各模块（models/upgrade/observability）**按需替换**原有 `fetch()` 调用为 `httpGet`/`httpPost` | 可选，渐进迁移 |

`hteip-client.ts` 是被动工具，**不强制其他模块必须使用**。各模块可以逐步从手写 `fetch` + 手动拼 Cookie 迁移到 `httpGet`/`httpPost`，也可以继续保持原有方式。

### 对登录文档的关联

[客户端-登录.md](./客户端-登录.md) 中 auth-service.ts 的 `buildAuthHeaders()` 仍保留，作为底层 API 供需要自定义请求头的场景使用。`hteip-client.ts` 是上层封装，内部调用 `getToken()` 实现 Cookie 注入。

---

*如有任何疑问，请联系信息技术部运营管理室AI研发效能管理团队*
