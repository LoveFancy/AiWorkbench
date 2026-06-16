# 专家团服务端化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将专家团列表从本地扫描改为服务端拉取，支持按需下载+召唤，精选场景从后端获取。

**Architecture:** 服务端 4 个 REST API → 主进程 HTTP 封装 → IPC 桥接 → 渲染进程 atoms 合并 → UI 适配。本地已安装的专家团（builtin/user）与服务端列表（remote）按 id 合并。

**Tech Stack:** TypeScript, Electron IPC, Node.js http/https, Jotai atoms, React

---

### Task 1: 类型定义 — 新增服务端接口类型 + IPC 通道常量

**Files:**
- Modify: `packages/shared/src/types/agent.ts:861-965`

- [ ] **Step 1: 扩展 `AgentPluginKind`**

```typescript
// packages/shared/src/types/agent.ts:861

export type AgentPluginKind = 'builtin' | 'user' | 'remote'
```

- [ ] **Step 2: 扩展 `AgentExpertGroupStatus`**

```typescript
// packages/shared/src/types/agent.ts:895

export type AgentExpertGroupStatus =
  | 'available'
  | 'plugin_disabled'
  | 'plugin_uninstalled'
  | 'invalid_manifest'
  | 'missing_subagent'
  | 'missing_skill'
  | 'mcp_conflict'
  | 'remote_not_downloaded'
  | 'remote_downloading'
  | 'remote_download_failed'
  | 'remote_update_available'
```

- [ ] **Step 3: 新增 `ServerExpertGroupSummary` 和响应类型**

在 `AgentExpertGroupInfo` 之后（约 line 950），新增：

```typescript
/** 服务端专家团列表项 —— 前端筛选/展示用的摘要信息 */
export interface ServerExpertGroupSummary {
  id: string
  name: string
  description: string
  introduction: string
  mainRoleName: string
  expertType: 'agent' | 'team'
  subagentCount: number
  subagentLabels: Record<string, string>
  tags: string[]
  samplePrompts: string[]
  builtinTools: string[]
  skills: string[]
  mcpServers: string[]
  version: string
  downloadUrl: string
  downloadSize: number
  sortWeight: number
  publishedAt: string
  updatedAt: string
}

export interface ServerExpertGroupListResponse {
  items: ServerExpertGroupSummary[]
  total: number
}
```

- [ ] **Step 4: 新增 `FeaturedScene` 和响应类型**

```typescript
export interface FeaturedScene {
  id: string
  name: string
  expertGroupIds: string[]
  iconUrl?: string
  sortOrder: number
}

export interface FeaturedScenesResponse {
  scenes: FeaturedScene[]
}
```

- [ ] **Step 5: 新增 `EXPERT_IPC_CHANNELS` 常量**

在 `AGENT_IPC_CHANNELS` 之前或 `CONFIGURE_PLUGIN_MCP_ENV` / `TEST_PLUGIN_MCP` 之后（约 line 1710），新增：

```typescript
/** 专家团服务端化 IPC 通道常量 */
export const EXPERT_IPC_CHANNELS = {
  FETCH_SERVER_EXPERT_GROUPS: 'expert:fetch-server-list',
  FETCH_FEATURED_SCENES: 'expert:fetch-featured-scenes',
  DOWNLOAD_REMOTE_EXPERT: 'expert:download-remote',
  DOWNLOAD_PROGRESS: 'expert:download-progress',
  CANCEL_DOWNLOAD: 'expert:cancel-download',
} as const
```

- [ ] **Step 6: 确保 shared 包类型检查通过**

Run: `cd packages/shared && npx tsc --noEmit`

---

### Task 2: 主进程 — expert-remote-service.ts

**Files:**
- Create: `apps/electron/src/main/lib/expert-remote-service.ts`

- [ ] **Step 1: 创建文件，提供 HTTP 请求 + 缓存逻辑**

