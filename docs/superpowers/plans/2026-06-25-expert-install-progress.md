# 专家安装阶段真实进度 + 单趟解压加速 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把专家团「安装阶段」从一条来回跑的不确定条带改成只前进的真实进度条（解压按文件数 0→95、收尾 95→100），同时改为单趟解压消除第二趟全量拷贝以加速大包安装。

**Architecture:** 主进程共享安装器 `installUserPluginZipAsync` 改为「解压进安装区同盘 staging → 原子 rename」单趟流程，并新增可观测的 `onProgress` 回调（解压逐文件节流 + 收尾阶段信号）；专家下载域 `expert-download-service.ts` 把单次 installing 广播改为分阶段广播。渲染端把卡片底部状态区抽成纯函数 `describeDownloadStatus` + 哑组件 `ExpertDownloadStatus`，移除来回跑动画。

**Tech Stack:** TypeScript、Electron 主进程、`adm-zip`、`node:fs/promises`、React + jotai、Tailwind、bun:test。

**约束（来自用户）：** 渲染端改动全部落在 `renderer/experts/` 内；主进程仅动专家下载域与共享安装器；注意行数控制与单一职责。

---

## File Structure

| 文件 | 职责 | 改动类型 |
| --- | --- | --- |
| `packages/shared/src/types/agent.ts` | `RemoteDownloadProgress` 进度契约 | Modify：加 3 个可选字段 |
| `apps/electron/src/main/lib/plugin-registry-service.ts` | 共享插件安装器 | Modify：单趟解压 + `onProgress`；删除 `copyPluginAtomicallyAsync` |
| `apps/electron/src/main/lib/plugin-registry-service.test.ts` | 安装器单测 | Modify：新增单趟/进度/中止清理用例 |
| `apps/electron/src/main/lib/expert-download-service.ts` | 专家下载域：下载+安装+广播 | Modify：分阶段广播 |
| `apps/electron/src/renderer/experts/card/download-status.ts` | 纯函数：进度对象 → 展示视图 | Create |
| `apps/electron/src/renderer/experts/card/download-status.test.ts` | 纯函数单测 | Create |
| `apps/electron/src/renderer/experts/card/ExpertDownloadStatus.tsx` | 哑组件：渲染底部状态区 | Create |
| `apps/electron/src/renderer/experts/card/ExpertCard.tsx` | 卡片：内联下载/安装状态区迁出 | Modify |
| `apps/electron/src/renderer/experts/card/index.ts` | 桶导出 | Modify |
| `apps/electron/src/renderer/styles/globals.css` | 删除已无引用的 keyframe | Modify |

**测试命令（工作目录 `d:\AiWorkbench`）：** `bun test <相对路径>`

---

## Task 1: 扩展进度契约类型

**Files:**
- Modify: `packages/shared/src/types/agent.ts:1259-1266`

- [ ] **Step 1: 给 `RemoteDownloadProgress` 增加 3 个可选字段**

把现有接口：

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

改为：

```ts
export interface RemoteDownloadProgress {
  groupId: string
  status: 'downloading' | 'installing' | 'done' | 'error' | 'cancelled'
  progress: number
  downloadedBytes: number
  totalBytes: number
  error?: string
  /** 安装子阶段：解压中 / 收尾中（仅 status === 'installing' 时有意义） */
  installStage?: 'extracting' | 'finalizing'
  /** 已解压文件数（extracting 阶段展示用） */
  processedFiles?: number
  /** 总文件数（extracting 阶段展示用） */
  totalFiles?: number
}
```

- [ ] **Step 2: 类型检查通过（仅新增可选字段，不破坏现有调用）**

