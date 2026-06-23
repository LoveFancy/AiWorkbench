# 专家团下载进度条与可取消 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让专家团下载/安装不冻结主进程，卡片内联展示下载进度，全程可取消，且自动开会话行为不变。

**Architecture:** 主进程新增异步分片解压安装路径（条间 `await` 让出事件循环）+ per-groupId `AbortController` 注册表贯穿下载与安装；复用已有 `DOWNLOAD_PROGRESS` 广播，渲染端新增进度 atom + 全局订阅 hook + 卡片内联进度条/取消按钮。三个触发场景（tab 页下载、召唤未下载、召唤版本升级）共用同一套。

**Tech Stack:** TypeScript, Electron IPC, Node `fs/promises`, adm-zip, Jotai, React, bun:test

设计依据：[专家下载进度条与可取消方案.md](file:///d:/AiWorkbench-workmate/docs/客户端/专家、技能等/专家下载进度条与可取消方案.md)

---

### Task 1: 类型 — `RemoteDownloadProgress.status` 增加 `'cancelled'`

**Files:**
- Modify: `packages/shared/src/types/agent.ts:1109-1116`

- [ ] **Step 1: 修改 status 联合类型**

将 [`agent.ts:1111`](file:///d:/AiWorkbench-workmate/packages/shared/src/types/agent.ts#L1111) 改为：

```ts
export interface RemoteDownloadProgress {
  groupId: string
  status: 'downloading' | 'installing' | 'done' | 'error' | 'cancelled'
  progress: number
  downloadedBytes: number
  totalBytes: number
  error?: string
}
```

- [ ] **Step 2: 类型检查**

Run: `cd d:/AiWorkbench-workmate && bun run typecheck`（若无该脚本则 `bunx tsc -p apps/electron --noEmit`）
Expected: PASS（仅类型扩展，不破坏现有用法）

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/types/agent.ts
git commit -m "feat(expert): RemoteDownloadProgress 增加 cancelled 状态"
```

---

### Task 2: 主进程 — 异步分片解压安装路径（消除卡死 + 安装期可取消）

**Files:**
- Modify: `apps/electron/src/main/lib/plugin-registry-service.ts`
- Test: `apps/electron/src/main/lib/plugin-registry-service.test.ts`

- [ ] **Step 1: 写失败测试 — 异步安装与同步安装结果一致**

在 [`plugin-registry-service.test.ts`](file:///d:/AiWorkbench-workmate/apps/electron/src/main/lib/plugin-registry-service.test.ts) 顶部 import 加入 `installUserPluginZipAsync`，并新增测试：

```ts
test('installUserPluginZipAsync 异步安装结果与同步一致', async () => {
  const temp = tempRoot()
  try {
    const sourceDir = createPlugin(temp.root, 'async-plugin', '1.0.0')
    const zipPath = join(temp.root, 'async-plugin.zip')
    const zip = new AdmZip()
    zip.addLocalFolder(sourceDir, 'async-plugin')
    zip.writeZip(zipPath)

    const installed = await installUserPluginZipAsync(zipPath, {
      builtinDir: join(temp.root, 'default-plugins'),
      userDir: join(temp.root, 'user-plugins'),
      configPath: join(temp.root, 'plugins.json'),
    })

    expect(installed.id).toBe('user:local/async-plugin')
    expect(installed.version).toBe('1.0.0')
  } finally {
    temp.cleanup()
  }
})

test('installUserPluginZipAsync 在 signal 已 abort 时抛出取消错误', async () => {
  const temp = tempRoot()
  try {
    const sourceDir = createPlugin(temp.root, 'cancel-plugin', '1.0.0')
    const zipPath = join(temp.root, 'cancel-plugin.zip')
    const zip = new AdmZip()
    zip.addLocalFolder(sourceDir, 'cancel-plugin')
    zip.writeZip(zipPath)

    const controller = new AbortController()
    controller.abort()

    await expect(installUserPluginZipAsync(zipPath, {
      builtinDir: join(temp.root, 'default-plugins'),
      userDir: join(temp.root, 'user-plugins'),
      configPath: join(temp.root, 'plugins.json'),
      signal: controller.signal,
    })).rejects.toThrow('下载已取消')
  } finally {
    temp.cleanup()
  }
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd d:/AiWorkbench-workmate/apps/electron && bun test src/main/lib/plugin-registry-service.test.ts`
Expected: FAIL（`installUserPluginZipAsync is not a function` / 未导出）

- [ ] **Step 3: 实现 — 导入 fs/promises、取消错误类、异步解压与异步安装**

在 [`plugin-registry-service.ts:8`](file:///d:/AiWorkbench-workmate/apps/electron/src/main/lib/plugin-registry-service.ts#L8) 的 fs import 下方补入：

```ts
import { promises as fsp } from 'node:fs'
```

在 [`InstallUserPluginZipOptions`](file:///d:/AiWorkbench-workmate/apps/electron/src/main/lib/plugin-registry-service.ts#L44) 接口后新增取消错误类与异步选项：

```ts
/** 下载/安装被用户取消时抛出，调用方据此区分取消与真实失败 */
export class DownloadCancelledError extends Error {
  constructor() {
    super('下载已取消')
    this.name = 'DownloadCancelledError'
  }
}

interface InstallAsyncOptions extends InstallUserPluginZipOptions {
  /** 安装期可取消信号；abort 后解压循环抛 DownloadCancelledError */
  signal?: AbortSignal
}
```

在 [`extractPluginZipSafely`](file:///d:/AiWorkbench-workmate/apps/electron/src/main/lib/plugin-registry-service.ts#L660) 函数后新增异步版本（沿用相同安全校验，逐条 `await` 让出事件循环）：

```ts
async function extractPluginZipAsync(
  zipPath: string,
  extractDir: string,
  signal?: AbortSignal,
): Promise<void> {
  const zip = new AdmZip(zipPath)

  for (const entry of zip.getEntries()) {
    if (signal?.aborted) throw new DownloadCancelledError()

    const entryName = entry.entryName
    const targetPath = resolve(extractDir, entryName)
    const rel = relative(extractDir, targetPath)

    if (!entryName || entryName.startsWith('/') || rel.startsWith('..') || isAbsolute(rel)) {
      throw new Error('插件 zip 包包含不安全路径')
    }

    if (entry.isDirectory) {
      await fsp.mkdir(targetPath, { recursive: true })
      continue
    }

    await fsp.mkdir(dirname(targetPath), { recursive: true })
    await fsp.writeFile(targetPath, entry.getData())
  }
}
```

在 [`installUserPluginZip`](file:///d:/AiWorkbench-workmate/apps/electron/src/main/lib/plugin-registry-service.ts#L746) 函数后新增异步安装入口（结构与同步版一致，仅 extract 异步化、关键节点检查 signal、临时目录用异步清理）：

```ts
export async function installUserPluginZipAsync(
  zipPath: string,
  options: InstallAsyncOptions = {},
): Promise<AgentPluginInfo> {
  if (!zipPath.toLowerCase().endsWith('.zip')) {
    throw new Error('请选择 .zip 格式的插件包')
  }
  if (!existsSync(zipPath)) {
    throw new Error(`插件 zip 包不存在: ${zipPath}`)
  }

  const resolved = registryPaths(options)
  const tempRoot = options.tempRoot ?? tmpdir()
  const extractDir = join(tempRoot, `proma-plugin-${Date.now()}`)

  try {
    await fsp.mkdir(extractDir, { recursive: true })
    await extractPluginZipAsync(zipPath, extractDir, options.signal)
    if (options.signal?.aborted) throw new DownloadCancelledError()

    const pluginRoot = resolveExtractedPluginRoot(extractDir)
    const manifest = normalizeManifest(readJsonFile(join(pluginRoot, '.claude-plugin', 'plugin.json')), basename(pluginRoot))
    const installSlug = resolvePluginInstallSlug(pluginRoot, extractDir, manifest)
    const marketplaceId = options.marketplaceId ?? 'local'
    const pluginId = `user:${marketplaceId}/${installSlug}`
    const targetDir = join(resolved.userDir, marketplaceId, installSlug)
    const targetRel = relative(resolved.userDir, targetDir)
    if (targetRel.startsWith('..') || isAbsolute(targetRel)) {
      throw new Error('插件名称包含不安全路径')
    }
    assertNoDuplicateExpertGroups(pluginRoot, pluginId, manifest, resolved)

    const status = copyPluginAtomically(pluginRoot, targetDir, options.overwrite ?? false)
    const config = readPluginsConfig({ configPath: resolved.configPath })
    const previous = config.plugins[pluginId]
    const now = new Date().toISOString()
    config.plugins[pluginId] = {
      ...previous,
      enabled: previous?.enabled ?? true,
      installedAt: previous?.installedAt ?? now,
      updatedAt: status === 'overwritten' ? now : previous?.updatedAt,
      sourceMarketplaceId: marketplaceId,
      version: manifest.version,
    }
    writePluginsConfig(config, { configPath: resolved.configPath })

    return {
      ...pluginInfoFromPath('user', targetDir, pluginId, config),
      sourceMarketplaceId: marketplaceId,
    }
  } finally {
    await fsp.rm(extractDir, { recursive: true, force: true })
  }
}
```

> `copyPluginAtomically` 已含失败清理（`.installing-*` 目录），取消时抛出的 `DownloadCancelledError` 走同一 catch/finally 路径，无需额外清理逻辑。

- [ ] **Step 4: 运行测试确认通过**

Run: `cd d:/AiWorkbench-workmate/apps/electron && bun test src/main/lib/plugin-registry-service.test.ts`
Expected: PASS（新增 2 个用例 + 原有用例全绿）

- [ ] **Step 5: Commit**

```bash
git add apps/electron/src/main/lib/plugin-registry-service.ts apps/electron/src/main/lib/plugin-registry-service.test.ts
git commit -m "feat(expert): 新增异步分片解压安装路径，支持安装期取消"
```

---

### Task 3: 主进程 — 下载服务接入取消注册表 + signal 贯穿

**Files:**
- Modify: `apps/electron/src/main/lib/expert-download-service.ts`
- Test: `apps/electron/src/main/lib/expert-download-service.test.ts`（新建）

- [ ] **Step 1: 写失败测试 — 取消注册表行为**

新建 [`expert-download-service.test.ts`](file:///d:/AiWorkbench-workmate/apps/electron/src/main/lib/expert-download-service.test.ts)。仅测试不依赖 Electron 的纯逻辑：导出的 `cancelRemoteDownload` 在无进行中下载时安全 no-op，在有 controller 时触发 abort。为此把注册表操作抽为可测函数：

```ts
import { describe, expect, test } from 'bun:test'
import { __registerDownloadForTest, cancelRemoteDownload } from './expert-download-service.ts'

describe('expert-download-service 取消注册表', () => {
  test('cancelRemoteDownload 对未知 groupId 安全 no-op', () => {
    expect(() => cancelRemoteDownload('not-exist')).not.toThrow()
  })

  test('cancelRemoteDownload 触发已注册 controller 的 abort', () => {
    const controller = new AbortController()
    __registerDownloadForTest('g1', controller)
    expect(controller.signal.aborted).toBe(false)
    cancelRemoteDownload('g1')
    expect(controller.signal.aborted).toBe(true)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd d:/AiWorkbench-workmate/apps/electron && bun test src/main/lib/expert-download-service.test.ts`
Expected: FAIL（`cancelRemoteDownload` / `__registerDownloadForTest` 未导出）

- [ ] **Step 3: 实现 — 注册表、取消、signal 贯穿、cancelled 广播、异步安装**

改写 [`expert-download-service.ts`](file:///d:/AiWorkbench-workmate/apps/electron/src/main/lib/expert-download-service.ts)。

3a. import 改为引用异步安装与取消错误类（替换 `installUserPluginZip`）：

```ts
import { installUserPluginZipAsync, DownloadCancelledError } from './plugin-registry-service'
```

3b. 在 `broadcastProgress` 后新增注册表与取消导出：

```ts
/** per-groupId 的进行中下载控制器，用于取消 */
const activeDownloads = new Map<string, AbortController>()

/** 取消指定专家团的下载/安装；未在进行中则安全 no-op */
export function cancelRemoteDownload(groupId: string): void {
  activeDownloads.get(groupId)?.abort()
}

/** 仅测试用：注入 controller 以验证取消逻辑 */
export function __registerDownloadForTest(groupId: string, controller: AbortController): void {
  activeDownloads.set(groupId, controller)
}
```

3c. `downloadFile` 增加 `signal` 参数并与现有 15s 连接超时合并：

```ts
async function downloadFile(
  url: string,
  destPath: string,
  onProgress: (downloaded: number, total: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  const headers: Record<string, string> = {}
  const token = getToken()
  if (token) {
    headers['Cookie'] = `EIPGW-TOKEN=${token}`
  }

  // 连接超时与外部取消信号合并：任一触发都 abort
  const connectController = new AbortController()
  const connectTimer = setTimeout(() => connectController.abort(), 15_000)
  const mergedSignal = signal
    ? AbortSignal.any([signal, connectController.signal])
    : connectController.signal

  let response: Response
  try {
    response = await fetch(url, { headers, signal: mergedSignal })
  } finally {
    clearTimeout(connectTimer)
  }

  if (!response.ok) {
    throw new Error(`下载失败 HTTP ${response.status}`)
  }

  const total = parseInt(response.headers.get('content-length') ?? '0', 10)
  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('无法获取响应流')
  }

  const destDir = dirname(destPath)
  if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true })

  const writeStream = createWriteStream(destPath)
  let downloaded = 0

  try {
    while (true) {
      if (signal?.aborted) throw new DownloadCancelledError()
      const { done, value } = await reader.read()
      if (done) break

      downloaded += value.byteLength
      onProgress(downloaded, total)

      const canContinue = writeStream.write(value)
      if (!canContinue) {
        await new Promise<void>((resolve) => writeStream.once('drain', resolve))
      }
    }
  } finally {
    writeStream.end()
    await new Promise<void>((resolve) => writeStream.once('finish', resolve))
    reader.cancel().catch(() => {})
  }
}
```

3d. 改写 `downloadAndInstallRemoteExpert`：注册 controller、走异步安装、区分取消与失败：

```ts
export async function downloadAndInstallRemoteExpert(
  groupId: string,
  options: { overwrite?: boolean } = {},
): Promise<AgentPluginInfo> {
  const downloadPath = `/workmate/expert-groups/${groupId}/download`
  const downloadUrl = `${resolveApiBase()}${downloadPath}`
  const tempPath = `${app.getPath('temp')}\\proma-expert-${groupId}-${Date.now()}.zip`

  const controller = new AbortController()
  activeDownloads.set(groupId, controller)

  broadcastProgress({ groupId, status: 'downloading', progress: 0, downloadedBytes: 0, totalBytes: 0 })

  try {
    await downloadFile(downloadUrl, tempPath, (downloaded, total) => {
      const progress = total > 0 ? Math.round((downloaded / total) * 100) : 0
      broadcastProgress({ groupId, status: 'downloading', progress, downloadedBytes: downloaded, totalBytes: total })
    }, controller.signal)

    broadcastProgress({ groupId, status: 'installing', progress: 100, downloadedBytes: 0, totalBytes: 0 })

    const plugin = await installUserPluginZipAsync(tempPath, {
      marketplaceId: 'remote',
      overwrite: options.overwrite ?? false,
      signal: controller.signal,
    })

    broadcastProgress({ groupId, status: 'done', progress: 100, downloadedBytes: 0, totalBytes: 0 })
    return plugin
  } catch (error) {
    const cancelled = controller.signal.aborted || error instanceof DownloadCancelledError
    if (cancelled) {
      broadcastProgress({ groupId, status: 'cancelled', progress: 0, downloadedBytes: 0, totalBytes: 0 })
      throw new DownloadCancelledError()
    }
    const message = error instanceof Error ? error.message : String(error)
    broadcastProgress({ groupId, status: 'error', progress: 0, downloadedBytes: 0, totalBytes: 0, error: message })
    throw error
  } finally {
    try { unlinkSync(tempPath) } catch { /* ignore */ }
    activeDownloads.delete(groupId)
  }
}
```

> `AbortSignal.any` 需 Node 20.3+ / Electron 28+。若运行时不支持，退化为：仅把 `signal` 直接传给 `fetch`，并保留独立 `connectTimer` 用 `signal.addEventListener('abort', ...)` 不必合并——但当前 Electron 版本已支持 `AbortSignal.any`，优先用上文写法。

- [ ] **Step 4: 运行测试确认通过**

Run: `cd d:/AiWorkbench-workmate/apps/electron && bun test src/main/lib/expert-download-service.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/electron/src/main/lib/expert-download-service.ts apps/electron/src/main/lib/expert-download-service.test.ts
git commit -m "feat(expert): 下载服务接入取消注册表与 signal，安装走异步路径"
```

---

### Task 4: IPC — `CANCEL_DOWNLOAD` 落地真正取消

**Files:**
- Modify: `apps/electron/src/main/ipc.ts:2506-2512`

- [ ] **Step 1: 改写 handler**

将 [`ipc.ts:2506-2512`](file:///d:/AiWorkbench-workmate/apps/electron/src/main/ipc.ts#L2506) 的空实现替换为：

```ts
  ipcMain.handle(
    EXPERT_IPC_CHANNELS.CANCEL_DOWNLOAD,
    async (_, groupId: string): Promise<void> => {
      const { cancelRemoteDownload } = await import('./lib/expert-download-service')
      cancelRemoteDownload(groupId)
    }
  )
```

- [ ] **Step 2: 类型检查**

Run: `cd d:/AiWorkbench-workmate/apps/electron && bunx tsc --noEmit -p .`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/electron/src/main/ipc.ts
git commit -m "feat(expert): CANCEL_DOWNLOAD 调用 cancelRemoteDownload 真正取消"
```

---

### Task 5: 渲染端 — 下载进度 atom

**Files:**
- Modify: `apps/electron/src/renderer/experts/atoms/expert-remote.ts`

- [ ] **Step 1: 新增进度 atom 与切片 family**

在 [`expert-remote.ts`](file:///d:/AiWorkbench-workmate/apps/electron/src/renderer/experts/atoms/expert-remote.ts) 顶部 import 改为：

```ts
import { atom } from 'jotai'
import { atomFamily } from 'jotai/utils'
import type { ServerExpertGroupSummary, FeaturedScene, RemoteDownloadProgress } from '@proma/shared'
```

在 `expertCategoriesAtom` 定义后追加：

```ts
/** 各专家团下载进度 Map — groupId → RemoteDownloadProgress */
export const expertDownloadProgressAtom = atom<Map<string, RemoteDownloadProgress>>(new Map())

/** 按 groupId 切片订阅，避免任一进度更新触发所有卡片重渲染 */
export const expertDownloadProgressFamily = atomFamily((groupId: string) =>
  atom((get) => get(expertDownloadProgressAtom).get(groupId)),
)
```

- [ ] **Step 2: 类型检查**

Run: `cd d:/AiWorkbench-workmate/apps/electron && bunx tsc --noEmit -p .`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/electron/src/renderer/experts/atoms/expert-remote.ts
git commit -m "feat(expert): 新增下载进度 atom 与按 groupId 切片 family"
```

---

### Task 6: 渲染端 — 全局进度订阅 hook

**Files:**
- Create: `apps/electron/src/renderer/experts/hooks/useExpertDownloadProgressBridge.ts`

- [ ] **Step 1: 创建 hook**

```ts
import * as React from 'react'
import { useSetAtom } from 'jotai'
import { expertDownloadProgressAtom } from '@/experts/atoms/expert-remote'
import { loadAgentExpertGroupsAtom } from '@/atoms/agent-atoms'

/**
 * 全局下载进度桥接：订阅主进程 DOWNLOAD_PROGRESS 事件，写入 expertDownloadProgressAtom。
 *
 * 只需在专家视图根组件挂载一次。终态（done/cancelled/error）短暂展示后清理；
 * done 时刷新本地专家团列表，使新安装的专家变为可召唤。
 */
export function useExpertDownloadProgressBridge(): void {
  const setProgress = useSetAtom(expertDownloadProgressAtom)
  const loadGroups = useSetAtom(loadAgentExpertGroupsAtom)

  React.useEffect(() => {
    return window.electronAPI.onExpertDownloadProgress((p) => {
      setProgress((prev) => {
        const next = new Map(prev)
        next.set(p.groupId, p)
        return next
      })

      if (p.status === 'done' || p.status === 'cancelled' || p.status === 'error') {
        if (p.status === 'done') void loadGroups()
        setTimeout(() => {
          setProgress((prev) => {
            const next = new Map(prev)
            next.delete(p.groupId)
            return next
          })
        }, 1500)
      }
    })
  }, [setProgress, loadGroups])
}
```

- [ ] **Step 2: 类型检查**

Run: `cd d:/AiWorkbench-workmate/apps/electron && bunx tsc --noEmit -p .`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/electron/src/renderer/experts/hooks/useExpertDownloadProgressBridge.ts
git commit -m "feat(expert): 新增全局下载进度订阅 hook"
```

---

### Task 7: 渲染端 — 在专家视图挂载进度桥接

**Files:**
- Modify: `apps/electron/src/renderer/experts/views/ExpertPageView.tsx`

- [ ] **Step 1: 挂载 hook**

在 [`ExpertPageView.tsx`](file:///d:/AiWorkbench-workmate/apps/electron/src/renderer/experts/views/ExpertPageView.tsx) import 区加入：

```ts
import { useExpertDownloadProgressBridge } from '@/experts/hooks/useExpertDownloadProgressBridge'
```

在 `ExpertPageView` 组件体内（`const { summon } = useSummonExpert()` 之后）调用：

```ts
  useExpertDownloadProgressBridge()
```

> `AgentSkillsView` 的专家 tab 内嵌渲染 `ExpertPageView`，故此处挂载同时覆盖「Agent 技能 → 专家 tab」与独立专家页两个入口；进度 atom 为全局单例，召唤面板（ExpertPicker）中的卡片也能读到同一进度。

- [ ] **Step 2: 类型检查**

Run: `cd d:/AiWorkbench-workmate/apps/electron && bunx tsc --noEmit -p .`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/electron/src/renderer/experts/views/ExpertPageView.tsx
git commit -m "feat(expert): 专家视图挂载下载进度桥接"
```

---

### Task 8: 渲染端 — 卡片内联进度条 + 取消按钮

**Files:**
- Modify: `apps/electron/src/renderer/experts/card/ExpertCard.tsx`

- [ ] **Step 1: 订阅进度并渲染内联 UI**

在 [`ExpertCard.tsx`](file:///d:/AiWorkbench-workmate/apps/electron/src/renderer/experts/card/ExpertCard.tsx) import 区加入：

```ts
import { X } from 'lucide-react'
import { expertDownloadProgressFamily } from '@/experts/atoms/expert-remote'
```

在组件体内（`const isFollowed = ...` 之后）订阅进度：

```ts
  const downloadProgress = useAtomValue(expertDownloadProgressFamily(group.id))
  const isDownloading = downloadProgress?.status === 'downloading' || downloadProgress?.status === 'installing'

  const handleCancelDownload = React.useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    void window.electronAPI.cancelRemoteDownload(group.id)
  }, [group.id])
```

将原召唤按钮所在的 `<div className="absolute right-4 top-4 ...">` 区块（[`ExpertCard.tsx:88-102`](file:///d:/AiWorkbench-workmate/apps/electron/src/renderer/experts/card/ExpertCard.tsx#L88)）替换为：下载中显示内联进度，否则显示原按钮：

```tsx
        <div className="absolute right-4 top-4 flex items-center gap-2 pr-5">
          {isDownloading ? (
            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              <div className="flex flex-col gap-1">
                <div className="h-1.5 w-28 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-200"
                    style={{ width: `${downloadProgress?.status === 'installing' ? 100 : downloadProgress?.progress ?? 0}%` }}
                  />
                </div>
                <span className="text-[11px] text-muted-foreground">
                  {downloadProgress?.status === 'installing'
                    ? '正在安装…'
                    : `正在下载 ${downloadProgress?.progress ?? 0}%`}
                </span>
              </div>
              <button
                type="button"
                onClick={handleCancelDownload}
                title="取消下载"
                className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            onSummon && (
              <Button
                size="sm"
                className={cn(
                  'pointer-events-none h-9 px-4 opacity-0 shadow-sm transition-all duration-200 group-hover:pointer-events-auto group-hover:opacity-100',
                  compact && 'h-8 px-3',
                )}
                disabled={!isCardSummonActionable(group.status)}
                onClick={() => onSummon(group)}
              >
                {group.status === 'remote_not_downloaded' ? '下载' : group.status === 'remote_downloading' ? '下载中...' : '召唤'}
              </Button>
            )
          )}
        </div>
```

- [ ] **Step 2: 类型检查**

Run: `cd d:/AiWorkbench-workmate/apps/electron && bunx tsc --noEmit -p .`
Expected: PASS

- [ ] **Step 3: 手动验证（开发态）**

Run: `cd d:/AiWorkbench-workmate && bun run dev`（或项目既定 dev 命令）
验证：打开 Agent 技能 → 专家 tab，点未下载专家「下载」→ 卡片出现进度条与百分比，下载/安装期间应用其余区域仍可点击；点 ✕ 可取消，按钮回退。

- [ ] **Step 4: Commit**

```bash
git add apps/electron/src/renderer/experts/card/ExpertCard.tsx
git commit -m "feat(expert): 卡片内联下载进度条与取消按钮"
```

---

### Task 9: 渲染端 — 召唤入口区分取消与失败

**Files:**
- Modify: `apps/electron/src/renderer/experts/hooks/useSummonExpert.ts`

- [ ] **Step 1: 分支一 catch 区分取消**

[`useSummonExpert.ts`](file:///d:/AiWorkbench-workmate/apps/electron/src/renderer/experts/hooks/useSummonExpert.ts) 分支一的 catch 块（约 line 53-58）改为：取消时不弹 error toast、不开会话；其余失败保持原行为。判定方式：取消的 IPC reject message 为 `'下载已取消'`。

```ts
      } catch (err) {
        const cancelled = err instanceof Error && err.message === '下载已取消'
        if (cancelled) {
          // 用户主动取消：静默，不开会话
          return
        }
        console.error('[专家团] 下载远程专家团失败:', err)
        toast.error(`下载 ${group.name} 失败`)
      } finally {
        setSummoningGroup(null)
      }
```

> 分支二（版本升级）经由 `ensureExpertGroupLatest`，其内部已吞掉下载异常并降级 `{ updated: false }`，召唤主流程不受取消影响，无需改动。

- [ ] **Step 2: 类型检查**

Run: `cd d:/AiWorkbench-workmate/apps/electron && bunx tsc --noEmit -p .`
Expected: PASS

- [ ] **Step 3: 手动验证**

召唤一个未下载专家 → 下载完成后自动开会话（行为不变）；下载途中点 ✕ → 不开会话、无报错 toast。

- [ ] **Step 4: Commit**

```bash
git add apps/electron/src/renderer/experts/hooks/useSummonExpert.ts
git commit -m "feat(expert): 召唤下载取消时静默不报错不开会话"
```

---

## 自检结果

- **Spec 覆盖**：§5.1 异步解压→Task 2；§5.2 取消注册表/signal→Task 3；§5.3 IPC+类型→Task 1/4；§6.1 atom→Task 5；§6.2 hook→Task 6+7；§6.3 卡片 UI→Task 8；§6.4/§7 三处接入+取消语义→Task 7/8/9。全部有对应任务。
- **类型一致**：`DownloadCancelledError`（Task 2 定义，Task 3/9 使用，message 统一 `'下载已取消'`）、`installUserPluginZipAsync`（Task 2 定义，Task 3 调用）、`expertDownloadProgressAtom`/`expertDownloadProgressFamily`（Task 5 定义，Task 6/8 使用）、`cancelRemoteDownload`（Task 3 定义，Task 4/8 使用）命名一致。
- **占位符**：无 TBD/TODO；每个代码步骤均有完整代码。
- **范围**：聚焦单一特性（下载进度+可取消+去阻塞），无独立子系统需拆分。