```typescript
/**
 * 专家团远程服务
 *
 * 封装对服务端 /api/expert-groups 的 HTTP 请求，包括：
 * - 拉取专家团列表
 * - 拉取精选场景
 * - 磁盘缓存（读写 ~/.workmate/expert-groups-cache.json / featured-scenes-cache.json）
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { ServerExpertGroupSummary, FeaturedScene } from '@proma/shared'
import { getConfigDir } from './config-paths'

const CACHE_TTL_MS = 30 * 60 * 1000        // 专家团列表 30 分钟
const SCENES_CACHE_TTL_MS = 60 * 60 * 1000   // 精选场景 1 小时
const REQUEST_TIMEOUT_MS = 10_000

let _baseUrl: string | undefined

/** 获取服务端 Base URL，环境变量优先，其次 settings.json */
export function getExpertRemoteBaseUrl(): string {
  if (_baseUrl) return _baseUrl
  _baseUrl = process.env.PROMA_EXPERT_API_BASE_URL ?? 'http://localhost:3000'
  return _baseUrl
}

/** 仅用于测试，覆盖 Base URL */
export function setExpertRemoteBaseUrlForTest(url: string): void {
  _baseUrl = url
}

export function getExpertGroupsCachePath(): string {
  return join(getConfigDir(), 'expert-groups-cache.json')
}

export function getFeaturedScenesCachePath(): string {
  return join(getConfigDir(), 'featured-scenes-cache.json')
}

interface CacheEntry<T> {
  data: T
  cachedAt: number
}

function readCache<T>(cachePath: string): CacheEntry<T> | null {
  try {
    if (!existsSync(cachePath)) return null
    const raw = readFileSync(cachePath, 'utf-8')
    return JSON.parse(raw) as CacheEntry<T>
  } catch {
    return null
  }
}

function writeCache<T>(cachePath: string, data: T): void {
  try {
    const configDir = getConfigDir()
    if (!existsSync(configDir)) mkdirSync(configDir, { recursive: true })
    writeFileSync(cachePath, JSON.stringify({ data, cachedAt: Date.now() }), 'utf-8')
  } catch (err) {
    console.warn('[expert-remote] 写入缓存失败:', err)
  }
}

function httpGet<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? require('node:https') : require('node:http')
    const req = protocol.get(
      url,
      { timeout: REQUEST_TIMEOUT_MS },
      (res: import('node:http').IncomingMessage) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`))
          return
        }
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8')) as T)
          } catch (err) {
            reject(err)
          }
        })
      },
    )
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('请求超时')) })
  })
}

export async function fetchServerExpertGroups(): Promise<ServerExpertGroupSummary[]> {
  const cachePath = getExpertGroupsCachePath()
  const cache = readCache<ServerExpertGroupSummary[]>(cachePath)

  try {
    const url = `${getExpertRemoteBaseUrl()}/api/expert-groups`
    const resp = await httpGet<{ items: ServerExpertGroupSummary[]; total: number }>(url)
    writeCache(cachePath, resp.items)
    return resp.items
  } catch (err) {
    console.warn('[expert-remote] 获取专家团列表失败:', err)
    if (cache) return cache.data
    throw err
  }
}

export async function fetchFeaturedScenes(): Promise<FeaturedScene[]> {
  const cachePath = getFeaturedScenesCachePath()
  const cache = readCache<FeaturedScene[]>(cachePath)

  try {
    const url = `${getExpertRemoteBaseUrl()}/api/expert-groups/featured-scenes`
    const resp = await httpGet<{ scenes: FeaturedScene[] }>(url)
    writeCache(cachePath, resp.scenes)
    return resp.scenes
  } catch (err) {
    console.warn('[expert-remote] 获取精选场景失败:', err)
    if (cache) return cache.data
    throw err
  }
}

export function isServerExpertGroupsCacheExpired(): boolean {
  const cache = readCache<unknown>(getExpertGroupsCachePath())
  if (!cache) return true
  return Date.now() - cache.cachedAt > CACHE_TTL_MS
}

export function isFeaturedScenesCacheExpired(): boolean {
  const cache = readCache<unknown>(getFeaturedScenesCachePath())
  if (!cache) return true
  return Date.now() - cache.cachedAt > SCENES_CACHE_TTL_MS
}
```

---

### Task 3: 主进程 — expert-download-service.ts + config-paths 缓存路径

**Files:**
- Create: `apps/electron/src/main/lib/expert-download-service.ts`
- Modify: `apps/electron/src/main/lib/config-paths.ts`

- [ ] **Step 1: 创建 expert-download-service.ts**

```typescript
/**
 * 专家团下载服务
 *
 * 管理从服务端下载专家团插件包：流式下载 + installUserPluginZip + 进度广播。
 */

