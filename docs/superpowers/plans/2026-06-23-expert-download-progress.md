# 专家下载进度条与可取消 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 消除专家下载安装期 + 安装后的主进程阻塞（cpSync + 全量同步扫描），并将 ExpertCard 下载 UI 从右上角小角落移到卡片底部独立状态区。

**Architecture:** 新增异步路径（`*Async` 后缀），不改动现有同步函数。`plugin-registry-service.ts` 新增 `copyPluginAtomicallyAsync`、`listInstalledPluginsAsync`、`assertNoDuplicateExpertGroupsAsync`；`agent-expert-group-manager.ts` 新增 `listAgentExpertGroupsAsync`；`ipc.ts` 的 `LIST_EXPERT_GROUPS` handler 切换为异步版；`ExpertCard.tsx` 重写下载进度 UI 为底部状态区。

**Tech Stack:** TypeScript, Node.js fs.promises, React + Jotai, Tailwind CSS

**Status:** 以下组件已落地，无需改动：`expert-download-service.ts`（完整）、`useExpertDownloadProgressBridge.ts`（完整）、`expertDownloadProgressAtom`（完整）、`useSummonExpert.ts` 取消/失败区分（完整）、`CANCEL_DOWNLOAD` handler（完整）、`RemoteDownloadProgress.status` 含 `'cancelled'`（完整）。

---

## File Structure

| 文件 | 改动 | 职责 |
| --- | --- | --- |
| `plugin-registry-service.ts` | 新增 3 个函数 + 修改 2 行调用 | 异步原子拷贝、异步全量扫描、异步查重 |
| `agent-expert-group-manager.ts` | 新增 1 个函数 + 修改 import | 异步专家团列表 |
| `ipc.ts` | 修改 1 行 | LIST_EXPERT_GROUPS handler 切换异步版 |
| `ExpertCard.tsx` | 重写下载 UI 区域 | 底部状态区 inline 进度条 |

---

### Task 1: 新增 `copyPluginAtomicallyAsync`（消除 cpSync 阻塞）

**Files:**
- Modify: `d:\AiWorkbench\apps\electron\src\main\lib\plugin-registry-service.ts`