Run: `bun test apps/electron/src/main/lib/expert-download-service.test.ts`
Expected: PASS（现有测试不受影响）

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/types/agent.ts
git commit -m "feat(experts): extend RemoteDownloadProgress with install stage fields"
```

---

## Task 2: 安装器加 `onProgress` + 单趟解压（TDD）

**Files:**
- Modify: `apps/electron/src/main/lib/plugin-registry-service.ts`
  - `InstallAsyncOptions`（约 `:61-66`）
  - `extractPluginZipAsync`（约 `:797-822`）
  - `installUserPluginZipAsync`（约 `:1001-1060`）
  - 删除 `copyPluginAtomicallyAsync`（约 `:843-878`，唯一调用方即本任务改写的 install 函数）
- Test: `apps/electron/src/main/lib/plugin-registry-service.test.ts`（追加到 `describe('异步插件安装（installUserPluginZipAsync）')`）

> 背景：现有 `installUserPluginZipAsync` 是两趟写盘——先解压到 `tmpdir()`，再 `copyPluginAtomicallyAsync`（`fsp.cp` 全量拷贝）到安装区。1.5w 小文件会写两遍盘。本任务改为：解压进**安装区同盘** staging，收尾只做一次 `fsp.rename`。现有 zip 测试均用 `zip.addLocalFolder(sourceDir, 'name')`（包裹子目录），故 `pluginRoot = staging/name`，收尾 `rename(staging/name, targetDir)`。

- [ ] **Step 1: 追加失败测试——解压进度回调按阶段上报**

在 `plugin-registry-service.test.ts` 的 `describe('异步插件安装（installUserPluginZipAsync）', () => {` 块内追加：

```ts
  test('installUserPluginZipAsync 通过 onProgress 上报解压进度并以 finalizing 收尾', async () => {
    const temp = tempRoot()
    try {
      const sourceDir = createPlugin(temp.root, 'progress-plugin', '1.0.0')
      const zipPath = join(temp.root, 'progress-plugin.zip')
      const zip = new AdmZip()
      zip.addLocalFolder(sourceDir, 'progress-plugin')
      zip.writeZip(zipPath)

      const events: Array<{ stage: string; processed?: number; total?: number }> = []
      await installUserPluginZipAsync(zipPath, {
        builtinDir: join(temp.root, 'default-plugins'),
        userDir: join(temp.root, 'user-plugins'),
        configPath: join(temp.root, 'plugins.json'),
        onProgress: (p) => {
          events.push(p.stage === 'extracting' ? { stage: p.stage, processed: p.processed, total: p.total } : { stage: p.stage })
        },
      })

      const extracting = events.filter((e) => e.stage === 'extracting')
      expect(extracting.length).toBeGreaterThan(0)
      // 解压进度单调不减，且最终 processed === total
      const last = extracting[extracting.length - 1]!
      expect(last.processed).toBe(last.total)
      // 解压完成后进入收尾阶段
      expect(events[events.length - 1]!.stage).toBe('finalizing')
    } finally {
      temp.cleanup()
    }
  })
```

- [ ] **Step 2: 追加失败测试——中止后安装区不残留 `.installing-*`**

继续在同一 `describe` 内追加：

```ts
  test('installUserPluginZipAsync 中止后清理 staging，不残留 .installing 目录', async () => {
    const { readdirSync, existsSync } = await import('node:fs')
    const temp = tempRoot()
    try {
      const sourceDir = createPlugin(temp.root, 'abort-clean-plugin', '1.0.0')
      const zipPath = join(temp.root, 'abort-clean-plugin.zip')
      const zip = new AdmZip()
      zip.addLocalFolder(sourceDir, 'abort-clean-plugin')
      zip.writeZip(zipPath)

      const userDir = join(temp.root, 'user-plugins')
      const controller = new AbortController()
      controller.abort()

      await expect(installUserPluginZipAsync(zipPath, {
        builtinDir: join(temp.root, 'default-plugins'),
        userDir,
        configPath: join(temp.root, 'plugins.json'),
        signal: controller.signal,
      })).rejects.toThrow('下载已取消')

      const groupDir = join(userDir, 'local')
      const leftovers = existsSync(groupDir)
        ? readdirSync(groupDir).filter((name) => name.startsWith('.installing-'))
        : []
      expect(leftovers).toEqual([])
    } finally {
      temp.cleanup()
    }
  })
```

- [ ] **Step 3: 运行测试，确认失败**

Run: `bun test apps/electron/src/main/lib/plugin-registry-service.test.ts`
Expected: FAIL —— `onProgress` 选项尚不存在（`p.stage` 类型错误 / 回调从不触发），新用例红。

- [ ] **Step 4: 给 `InstallAsyncOptions` 增加 `onProgress`，并导出进度类型**

在 `InstallAsyncOptions` 定义（约 `:61`）之前新增导出类型，并扩展接口：

```ts
/** 安装进度事件：解压逐文件（节流）+ 收尾阶段 */
export type InstallProgress =
  | { stage: 'extracting'; processed: number; total: number }
  | { stage: 'finalizing' }

interface InstallAsyncOptions extends InstallUserPluginZipOptions {
  /** 安装期可取消信号；abort 后解压循环抛 DownloadCancelledError */
  signal?: AbortSignal
  /** 覆盖 manifest 中的版本号写入 plugins.json（服务端下载时 manifest 可能无 version） */
  version?: string
  /** 安装进度回调：解压逐文件（按整数百分比节流）+ 解压完成后 finalizing */
  onProgress?: (progress: InstallProgress) => void
}
```

- [ ] **Step 5: 给 `extractPluginZipAsync` 增加节流 `onProgress` 形参**

把现有函数（约 `:797-822`）整体替换为：

```ts
async function extractPluginZipAsync(
  zipPath: string,
  extractDir: string,
  signal?: AbortSignal,
  onProgress?: (processed: number, total: number) => void,
): Promise<void> {
  const zip = new AdmZip(zipPath)
  const entries = zip.getEntries()
  const total = entries.length
  let processed = 0
  let lastPercent = -1

  for (const entry of entries) {
    if (signal?.aborted) throw new DownloadCancelledError()

    const entryName = entry.entryName
    const targetPath = resolve(extractDir, entryName)
    const rel = relative(extractDir, targetPath)

    if (!entryName || entryName.startsWith('/') || rel.startsWith('..') || isAbsolute(rel)) {
      throw new Error('插件 zip 包包含不安全路径')
    }

    if (entry.isDirectory) {
      await fsp.mkdir(targetPath, { recursive: true })
    } else {
      await fsp.mkdir(dirname(targetPath), { recursive: true })
      await fsp.writeFile(targetPath, entry.getData())
    }

    processed += 1
    if (onProgress) {
      const percent = total > 0 ? Math.floor((processed / total) * 100) : 100
      if (percent !== lastPercent) {
        lastPercent = percent
        onProgress(processed, total)
      }
    }
  }
}
```

- [ ] **Step 6: 把 `installUserPluginZipAsync` 改为单趟解压 + rename**

把整个函数（约 `:1001-1060`）替换为：

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
  const marketplaceId = options.marketplaceId ?? 'local'
  // staging 与最终安装目录同盘，收尾只做一次原子 rename（消除第二趟全量拷贝）
  const staging = join(resolved.userDir, marketplaceId, `.installing-${Date.now()}`)

  try {
    await fsp.mkdir(staging, { recursive: true })
    await extractPluginZipAsync(
      zipPath,
      staging,
      options.signal,
      options.onProgress
        ? (processed, total) => options.onProgress!({ stage: 'extracting', processed, total })
        : undefined,
    )
    if (options.signal?.aborted) throw new DownloadCancelledError()
    options.onProgress?.({ stage: 'finalizing' })

    const pluginRoot = resolveExtractedPluginRoot(staging)
    const manifest = normalizeManifest(readJsonFile(join(pluginRoot, '.claude-plugin', 'plugin.json')), basename(pluginRoot))
    const installSlug = resolvePluginInstallSlug(pluginRoot, staging, manifest)
    const pluginId = `user:${marketplaceId}/${installSlug}`
    const targetDir = join(resolved.userDir, marketplaceId, installSlug)
    const targetRel = relative(resolved.userDir, targetDir)
    if (targetRel.startsWith('..') || isAbsolute(targetRel)) {
      throw new Error('插件名称包含不安全路径')
    }
    await assertNoDuplicateExpertGroupsAsync(pluginRoot, pluginId, manifest, resolved, options.signal)
    if (options.signal?.aborted) throw new DownloadCancelledError()

    // 原子收尾：rename 替代 cp（同盘瞬时）
    const existed = existsSync(targetDir)
    if (existed && !(options.overwrite ?? false)) {
      throw new Error(`插件已存在: ${basename(targetDir)}`)
    }
    if (existed) await fsp.rm(targetDir, { recursive: true, force: true })
    await fsp.rename(pluginRoot, targetDir)
    const status: 'installed' | 'overwritten' = existed ? 'overwritten' : 'installed'

    const config = readPluginsConfig({ configPath: resolved.configPath })
    const previous = config.plugins[pluginId]
    const now = new Date().toISOString()
    config.plugins[pluginId] = {
      ...previous,
      enabled: previous?.enabled ?? true,
      installedAt: previous?.installedAt ?? now,
      updatedAt: status === 'overwritten' ? now : previous?.updatedAt,
      sourceMarketplaceId: marketplaceId,
      version: options.version ?? manifest.version,
    }
    writePluginsConfig(config, { configPath: resolved.configPath })

    return {
      ...pluginInfoFromPath('user', targetDir, pluginId, config),
      sourceMarketplaceId: marketplaceId,
    }
  } finally {
    // staging 若已被 rename 走，force 使 rm 安全 no-op；包裹子目录场景清理残留空目录
    await fsp.rm(staging, { recursive: true, force: true })
  }
}
```

- [ ] **Step 7: 删除已无调用方的 `copyPluginAtomicallyAsync`**

删除整个 `async function copyPluginAtomicallyAsync(...) { ... }`（约 `:843-878`）。它是非导出函数，唯一调用方是 Step 6 改写前的 `installUserPluginZipAsync`，现已不再使用。

> 注意：保留同步版 `copyPluginAtomically` 与同步 `installUserPluginZip`（本地上传等场景仍用，本计划不动）。

- [ ] **Step 8: 运行全部安装器测试，确认通过**

Run: `bun test apps/electron/src/main/lib/plugin-registry-service.test.ts`
Expected: PASS —— 新增 2 个用例 + 既有「异步安装结果与同步一致」「signal 已 abort 抛取消」「从 zip 安装」「拒绝重复专家团」等全绿。

- [ ] **Step 9: Commit**

```bash
git add apps/electron/src/main/lib/plugin-registry-service.ts apps/electron/src/main/lib/plugin-registry-service.test.ts
git commit -m "feat(plugin): single-pass extract + install progress callback"
```

---

## Task 3: 专家下载域分阶段广播安装进度

**Files:**
- Modify: `apps/electron/src/main/lib/expert-download-service.ts:130-139`

> 当前安装前只广播一次 `{ status:'installing', progress:100 }`，之后无更新（来回跑条带的根源）。改为：解压前广播 extracting(0)，解压中按回调映射到 0→95，收尾广播 finalizing(95)，完成 done(100)。

- [ ] **Step 1: 替换 installing 广播 + install 调用**

把这段（约 `:130-139`）：

```ts
      // 3. 广播安装中
      broadcastProgress({ groupId, status: 'installing', progress: 100, downloadedBytes: 0, totalBytes: 0 })

      // 4. 异步分片安装（不阻塞主进程；安装期也可取消）
      const plugin = await installUserPluginZipAsync(tempPath, {
        marketplaceId: 'remote',
        overwrite: options.overwrite ?? false,
        signal: controller.signal,
        version: options.version,
      })
```

替换为：

```ts
      // 3. 广播安装开始（解压前）
      broadcastProgress({
        groupId, status: 'installing', installStage: 'extracting',
        progress: 0, processedFiles: 0, totalFiles: 0, downloadedBytes: 0, totalBytes: 0,
      })

      // 4. 异步分片安装（不阻塞主进程；安装期可取消 + 解压真实进度）
      const plugin = await installUserPluginZipAsync(tempPath, {
        marketplaceId: 'remote',
        overwrite: options.overwrite ?? false,
        signal: controller.signal,
        version: options.version,
        onProgress: (p) => {
          if (p.stage === 'extracting') {
            // 解压进度映射到 0→95，给收尾留 95→100
            const progress = p.total > 0 ? Math.round((p.processed / p.total) * 95) : 0
            broadcastProgress({
              groupId, status: 'installing', installStage: 'extracting',
              progress, processedFiles: p.processed, totalFiles: p.total,
              downloadedBytes: 0, totalBytes: 0,
            })
          } else {
            // 解压完成，进入查重/写盘收尾
            broadcastProgress({
              groupId, status: 'installing', installStage: 'finalizing',
              progress: 95, downloadedBytes: 0, totalBytes: 0,
            })
          }
        },
      })
```

> `done(100)` 已由后续既有 `broadcastProgress({ ... status: 'done', progress: 100 ... })` 处理，无需改动。

- [ ] **Step 2: 现有取消注册表测试仍通过（确保无回归）**

Run: `bun test apps/electron/src/main/lib/expert-download-service.test.ts`
Expected: PASS（该文件 mock 了 electron，broadcast 为 no-op；两条取消用例不受影响）。

- [ ] **Step 3: Commit**

```bash
git add apps/electron/src/main/lib/expert-download-service.ts
git commit -m "feat(experts): broadcast staged install progress (extract/finalize)"
```

---

## Task 4: 渲染端纯函数——进度对象映射为展示视图（TDD）

**Files:**
- Create: `apps/electron/src/renderer/experts/card/download-status.ts`
- Test: `apps/electron/src/renderer/experts/card/download-status.test.ts`

> 把「状态 → 文案/颜色/进度条/动作」的判断抽成纯函数，便于单测；组件只做哑渲染（SRP）。

- [ ] **Step 1: 写失败测试**

创建 `apps/electron/src/renderer/experts/card/download-status.test.ts`：

```ts
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
```

- [ ] **Step 2: 运行，确认失败**

Run: `bun test apps/electron/src/renderer/experts/card/download-status.test.ts`
Expected: FAIL —— `download-status.ts` 不存在。

- [ ] **Step 3: 实现纯函数**

创建 `apps/electron/src/renderer/experts/card/download-status.ts`：

```ts
import type { RemoteDownloadProgress } from '@proma/shared'

export type DownloadStatusTone = 'downloading' | 'installing' | 'error' | 'cancelled'
export type DownloadStatusAction = 'cancel' | 'retry' | 'download' | 'none'

export interface DownloadStatusView {
  tone: DownloadStatusTone
  /** 状态点颜色类 */
  dotClass: string
  /** 状态文案 */
  label: string
  /** 右侧百分比文本，null 则不显示 */
  percentText: string | null
  /** 是否显示进度条 */
  showBar: boolean
  /** 进度条填充百分比 0-100 */
  barPercent: number
  /** 右侧动作按钮 */
  action: DownloadStatusAction
}

/** 把下载/安装进度对象映射为底部状态区的展示视图（纯函数，便于单测） */
export function describeDownloadStatus(p: RemoteDownloadProgress): DownloadStatusView {
  if (p.status === 'error') {
    return { tone: 'error', dotClass: 'bg-red-500', label: '下载失败', percentText: null, showBar: false, barPercent: 0, action: 'retry' }
  }
  if (p.status === 'cancelled') {
    return { tone: 'cancelled', dotClass: 'bg-muted-foreground/40', label: '已取消', percentText: null, showBar: false, barPercent: 0, action: 'download' }
  }
  if (p.status === 'done') {
    return { tone: 'installing', dotClass: 'bg-emerald-500', label: '已完成', percentText: null, showBar: false, barPercent: 100, action: 'none' }
  }
  if (p.status === 'installing') {
    if (p.installStage === 'finalizing') {
      return { tone: 'installing', dotClass: 'bg-violet-500', label: '正在校验并写入…', percentText: null, showBar: true, barPercent: p.progress, action: 'cancel' }
    }
    const total = p.totalFiles ?? 0
    const processed = p.processedFiles ?? 0
    const label = total > 0 ? `正在解压 ${processed}/${total}` : '正在解压…'
    return { tone: 'installing', dotClass: 'bg-violet-500', label, percentText: `${p.progress}%`, showBar: true, barPercent: p.progress, action: 'cancel' }
  }
  // downloading（默认）
  return { tone: 'downloading', dotClass: 'bg-blue-500', label: '正在下载', percentText: `${p.progress}%`, showBar: true, barPercent: p.progress, action: 'cancel' }
}
```

- [ ] **Step 4: 运行，确认通过**

Run: `bun test apps/electron/src/renderer/experts/card/download-status.test.ts`
Expected: PASS（6 个用例全绿）。

- [ ] **Step 5: Commit**

```bash
git add apps/electron/src/renderer/experts/card/download-status.ts apps/electron/src/renderer/experts/card/download-status.test.ts
git commit -m "feat(experts): add describeDownloadStatus pure mapper with tests"
```

---

## Task 5: 抽出 `ExpertDownloadStatus` 哑组件并接入卡片

**Files:**
- Create: `apps/electron/src/renderer/experts/card/ExpertDownloadStatus.tsx`
- Modify: `apps/electron/src/renderer/experts/card/ExpertCard.tsx`
- Modify: `apps/electron/src/renderer/experts/card/index.ts`

- [ ] **Step 1: 创建哑组件**

创建 `apps/electron/src/renderer/experts/card/ExpertDownloadStatus.tsx`：

```tsx
import * as React from 'react'
import type { AgentExpertGroupInfo, RemoteDownloadProgress } from '@proma/shared'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { describeDownloadStatus } from './download-status'

interface ExpertDownloadStatusProps {
  group: AgentExpertGroupInfo
  progress: RemoteDownloadProgress
}

/** 卡片底部下载/安装状态区：只前进的确定态进度条 + 阶段文案 + 取消/重试/下载动作 */
export function ExpertDownloadStatus({ group, progress }: ExpertDownloadStatusProps): React.ReactElement {
  const view = describeDownloadStatus(progress)

  const handleCancel = React.useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    void window.electronAPI.cancelRemoteDownload(group.id)
  }, [group.id])

  const handleDownload = React.useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    void window.electronAPI.downloadRemoteExpert(group.id)
  }, [group.id])

  return (
    <div className="mt-3 border-t border-border/60 pt-3" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-2">
        <span className="flex flex-1 items-center gap-1.5 text-xs">
          <span className={cn('inline-block size-1.5 rounded-full', view.dotClass)} />
          <span
            className={cn(
              view.tone === 'error' && 'text-red-600 dark:text-red-400',
              view.tone === 'cancelled' && 'text-muted-foreground',
            )}
          >
            {view.label}
          </span>
        </span>
        {view.percentText && (
          <span className="text-xs tabular-nums text-muted-foreground">{view.percentText}</span>
        )}
        {(view.action === 'retry' || view.action === 'download') && (
          <button
            type="button"
            onClick={handleDownload}
            className="rounded-md border border-border/60 px-2.5 py-0.5 text-xs font-medium transition-colors hover:bg-foreground/[0.06]"
          >
            {view.action === 'retry' ? '重试' : '下载'}
          </button>
        )}
        {view.action === 'cancel' && (
          <button
            type="button"
            onClick={handleCancel}
            title="取消下载"
            className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
          >
            <X size={13} />
          </button>
        )}
      </div>
      {view.showBar && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-200',
              view.tone === 'installing' ? 'bg-violet-500' : 'bg-primary',
            )}
            style={{ width: `${view.barPercent}%` }}
          />
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 在 `ExpertCard.tsx` 顶部加 import**

在现有 import 区（`import { isCardSummonActionable } from '@/experts/utils/summon'` 之后）加：

```tsx
import { ExpertDownloadStatus } from './ExpertDownloadStatus'
```

- [ ] **Step 3: 删除 `ExpertCard.tsx` 中迁出的逻辑与 import**

1）删除不再使用的回调（约 `:31-34`）：

```tsx
  const handleCancelDownload = React.useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    void window.electronAPI.cancelRemoteDownload(group.id)
  }, [group.id])