import { join } from 'node:path'
import { createWriteStream, existsSync, mkdirSync, unlinkSync } from 'node:fs'
import { app, BrowserWindow } from 'electron'
import type { AgentPluginInfo } from '@proma/shared'
import { EXPERT_IPC_CHANNELS } from '@proma/shared'
import { installUserPluginZip } from './plugin-registry-service'
import { getExpertRemoteBaseUrl } from './expert-remote-service'

export interface RemoteDownloadProgress {
  groupId: string
  status: 'downloading' | 'installing' | 'done' | 'error'
  progress: number       // 0–100
  downloadedBytes: number
  totalBytes: number
  error?: string
}

function broadcastProgress(progress: RemoteDownloadProgress): void {
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send(EXPERT_IPC_CHANNELS.DOWNLOAD_PROGRESS, progress)
  })
}

function downloadFile(url: string, destPath: string, onProgress: (downloaded: number, total: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? require('node:https') : require('node:http')
    const req = protocol.get(url, { timeout: 120_000 }, (res: import('node:http').IncomingMessage) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`))
        return
      }
      const total = parseInt(res.headers['content-length'] ?? '0', 10)
      let downloaded = 0

      const destDir = join(destPath, '..')
      if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true })
      const ws = createWriteStream(destPath)

      res.on('data', (chunk: Buffer) => {
        downloaded += chunk.length
        onProgress(downloaded, total)
      })
      res.pipe(ws)
      ws.on('finish', () => resolve())
      ws.on('error', reject)
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('下载超时')) })
  })
}

export async function downloadAndInstallRemoteExpert(
  groupId: string,
  downloadUrl: string,
): Promise<AgentPluginInfo> {
  const baseUrl = getExpertRemoteBaseUrl()
  const fullUrl = downloadUrl.startsWith('http') ? downloadUrl : `${baseUrl}${downloadUrl}`
  const tempZip = join(app.getPath('temp'), `proma-expert-${groupId}-${Date.now()}.zip`)

  // 1. 广播下载开始
  broadcastProgress({ groupId, status: 'downloading', progress: 0, downloadedBytes: 0, totalBytes: 0 })

  try {
    // 2. 流式下载
    await downloadFile(fullUrl, tempZip, (downloaded, total) => {
      const progress = total > 0 ? Math.round((downloaded / total) * 100) : 0
      broadcastProgress({ groupId, status: 'downloading', progress, downloadedBytes: downloaded, totalBytes: total })
    })

    // 3. 广播安装中
    broadcastProgress({ groupId, status: 'installing', progress: 100, downloadedBytes: 0, totalBytes: 0 })

    // 4. 安装插件
    const plugin = installUserPluginZip(tempZip, { marketplaceId: 'remote' })

    // 5. 清理临时文件
    try { unlinkSync(tempZip) } catch { /* ignore */ }

    // 6. 广播完成
    broadcastProgress({ groupId, status: 'done', progress: 100, downloadedBytes: 0, totalBytes: 0 })

    return plugin
  } catch (error) {
    try { unlinkSync(tempZip) } catch { /* ignore */ }
    const message = error instanceof Error ? error.message : String(error)
    broadcastProgress({ groupId, status: 'error', progress: 0, downloadedBytes: 0, totalBytes: 0, error: message })
    throw error
  }
}
```

- [ ] **Step 2: 修改 config-paths.ts**

在文件末尾附近、已有插件市场缓存路径之后添加：

```typescript
/**
 * 获取专家团服务端列表缓存路径
 *
 * @returns ~/.workmate/expert-groups-cache.json
 */
export function getExpertGroupsCachePath(): string {
  return join(getConfigDir(), 'expert-groups-cache.json')
}

/**
 * 获取精选场景缓存路径
 *
 * @returns ~/.workmate/featured-scenes-cache.json
 */
export function getFeaturedScenesCachePath(): string {
  return join(getConfigDir(), 'featured-scenes-cache.json')
}
```

---

### Task 4: IPC handler 注册

**Files:**
- Modify: `apps/electron/src/main/ipc.ts`

- [ ] **Step 1: 在文件顶部 import 区域添加**

```typescript
import { EXPERT_IPC_CHANNELS } from '@proma/shared'
```

- [ ] **Step 2: 在现有 expert group IPC 注册之后（约 line 2422 TEST_PLUGIN_MCP handler 之后），新增 4 个 handler**

```typescript
  // ===== 专家团服务端化 =====

  ipcMain.handle(
    EXPERT_IPC_CHANNELS.FETCH_SERVER_EXPERT_GROUPS,
    async (): Promise<ServerExpertGroupSummary[]> => {
      const { fetchServerExpertGroups } = await import('./lib/expert-remote-service')
      return fetchServerExpertGroups()
    }
  )

  ipcMain.handle(
    EXPERT_IPC_CHANNELS.FETCH_FEATURED_SCENES,
    async (): Promise<FeaturedScene[]> => {
      const { fetchFeaturedScenes } = await import('./lib/expert-remote-service')
      return fetchFeaturedScenes()
    }
  )

  ipcMain.handle(
    EXPERT_IPC_CHANNELS.DOWNLOAD_REMOTE_EXPERT,
    async (_, groupId: string, downloadUrl: string): Promise<AgentPluginInfo> => {
      const { downloadAndInstallRemoteExpert } = await import('./lib/expert-download-service')
      return downloadAndInstallRemoteExpert(groupId, downloadUrl)
    }
  )

  ipcMain.handle(
    EXPERT_IPC_CHANNELS.CANCEL_DOWNLOAD,
    async (_, groupId: string): Promise<void> => {
      // 初版不实现断点续传/取消，预留通道；下载中的文件由超时或进程退出自动清理
      console.log('[IPC] 取消下载请求（初版未实现）:', groupId)
    }
  )
```

- [ ] **Step 3: 确保 `ServerExpertGroupSummary` 和 `FeaturedScene` 也在 import 中**

在 ipc.ts 顶部已有 `type { ... } from '@proma/shared'` 的 import，补入新类型。

---

### Task 5: Preload 桥接

**Files:**
- Modify: `apps/electron/src/preload/index.ts`

- [ ] **Step 1: 在接口声明中添加 6 个新方法签名**

在 `listAgentExpertGroups` 之后，约 line 593，新增：

```typescript
  /** 获取服务端专家团列表 */
  fetchServerExpertGroups: () => Promise<ServerExpertGroupSummary[]>
  /** 获取精选场景分类 */
  fetchFeaturedScenes: () => Promise<FeaturedScene[]>
  /** 下载并安装远程专家团 */
  downloadRemoteExpert: (groupId: string, downloadUrl: string) => Promise<AgentPluginInfo>
  /** 取消远程专家团下载 */
  cancelRemoteDownload: (groupId: string) => Promise<void>
  /** 订阅下载进度事件（返回清理函数） */
  onExpertDownloadProgress: (callback: (progress: RemoteDownloadProgress) => void) => () => void
```

- [ ] **Step 2: 在实现区域添加方法实现**

在 `listAgentExpertGroups` 实现之后，约 line 1786，新增：

```typescript
  fetchServerExpertGroups: () => {
    return ipcRenderer.invoke(EXPERT_IPC_CHANNELS.FETCH_SERVER_EXPERT_GROUPS)
  },

  fetchFeaturedScenes: () => {
    return ipcRenderer.invoke(EXPERT_IPC_CHANNELS.FETCH_FEATURED_SCENES)
  },

  downloadRemoteExpert: (groupId: string, downloadUrl: string) => {
    return ipcRenderer.invoke(EXPERT_IPC_CHANNELS.DOWNLOAD_REMOTE_EXPERT, groupId, downloadUrl)
  },

  cancelRemoteDownload: (groupId: string) => {
    return ipcRenderer.invoke(EXPERT_IPC_CHANNELS.CANCEL_DOWNLOAD, groupId)
  },

  onExpertDownloadProgress: (callback: (progress: RemoteDownloadProgress) => void) => {
    const listener = (_: IpcRendererEvent, progress: RemoteDownloadProgress) => callback(progress)
    ipcRenderer.on(EXPERT_IPC_CHANNELS.DOWNLOAD_PROGRESS, listener)
    return () => { ipcRenderer.removeListener(EXPERT_IPC_CHANNELS.DOWNLOAD_PROGRESS, listener) }
  },
```

- [ ] **Step 3: 在 preload 顶部 import 中补入缺失类型**

```typescript
import { 
  // ... existing ...
  EXPERT_IPC_CHANNELS,
  type ServerExpertGroupSummary,
  type FeaturedScene,
} from '@proma/shared'
```

---

### Task 6: 前端 atoms — 合并逻辑 + 精选场景 atom

**Files:**
- Modify: `apps/electron/src/renderer/atoms/agent-atoms.ts`

- [ ] **Step 1: 新增 `featuredScenesAtom` + `serverExpertGroupsAtom` + 加载 atom**

在 `agentExpertGroupsAtom` 之后（约 line 205），新增：

```typescript
import type { FeatureScene, ServerExpertGroupSummary } from '@proma/shared'

/** 服务端专家团列表摘要 */
export const serverExpertGroupsAtom = atom<ServerExpertGroupSummary[]>([])

/** 精选场景分类 */
export const featuredScenesAtom = atom<FeatureScene[]>([])

/** 拉取服务端专家团列表 */
export const fetchServerExpertGroupsAtom = atom(null, async (get, set) => {
  try {
    const items = await window.electronAPI.fetchServerExpertGroups()
    set(serverExpertGroupsAtom, items)
  } catch (err) {
    console.warn('[expert] 获取服务端专家团列表失败，使用缓存降级:', err)
    // 保持原有值不变（如有缓存）
  }
})

/** 拉取精选场景 */
export const fetchFeaturedScenesAtom = atom(null, async (get, set) => {
  try {
    const scenes = await window.electronAPI.fetchFeaturedScenes()
    set(featuredScenesAtom, scenes)
  } catch (err) {
    console.warn('[expert] 获取精选场景失败:', err)
  }
})

/** 同时拉取专家团列表和精选场景 */
export const loadRemoteExpertDataAtom = atom(null, async (get, set) => {
  await Promise.all([
    set(fetchServerExpertGroupsAtom),
    set(fetchFeaturedScenesAtom),
  ])
})
```

- [ ] **Step 2: 修改 `agentExpertGroupsAtom` 为合并后的全量列表**

将现有的 `agentExpertGroupsAtom`（local）改为 computed atom：

```typescript
// 将原来的 agentExpertGroupsAtom 重命名为 agentLocalExpertGroupsAtom
export const agentLocalExpertGroupsAtom = atom<AgentExpertGroupInfo[]>([])

/** 合并后的全量专家团列表 */
export const agentExpertGroupsAtom = atom<AgentExpertGroupInfo[]>(
  (get) => {
    const local = get(agentLocalExpertGroupsAtom)
    const server = get(serverExpertGroupsAtom)
    return mergeExpertGroups(local, server)
  }
)
```

- [ ] **Step 3: 新增 `mergeExpertGroups` 工具函数**

在文件底部或单独函数区：

```typescript
function mergeExpertGroups(
  localGroups: AgentExpertGroupInfo[],
  serverSummaries: ServerExpertGroupSummary[],
): AgentExpertGroupInfo[] {
  const result: AgentExpertGroupInfo[] = []
  const localIds = new Set(localGroups.map((g) => g.id))

  // 本地已有的：保留本地完整信息
  for (const local of localGroups) {
    const server = serverSummaries.find((s) => s.id === local.id)
    result.push({
      ...local,
      status: server && server.version !== local.sourcePluginVersion
        ? ('remote_update_available' as const)
        : local.status,
    })
  }

  // 仅服务端有的：构建 remote 条目
  for (const server of serverSummaries) {
    if (localIds.has(server.id)) continue
    result.push({
      id: server.id,
      name: server.name,
      description: server.description,
      introduction: server.introduction,
      mainRole: { name: server.mainRoleName, prompt: '' },
      subagents: undefined,
      subagentLabels: server.subagentLabels,
      builtinTools: server.builtinTools,
      skills: server.skills,
      mcpServers: server.mcpServers,
      tags: server.tags,
      samplePrompts: server.samplePrompts,
      expertType: server.expertType,
      sourcePluginId: '',
      sourceLabel: server.name,
      sourcePluginVersion: server.version,
      sourcePluginKind: 'remote',
      sourcePluginPath: '',
      filePath: '',
      enabled: true,
      status: 'remote_not_downloaded',
      issues: [],
    })
  }

  return result.sort((a, b) => a.name.localeCompare(b.name))
}
```

- [ ] **Step 4: 修改 `loadAgentExpertGroupsAtom` 写入 `agentLocalExpertGroupsAtom`**

```typescript
export const loadAgentExpertGroupsAtom = atom(null, async (_get, set) => {
  const groups = await window.electronAPI.listAgentExpertGroups()
  set(agentLocalExpertGroupsAtom, groups)
})
```

- [ ] **Step 5: 在 `ExpertPageView.tsx` 中同时加载本地和服务端数据**

`loadRemoteExpertDataAtom` 可在 ExpertPageView 的 useEffect 中调用（后续 Task 处理）。

---

### Task 7: UI — ExpertPageView 集成 + ExpertFeaturedScenes 动态加载

**Files:**
- Modify: `apps/electron/src/renderer/experts/views/ExpertPageView.tsx`
- Modify: `apps/electron/src/renderer/experts/shared/ExpertFeaturedScenes.tsx`

- [ ] **Step 1: ExpertPageView — 引入新 atom 并在 init 时拉取服务端数据**

在 import 中添加：
```typescript
import { loadRemoteExpertDataAtom, featuredScenesAtom, serverExpertGroupsAtom } from '@/atoms/agent-atoms'
```

在 useEffect 中：
```typescript
const loadRemote = useSetAtom(loadRemoteExpertDataAtom)

React.useEffect(() => {
  if (allGroups.length === 0) {
    void loadGroups()
  }
  void loadRemote()  // 同时拉取服务端数据（静默，失败用缓存降级）
}, [allGroups.length, loadGroups, loadRemote])
```

- [ ] **Step 2: ExpertPageView — 场景筛选状态从 `string[]` 改为 `Set<string>`**

```typescript
const [sceneFilter, setSceneFilter] = React.useState<Set<string> | null>(null)
```

`handleSceneClick`:
```typescript
const handleSceneClick = (sceneId: string | null, expertGroupIds: string[] | null) => {
  if (!expertGroupIds) {
    setSceneFilter(null)
    setActiveSceneId(null)
  } else {
    setSceneFilter(new Set(expertGroupIds))
    setActiveSceneId(sceneId)
  }
}
```

数据管道：
```typescript
const displayGroups = React.useMemo(() => {
  let result = allGroups
  result = filterByTag(result, filterTag, followed, recent)
  if (sceneFilter) {
    result = result.filter(g => sceneFilter.has(g.id))
  }
  result = searchByName(result, query)
  return result
}, [allGroups, filterTag, query, followed, recent, sceneFilter])
```

- [ ] **Step 3: ExpertFeaturedScenes — 从 atom 动态获取**

```typescript
// ExpertFeaturedScenes.tsx

import * as React from 'react'
import type { AgentExpertGroupInfo } from '@proma/shared'
import type { FeatureScene } from '@proma/shared'
import { useAtomValue } from 'jotai'
import { featuredScenesAtom } from '@/atoms/agent-atoms'
import { cn } from '@/lib/utils'

interface ExpertFeaturedScenesProps {
  allGroups: AgentExpertGroupInfo[]
  activeScene: string | null
  onSceneClick: (sceneId: string | null, expertGroupIds: string[] | null) => void
}

export function ExpertFeaturedScenes({ allGroups, activeScene, onSceneClick }: ExpertFeaturedScenesProps): React.ReactElement {
  const scenes = useAtomValue(featuredScenesAtom)

  // 使用服务端数据，降级为空数组
  const displayScenes: FeatureScene[] = scenes.length > 0
    ? scenes
    : []  // 降级：不展示（旧硬编码删除）

  if (displayScenes.length === 0) return <div />

  const allGroupIds = new Set(allGroups.map(g => g.id))

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">精选场景</h3>
        {activeScene && (
          <button className="text-xs text-primary hover:underline" onClick={() => onSceneClick(null, null)}>
            清除筛选
          </button>
        )}
      </div>
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
        {displayScenes.map((scene) => {
          const count = allGroupIds.size > 0
            ? scene.expertGroupIds.filter(id => allGroupIds.has(id)).length
            : scene.expertGroupIds.length
          const isActive = activeScene === scene.id
          if (count === 0) {
            return (
              <div key={scene.id} className="rounded-lg border border-dashed bg-muted/30 px-4 py-3 text-center opacity-50">
                <div className="text-sm font-medium text-muted-foreground">{scene.name}</div>
                <div className="mt-1 text-xs text-muted-foreground">暂无专家</div>
              </div>
            )
          }
          return (
            <button
              key={scene.id}
              className={cn(
                'rounded-lg border px-4 py-3 text-left shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5',
                isActive ? 'border-primary bg-primary/10 ring-1 ring-primary' : 'bg-card',
              )}
              onClick={() => onSceneClick(isActive ? null : scene.id, isActive ? null : scene.expertGroupIds)}
            >
              <div className={cn('text-sm font-medium', isActive && 'text-primary')}>{scene.name}</div>
              <div className="mt-1 text-xs text-muted-foreground">{count} 位专家</div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
```

---

### Task 8: UI — ExpertCard + ExpertStatusBadge 新增远程状态

**Files:**
- Modify: `apps/electron/src/renderer/experts/card/ExpertStatusBadge.tsx`

- [ ] **Step 1: 在 STATUS_LABELS 中新增远程状态标签**

```typescript
const STATUS_LABELS: Record<AgentExpertGroupStatus, string> = {
  available: '可用',
  plugin_disabled: '插件已禁用',
  plugin_uninstalled: '来源已卸载',
  invalid_manifest: '配置错误',
  missing_subagent: '缺少子专家',
  missing_skill: '缺少技能',
  mcp_conflict: '连接器冲突',
  remote_not_downloaded: '未下载',
  remote_downloading: '下载中...',
  remote_download_failed: '下载失败',
  remote_update_available: '可更新',
}
```

- [ ] **Step 2: 新增状态的颜色映射**

```typescript
function variantFor(status: AgentExpertGroupStatus): 'default' | 'destructive' | 'secondary' | 'outline' {
  switch (status) {
    case 'available':
      return 'default'
    case 'remote_not_downloaded':
    case 'remote_downloading':
    case 'remote_update_available':
      return 'secondary'
    case 'remote_download_failed':
    case 'plugin_disabled':
    case 'plugin_uninstalled':
    case 'invalid_manifest':
    case 'missing_subagent':
    case 'missing_skill':
    case 'mcp_conflict':
      return 'destructive'
  }
}
```

---

### Task 9: UI — ExpertSummonButton 下载 + 召唤流程

**Files:**
- Modify: `apps/electron/src/renderer/experts/picker/ExpertSummonButton.tsx`

- [ ] **Step 1: 修改 handleSummon 支持远程下载**

在 handleSummon 回调中，判断 `group.sourcePluginKind === 'remote'` 且 `group.status === 'remote_not_downloaded'` 时先下载：

```typescript
const handleSummon = React.useCallback(async (group: AgentExpertGroupInfo): Promise<void> => {
  if (group.status === 'remote_not_downloaded' && group.sourcePluginKind === 'remote') {
    // 需要先下载
    setSummoningGroup(group)
    try {
      await window.electronAPI.downloadRemoteExpert(group.id, (group as any)._downloadUrl ?? '')
      await loadGroups()  // 刷新本地列表
      // 重新查找刚安装的本地版本并召唤
      const refreshed = await window.electronAPI.listAgentExpertGroups()
      const installed = refreshed.find(g => g.id === group.id && g.status === 'available')
      if (installed) {
        const session = await createExpertSession(installed)
        recordRecent(installed.id)
        openSession('agent', session.id, session.title)
        toast.success(`已召唤${installed.name}`)
      }
    } catch (error) {
      console.error('[专家团] 下载/召唤失败:', error)
      toast.error('下载专家团失败')
    } finally {
      setSummoningGroup(null)
    }
    return
  }

  if (group.status !== 'available') return
  // 现有召唤逻辑...
  setSummoningGroup(group)
  try {
    const session = await createExpertSession(group)
    recordRecent(group.id)
    openSession('agent', session.id, session.title)
    setOpen(false)
    toast.success(`已召唤${group.name}`)
  } catch (error) {
    console.error('[专家团] 召唤失败:', error)
    toast.error('召唤专家团失败')
  } finally {
    setSummoningGroup(null)
  }
}, [createExpertSession, openSession, recordRecent, loadGroups])
```

- [ ] **Step 2: 在 cards/ExpertCard 中根据状态展示不同的按钮文案**

在 `ExpertPicker` 中遍历 groups 时，按钮文案：
```typescript
const summonLabel = group.sourcePluginKind === 'remote' && group.status === 'remote_not_downloaded'
  ? '获取并召唤'
  : group.status === 'remote_downloading'
    ? `下载中 ${progress}%`
    : '召唤'
```

---

### Task 10: 清理 — 删除旧的 filterByScene / countByScene

**Files:**
- Modify: `apps/electron/src/renderer/experts/utils/filter.ts`

- [ ] **Step 1: 删除 filterByScene 和 countByScene 函数**

保留 `filterByTag` 和 `searchByName`，删除 `filterByScene` 和 `countByScene`。

---

### Task 11: TypeScript 编译检查

```bash
cd apps/electron && npx tsc --noEmit
```

修复所有类型错误后完成。