**Context:** 同步版 `copyPluginAtomically` 在 [第 805 行](file:///d:/AiWorkbench/apps/electron/src/main/lib/plugin-registry-service.ts#L805) 使用 `cpSync` + `rmSync` + `renameSync`，大包拷贝时仍会冻结主进程。新增异步版，逻辑与同步版完全一致，仅将同步 fs 调用替换为 `fsp.*` 并增加 `signal` 检查点。

- [ ] **Step 1: 在 `copyPluginAtomically` 之前插入异步版**

位置：`copyPluginAtomically` 函数之前（第 805 行之前）。**注意：** 函数名开头不带 `export`，是模块内部函数，与同步版一致。

```ts
async function copyPluginAtomicallyAsync(
  sourceDir: string,
  targetDir: string,
  overwrite: boolean,
  signal?: AbortSignal,
): Promise<'installed' | 'overwritten'> {
  if (signal?.aborted) throw new DownloadCancelledError()
  const existed = existsSync(targetDir)
  if (existed && !overwrite) throw new Error(`插件已存在: ${basename(targetDir)}`)

  const parent = dirname(targetDir)
  const tmp = join(parent, `.${basename(targetDir)}.installing-${Date.now()}`)
  await fsp.mkdir(parent, { recursive: true })
  await fsp.rm(tmp, { recursive: true, force: true })
  await fsp.cp(sourceDir, tmp, { recursive: true })

  if (signal?.aborted) {
    await fsp.rm(tmp, { recursive: true, force: true })
    throw new DownloadCancelledError()
  }

  try {
    if (existed) await fsp.rm(targetDir, { recursive: true, force: true })
    await fsp.rename(tmp, targetDir)
  } catch (error) {
    await fsp.rm(tmp, { recursive: true, force: true })
    if (!existed) await fsp.rm(targetDir, { recursive: true, force: true })
    throw error
  }

  return existed ? 'overwritten' : 'installed'
}
```

- [ ] **Step 2: 运行现有测试确认未破坏同步版**

```powershell
cd d:\AiWorkbench\apps\electron
bun test src/main/lib/plugin-registry-service.test.ts
```

Expected: 所有现有测试仍 PASS。

- [ ] **Step 3: Commit**

```bash
git add apps/electron/src/main/lib/plugin-registry-service.ts
git commit -m "feat: add copyPluginAtomicallyAsync for non-blocking plugin copy"
```

---

### Task 2: `installUserPluginZipAsync` 内部切换为异步拷贝

**Files:**
- Modify: `d:\AiWorkbench\apps\electron\src\main\lib\plugin-registry-service.ts`

**Context:** `installUserPluginZipAsync` 在第 935 行调用同步 `copyPluginAtomically(...)`，替换为 `await copyPluginAtomicallyAsync(..., options.signal)`。

- [ ] **Step 1: 替换调用**

找到第 935 行（当前代码）：

```ts
    const status = copyPluginAtomically(pluginRoot, targetDir, options.overwrite ?? false)
```

替换为：

```ts
    const status = await copyPluginAtomicallyAsync(pluginRoot, targetDir, options.overwrite ?? false, options.signal)
```

- [ ] **Step 2: 运行测试**

```powershell
cd d:\AiWorkbench\apps\electron
bun test src/main/lib/plugin-registry-service.test.ts
```

Expected: 所有测试 PASS。

- [ ] **Step 3: Commit**

```bash
git add apps/electron/src/main/lib/plugin-registry-service.ts
git commit -m "feat: use async copy in installUserPluginZipAsync to prevent UI freeze"
```

---

### Task 3: 新增 `listInstalledPluginsAsync`（异步全量扫描）

**Files:**
- Modify: `d:\AiWorkbench\apps\electron\src\main\lib\plugin-registry-service.ts`

**Context:** 同步版 `listInstalledPlugins` 在 [第 588 行](file:///d:/AiWorkbench/apps/electron/src/main/lib/plugin-registry-service.ts#L588) 使用 `readdirSync` + `pluginInfoFromPath`（内部 `readFileSync` 扫描 skills/commands/agents/mcp/expert-group）。异步版逐插件 `await` 让出事件循环，保持 UI 响应。`pluginInfoFromPath` 内部同步读取单个插件，逐插件 await 已足够（插件数 ≤ 20）。

- [ ] **Step 1: 在 `listInstalledPlugins` 之前插入异步版**

位置：`listInstalledPlugins` 函数之前（第 588 行之前）。

```ts
async function listInstalledPluginsAsync(paths?: PluginRegistryPaths): Promise<AgentPluginInfo[]> {
  const resolved = registryPaths(paths)
  const config = readPluginsConfig({ configPath: resolved.configPath })
  const plugins: AgentPluginInfo[] = []

  if (existsSync(resolved.builtinDir)) {
    const builtinEntries = await fsp.readdir(resolved.builtinDir, { withFileTypes: true })
    for (const entry of builtinEntries) {
      if (!entry.isDirectory()) continue
      plugins.push(pluginInfoFromPath('builtin', join(resolved.builtinDir, entry.name), `builtin:${entry.name}`, config))
      // 逐插件让出事件循环，保持 UI 响应
      await new Promise((resolve) => setImmediate(resolve))
    }
  }

  if (existsSync(resolved.userDir)) {
    const marketEntries = await fsp.readdir(resolved.userDir, { withFileTypes: true })
    for (const market of marketEntries) {
      if (!market.isDirectory()) continue
      const marketDir = join(resolved.userDir, market.name)
      const userEntries = await fsp.readdir(marketDir, { withFileTypes: true })
      for (const entry of userEntries) {
        if (!entry.isDirectory()) continue
        const pluginId = `user:${market.name}/${entry.name}`
        const plugin = pluginInfoFromPath('user', join(marketDir, entry.name), pluginId, config)
        plugins.push({
          ...plugin,
          sourceMarketplaceId: plugin.sourceMarketplaceId ?? market.name,
        })
        // 逐插件让出事件循环
        await new Promise((resolve) => setImmediate(resolve))
      }
    }
  }

  return plugins.sort((a, b) => a.id.localeCompare(b.id))
}
```

- [ ] **Step 2: 运行测试**

```powershell
cd d:\AiWorkbench\apps\electron
bun test src/main/lib/plugin-registry-service.test.ts
```

Expected: 所有测试 PASS。

- [ ] **Step 3: Commit**

```bash
git add apps/electron/src/main/lib/plugin-registry-service.ts
git commit -m "feat: add listInstalledPluginsAsync for non-blocking plugin scan"
```

---

### Task 4: 新增 `assertNoDuplicateExpertGroupsAsync` + 替换调用

**Files:**
- Modify: `d:\AiWorkbench\apps\electron\src\main\lib\plugin-registry-service.ts`

**Context:** `installUserPluginZipAsync` 在第 933 行调用同步 `assertNoDuplicateExpertGroups(...)`，内部调 `listInstalledPlugins` 全量同步扫描。替换为异步版。

- [ ] **Step 1: 在 `assertNoDuplicateExpertGroups` 之前插入异步版**

位置：`assertNoDuplicateExpertGroups` 函数之前（第 827 行之前）。

```ts
async function assertNoDuplicateExpertGroupsAsync(
  pluginPath: string,
  pluginId: string,
  manifest: AgentPluginManifest,
  paths: Required<PluginRegistryPaths>,
  _signal?: AbortSignal,
): Promise<void> {
  const uploadedGroups = discoverExpertGroups(pluginPath, pluginId, manifest.name, true, manifest)
  if (uploadedGroups.length === 0) return

  const existingGroups = new Map<string, AgentPluginCapability>()
  const plugins = await listInstalledPluginsAsync(paths)
  for (const plugin of plugins) {
    for (const capability of plugin.capabilities) {
      if (capability.type === 'expert-group' && capability.sourcePluginId !== pluginId) {
        existingGroups.set(capability.name, capability)
      }
    }
  }

  for (const group of uploadedGroups) {
    const existing = existingGroups.get(group.name)
    if (!existing) continue
    throw new Error(`已存在相同专家团 ID: ${group.name}（来源: ${existing.sourceLabel}）`)
  }
}
```

- [ ] **Step 2: 替换 `installUserPluginZipAsync` 中的调用**

找到第 933 行（当前代码）：

```ts
    assertNoDuplicateExpertGroups(pluginRoot, pluginId, manifest, resolved)
```

替换为：

```ts
    await assertNoDuplicateExpertGroupsAsync(pluginRoot, pluginId, manifest, resolved, options.signal)
```

- [ ] **Step 3: 运行测试**

```powershell
cd d:\AiWorkbench\apps\electron
bun test src/main/lib/plugin-registry-service.test.ts
```

Expected: 所有测试 PASS。

- [ ] **Step 4: Commit**

```bash
git add apps/electron/src/main/lib/plugin-registry-service.ts
git commit -m "feat: use async duplicate check and plugin scan in install flow"
```

---

### Task 5: 新增 `listAgentExpertGroupsAsync`（消除安装后刷新阻塞）

**Files:**
- Modify: `d:\AiWorkbench\apps\electron\src\main\lib\agent-expert-group-manager.ts`

**Context:** 同步版 `listAgentExpertGroups` 在 [第 208 行](file:///d:/AiWorkbench/apps/electron/src/main/lib/agent-expert-group-manager.ts#L208) 调用 `listInstalledPlugins`。新增异步版，逻辑与同步版完全一致，仅将 `listInstalledPlugins` 替换为 `listInstalledPluginsAsync`。

- [ ] **Step 1: 修改 import，添加 `listInstalledPluginsAsync`**

当前第 11 行：

```ts
import { listInstalledPlugins } from './plugin-registry-service'
```

替换为：

```ts
import { listInstalledPlugins, listInstalledPluginsAsync } from './plugin-registry-service'
```

- [ ] **Step 2: 在 `listAgentExpertGroups` 之后插入异步版**

位置：`listAgentExpertGroups` 函数之后（第 247 行之后，`getAgentExpertGroup` 之前）。

```ts
export async function listAgentExpertGroupsAsync(paths?: ExpertGroupRegistryPaths): Promise<AgentExpertGroupInfo[]> {
  const groups: AgentExpertGroupInfo[] = []
  const plugins = await listInstalledPluginsAsync(paths)
  for (const plugin of plugins) {
    const capabilities = plugin.capabilities.filter((capability) => capability.type === 'expert-group' && capability.relativePath)
    for (const capability of capabilities) {
      const filePath = join(plugin.path, capability.relativePath!)
      const { manifest, issues } = readExpertManifest(filePath, plugin.name)
      if (!manifest) {
        groups.push({
          id: capability.name,
          name: plugin.name,
          mainRole: { name: '', prompt: '' },
          expertType: capability.expertType,
          sourcePluginId: plugin.id,
          sourceLabel: plugin.name,
          sourcePluginVersion: plugin.version,
          sourcePluginKind: plugin.kind,
          sourcePluginPath: plugin.path,
          filePath,
          enabled: plugin.enabled,
          status: statusFor(plugin.enabled, issues),
          issues,
        })
        continue
      }

      const allIssues = [
        ...issues,
        ...validateExpertReferences(plugin.path, manifest, paths),
        ...(capability.issue ? [capability.issue] : []),
      ]
      groups.push({
        ...manifest,
        expertType: manifest.expertType ?? capability.expertType,
        sourcePluginId: plugin.id,
        sourceLabel: plugin.name,
        sourcePluginVersion: plugin.version,
        sourcePluginKind: plugin.kind,
        sourcePluginPath: plugin.path,
        filePath,
        enabled: plugin.enabled,
        status: statusFor(plugin.enabled, allIssues),
        issues: allIssues,
      })
    }
  }
  return groups.sort((a, b) => a.name.localeCompare(b.name))
}
```

- [ ] **Step 3: 运行测试**

```powershell
cd d:\AiWorkbench\apps\electron
bun test src/main/lib/agent-expert-group-manager.test.ts
```

Expected: 所有测试 PASS。

- [ ] **Step 4: Commit**

```bash
git add apps/electron/src/main/lib/agent-expert-group-manager.ts
git commit -m "feat: add listAgentExpertGroupsAsync for non-blocking expert group refresh"
```

---

### Task 6: `LIST_EXPERT_GROUPS` handler 切换为异步版

**Files:**
- Modify: `d:\AiWorkbench\apps\electron\src\main\ipc.ts`

**Context:** `LIST_EXPERT_GROUPS` handler 在 [第 2471-2475 行](file:///d:/AiWorkbench/apps/electron/src/main/ipc.ts#L2471-L2475) 调用同步 `listAgentExpertGroups`，安装后全量同步扫描阻塞主进程。切换为异步版。

- [ ] **Step 1: 替换 handler 中的调用**

当前第 2471-2475 行：

```ts
  ipcMain.handle(
    AGENT_IPC_CHANNELS.LIST_EXPERT_GROUPS,
    async (): Promise<AgentExpertGroupInfo[]> => {
      const { listAgentExpertGroups } = await import('./lib/agent-expert-group-manager')
      return listAgentExpertGroups()
    }
  )
```

替换为：

```ts
  ipcMain.handle(
    AGENT_IPC_CHANNELS.LIST_EXPERT_GROUPS,
    async (): Promise<AgentExpertGroupInfo[]> => {
      const { listAgentExpertGroupsAsync } = await import('./lib/agent-expert-group-manager')
      return listAgentExpertGroupsAsync()
    }
  )
```

> 注意：`getAgentExpertGroup` 仍使用同步版 `listAgentExpertGroups`（[第 261 行](file:///d:/AiWorkbench/apps/electron/src/main/lib/agent-expert-group-manager.ts#L261)），单条查询极快，不需要异步化，不受影响。

- [ ] **Step 2: 验证编译**

```powershell
cd d:\AiWorkbench\apps\electron
npx tsc --noEmit --project tsconfig.json
```

Expected: 无编译错误。

- [ ] **Step 3: Commit**

```bash
git add apps/electron/src/main/ipc.ts
git commit -m "feat: use async expert group listing to prevent post-install UI freeze"
```

---

### Task 7: ExpertCard 下载 UI 重写为底部状态区

**Files:**
- Modify: `d:\AiWorkbench\apps\electron\src\renderer\experts\card\ExpertCard.tsx`

**Context:** 当前下载进度 UI 在 [第 89-128 行](file:///d:/AiWorkbench/apps/electron/src/renderer/experts/card/ExpertCard.tsx#L89-L128)，位于 `absolute right-4 top-4` 的右上角区域，与收藏星争位、视觉层级弱。移到卡片底部 `border-top` 分隔的独立状态区，覆盖完整状态机（downloading / installing / error / cancelled）。

- [ ] **Step 1: 移除右上角下载进度区域，保留召唤按钮**

把第 89-128 行的 `absolute right-4 top-4` div 内的下载 UI 移除，仅保留召唤按钮（非下载态时显示）：

将第 89-130 行：

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

替换为：

```tsx
        <div className="absolute right-4 top-4 flex items-center gap-2 pr-5">
          {!isDownloading && onSummon && (
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
          )}
        </div>
```

- [ ] **Step 2: 在卡片底部（`</div>` 闭合前）添加底部状态区**

在卡片最外层 `</div>` 之前（即 `</button>` 的 `</div>` 闭合后、卡片根 div 闭合前），插入：

```tsx
      {downloadProgress && (
        <div className="mt-3 border-t border-border/60 pt-3" onClick={(e) => e.stopPropagation()}>
          {/* 状态行 */}
          <div className="flex items-center gap-2">
            <span className="flex flex-1 items-center gap-1.5 text-xs">
              {downloadProgress.status === 'error' ? (
                <>
                  <span className="inline-block size-1.5 rounded-full bg-red-500" />
                  <span className="text-red-600 dark:text-red-400">下载失败</span>
                </>
              ) : downloadProgress.status === 'cancelled' ? (
                <>
                  <span className="inline-block size-1.5 rounded-full bg-muted-foreground/40" />
                  <span className="text-muted-foreground">已取消</span>
                </>
              ) : downloadProgress.status === 'installing' ? (
                <>
                  <span className="inline-block size-1.5 rounded-full bg-violet-500" />
                  <span>正在安装…</span>
                </>
              ) : (
                <>
                  <span className="inline-block size-1.5 rounded-full bg-blue-500" />
                  <span>正在下载</span>
                </>
              )}
            </span>
            {downloadProgress.status === 'downloading' && (
              <span className="text-xs tabular-nums text-muted-foreground">
                {downloadProgress.progress}%
              </span>
            )}
            {downloadProgress.status === 'error' ? (
              <button
                type="button"
                onClick={() => { void window.electronAPI.downloadRemoteExpert(group.id) }}
                className="rounded-md border border-border/60 px-2.5 py-0.5 text-xs font-medium transition-colors hover:bg-foreground/[0.06]"
              >
                重试
              </button>
            ) : downloadProgress.status === 'cancelled' ? (
              <button
                type="button"
                onClick={() => { void window.electronAPI.downloadRemoteExpert(group.id) }}
                className="rounded-md border border-border/60 px-2.5 py-0.5 text-xs font-medium transition-colors hover:bg-foreground/[0.06]"
              >
                下载
              </button>
            ) : (
              <button
                type="button"
                onClick={handleCancelDownload}
                title="取消下载"
                className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* 进度条 */}
          {(downloadProgress.status === 'downloading' || downloadProgress.status === 'installing') && (
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  'h-full rounded-full',
                  downloadProgress.status === 'installing'
                    ? 'w-2/5 bg-gradient-to-r from-transparent via-violet-500 to-transparent'
                    : 'bg-primary transition-all duration-200',
                )}
                style={
                  downloadProgress.status === 'installing'
                    ? { animation: 'download-progress-slide 1.1s ease-in-out infinite' }
                    : { width: `${downloadProgress.progress}%` }
                }
              />
            </div>
          )}
        </div>
      )}
```

- [ ] **Step 3: 添加 `download-progress-slide` keyframe 到全局 CSS**

需要为不确定态进度条添加流动动画 keyframe。在 [`globals.css`](file:///d:/AiWorkbench/apps/electron/src/renderer/styles/globals.css) 末尾（`@keyframes session-minimap-content-in` 之后）追加：

```css
@keyframes download-progress-slide {
  0% { transform: translateX(-120%); }
  100% { transform: translateX(320%); }
}
```

- [ ] **Step 4: 验证编译**

```powershell
cd d:\AiWorkbench\apps\electron
npx tsc --noEmit --project tsconfig.json
```

Expected: 无编译错误。

- [ ] **Step 5: Commit**

```bash
git add apps/electron/src/renderer/experts/card/ExpertCard.tsx
git commit -m "feat: move download progress to bottom status area with full state machine"
```

---

## 验证清单

实施完成后运行：

1. **主进程单测：**
   ```powershell
   cd d:\AiWorkbench\apps\electron
   bun test src/main/lib/plugin-registry-service.test.ts
   bun test src/main/lib/agent-expert-group-manager.test.ts
   ```

2. **TypeScript 编译：**
   ```powershell
   cd d:\AiWorkbench\apps\electron
   npx tsc --noEmit --project tsconfig.json
   ```

3. **手动验证（Electron 启动后）：**
   - 专家 tab 下载按钮 → 卡片底部显示进度条 + 百分比 + 取消
   - 安装阶段 → 卡片底部显示流动条纹不确定态 + 取消
   - 取消 → 短暂显示"已取消"后回退
   - 召唤未下载专家 → 下载完成后自动开会话（行为不变）
   - 下载安装期间 UI 可交互（不卡死）