```

2）把顶部 import 中的 `X` 移除（取消按钮已迁到新组件）。将：

```tsx
import { Bot, Star, Users, X } from 'lucide-react'
```

改为：

```tsx
import { Bot, Star, Users } from 'lucide-react'
```

> 保留 `const isDownloading = ...`（仍用于隐藏召唤按钮）与 `const downloadProgress = useAtomValue(...)`。

- [ ] **Step 4: 用新组件替换整段内联状态区**

把 `ExpertCard.tsx` 中从 `{downloadProgress && (` 开始到对应结束 `)}` 的整段底部状态区 JSX（约 `:128-221`，含状态行、重试/下载/取消按钮、进度条与 `download-progress-slide` 动画）整体替换为：

```tsx
      {downloadProgress && <ExpertDownloadStatus group={group} progress={downloadProgress} />}
```

- [ ] **Step 5: 导出新组件**

在 `apps/electron/src/renderer/experts/card/index.ts` 追加一行：

```ts
export { ExpertDownloadStatus } from './ExpertDownloadStatus'
```

- [ ] **Step 6: 类型检查 / 既有卡片测试通过**

Run: `bun test apps/electron/src/renderer/experts/card/`
Expected: PASS —— `download-status.test.ts`、`card-labels.test.ts` 等全绿；无未使用变量/缺失 import 报错。

- [ ] **Step 7: Commit**

```bash
git add apps/electron/src/renderer/experts/card/ExpertDownloadStatus.tsx apps/electron/src/renderer/experts/card/ExpertCard.tsx apps/electron/src/renderer/experts/card/index.ts
git commit -m "refactor(experts): extract ExpertDownloadStatus, drop indeterminate bar"
```

---

## Task 6: 删除已无引用的滑动动画 keyframe

**Files:**
- Modify: `apps/electron/src/renderer/styles/globals.css:1462-1465`

- [ ] **Step 1: 确认无其它引用**

Run（用 Grep 工具，而非 shell）：搜索 `download-progress-slide`，确认仅剩 `globals.css` 定义处与本计划/历史文档，源代码无引用。
Expected: `ExpertCard.tsx` 已无引用（Task 5 删除）。

- [ ] **Step 2: 删除 keyframe 块**

删除：

```css
@keyframes download-progress-slide {
  0% { transform: translate3d(-120%, 0, 0); }
  100% { transform: translate3d(320%, 0, 0); }
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/electron/src/renderer/styles/globals.css
git commit -m "chore(experts): remove unused download-progress-slide keyframe"
```

---

## Task 7: 全量验证

- [ ] **Step 1: 跑主进程相关单测**

Run: `bun test apps/electron/src/main/lib/plugin-registry-service.test.ts apps/electron/src/main/lib/expert-download-service.test.ts`
Expected: PASS

- [ ] **Step 2: 跑渲染端专家卡片单测**

Run: `bun test apps/electron/src/renderer/experts/card/`
Expected: PASS

- [ ] **Step 3: 人工验证（依赖真实下载，无法单测）**

下载一个大专家团（1.5w+ 文件）：
- 下载阶段：蓝点「正在下载 N%」确定态进度条递增。
- 安装阶段：紫点「正在解压 X/总数」+ 百分比，进度条**只前进** 0→95；随后「正在校验并写入…」短暂停在 95；最后「已完成」并刷新本地列表。
- 全程主进程可交互（切 tab、点击其它卡片不卡顿），安装明显快于改造前（无第二趟拷贝）。
- 安装中点 ✕：广播 cancelled，安装区无 `.installing-*` 残留，卡片回到「下载」。

---

## Self-Review

**1. Spec coverage（对照设计文档 §5.4 / §5.6 / §6.3 / §9.1）：**
- §5.4 单趟解压消除拷贝 → Task 2（解压进同盘 staging + rename，删除 `copyPluginAtomicallyAsync`）。实现较 spec 更简：不预读 manifest，靠「同盘 staging + 解压后 resolve + rename」达成同等单趟效果，行为与既有测试一致。
- §5.4 解压真实进度（节流 onProgress）→ Task 2 Step 5。
- §5.6 安装分阶段广播 extracting(0→95)/finalizing(95)/done(100) → Task 3。
- §6.3 只前进确定态进度条 + 阶段文案 + 组件抽出（SRP）→ Task 4（纯函数）+ Task 5（哑组件 + 卡片瘦身）。
- §6.3 删除来回跑动画 + keyframe → Task 5 Step 4 + Task 6。
- §9.1 契约新增 3 字段 → Task 1。

**2. Placeholder scan：** 无 TBD/TODO；每个代码步骤均给出完整可粘贴代码与确切命令、预期输出。

**3. Type consistency：**
- `InstallProgress` 判别联合（`extracting{processed,total}` / `finalizing`）在 Task 2 定义，Task 3 `onProgress: (p) => p.stage === 'extracting' ? ... : ...` 一致消费。
- `extractPluginZipAsync` 形参 `onProgress(processed, total)`（原始计数）与 install 包装成 `InstallProgress` 一致。
- `RemoteDownloadProgress` 新增 `installStage/processedFiles/totalFiles`（Task 1）与 Task 3 广播、Task 4 `describeDownloadStatus` 读取字段名一致。
- `DownloadStatusView.action` 取值 `cancel|retry|download|none`（Task 4）与 Task 5 组件分支一致。
- 单趟 install 仍调用既有 `resolveExtractedPluginRoot` / `resolvePluginInstallSlug` / `assertNoDuplicateExpertGroupsAsync` / `pluginInfoFromPath`，签名未变。
