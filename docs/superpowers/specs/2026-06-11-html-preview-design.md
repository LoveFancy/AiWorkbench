# HTML 预览能力设计

## 背景

Workmate 的 Agent 已经能在工作区内创建和修改文件，并且现有预览体系支持文件预览、Diff 预览、独立预览 Tab 和自动预览开关。用户希望 Agent 写完 HTML 页面后，应用能够自动打开预览界面，直接可视化展示页面，并在 Agent 连续修改时自动刷新。

第一版只支持静态 HTML 文件预览，不自动启动 Vite、React、Vue 等项目型 dev server，也不实现浏览器级 HMR。

## 目标

- Agent 修改 `.html` 或 `.htm` 文件时，自动打开 Workmate 内置预览。
- Agent 多次修改同一个 HTML 文件时，预览在每次写入成功后自动刷新。
- HTML 内的相对 CSS、JS、图片资源可以基于 HTML 所在目录正常加载。
- 手动点击 HTML 文件的预览入口时，也进入页面预览，而不是代码预览。
- 用户可以拖拽调整对话区和右侧预览区宽度，HTML 预览可拉到接近主内容区全宽。
- 复用现有预览面板、预览 Tab、权限校验和 `proma-file://` 本地文件协议。

## 非目标

- 不自动安装依赖或启动 dev server。
- 不支持 Vite/React/Vue 项目的 HMR。
- 不向 HTML 注入脚本来做 DOM 级热更新。
- 不提供移动端尺寸模拟、截图导出、控制台日志面板等增强功能。
- 不放宽当前工作区和会话的文件访问边界。

## 推荐方案

采用“内嵌静态 HTML 预览”方案：

1. 主进程校验目标 HTML 文件路径是否在当前会话、工作区或用户授权的附加目录内。
2. 校验通过后，主进程把 HTML 所在目录注册为 `proma-file://` 目录 token。
3. 渲染进程使用 iframe 加载该 token 下的 HTML 相对路径。
4. Agent 写入成功后递增预览刷新版本，HTML iframe 通过变更 `key` 或 URL 查询参数自动 reload。

该方案和当前“自动预览修改中文件”开关一致，用户不需要学习新的工作流。

## 用户体验

### 自动预览

当“自动预览修改中文件”开启时：

- Agent 开始修改 HTML 文件时，右侧预览面板切换到该文件。
- 修改尚未完成时，预览显示当前磁盘版本或加载态。
- 工具成功完成后，预览自动刷新到最新内容。
- 同一轮连续多次修改同一个 HTML 文件时，每次成功写入后刷新一次。
- 用户可以拖拽对话区和预览区之间的分隔条，把右侧 HTML 预览拉宽；比例沿用持久化设置。

为了避免连续工具调用造成闪烁，刷新动作使用 150ms trailing debounce。也就是说，连续刷新信号到来时只在最后一次信号后等待 150ms 再 reload；最终状态必须展示最新文件内容。

### 手动预览

用户从文件浏览器或工具结果点击 HTML 文件的“预览”时：

- 打开页面预览。
- 右侧面板和预览 Tab 都使用同一套 HTML 预览组件。
- 工具栏保留刷新、复制路径、系统浏览器打开、作为标签页打开、关闭等能力。

第一版默认不自动打开预览 Tab 或独立窗口。自动预览只打开右侧面板，页面查看空间通过拖拽分隔条解决，保持交互简单。

### 错误状态

预览失败时展示简洁中文错误：

- 文件不存在。
- 路径不在授权范围。
- 文件不是普通文件。
- 本地资源 URL 准备失败。

错误状态提供“重新加载”和“用系统默认应用打开”的入口。越权路径不提供打开入口。

## 架构

### 类型层

在 `packages/shared/src/types/runtime.ts` 增加：

- `HtmlPreviewInput`
- `HtmlPreviewResult`
- `IPC_CHANNELS.PREPARE_HTML_PREVIEW`

类型结构：

```ts
export interface HtmlPreviewInput {
  filePath: string
  access?: FileAccessOptions | string[]
}

export interface HtmlPreviewResult {
  /** iframe 可直接加载的 token 化入口 URL，例如 proma-file://<token>/index.html */
  url: string
  /** 主进程解析后的真实文件路径，仅在已授权后返回 */
  resolvedPath: string
}
```

在 `apps/electron/src/renderer/atoms/preview-atoms.ts` 扩展 `PreviewFile`：

```ts
/** 内容渲染器类型。默认 file，html 表示静态 HTML 页面预览。 */
previewKind?: 'file' | 'html'
```

默认值为 `file`，避免影响现有预览。

`previewKind` 和 `previewOnly` 的关系：

- `previewOnly` 是现有 diff 体系的兼容字段，用来区分“文件内容预览”和“diff 预览”。
- `previewKind` 是新增的内容渲染器分发字段，用来决定内容预览时走普通文件、HTML 页面等哪类 renderer。
- `previewKind: 'html'` 隐含 `previewOnly: true`，HTML 预览不进入 diff 分支。
- 自动构造 `PreviewFile` 时仍显式写入 `previewOnly: true`，让现有工具栏、默认应用打开、Tab 标题等逻辑保持兼容。
- 如果历史状态或外部调用产生 `previewKind: 'html'` 且 `previewOnly: false`，预览分发以 `previewKind` 优先，仍渲染 HTML 页面并跳过 diff。

### 主进程

新增 IPC：`file:prepare-html-preview`。

输入：

- `filePath`
- `access?: FileAccessOptions | string[]`

处理流程：

1. 使用现有 `normalizeFileAccessOptions(access)` 将输入统一规范化为 `FileAccessOptions`。
2. 使用现有 `getAllowedCandidateBasePaths(options)` 得到已授权的候选基础目录。
3. 使用现有 `resolveFilePath()` 解析路径。
4. 使用现有 `isPathAllowed()` 校验访问权限。
5. 确认文件存在、是普通文件，且扩展名为 `.html` 或 `.htm`。
6. 将 HTML 文件所在目录通过 `registerPromaDirectoryPath()` 注册为 `proma-file://` URL。
7. 返回入口 URL，例如 `proma-file://<token>/index.html`，以及已授权的 `resolvedPath`。

相对资源由现有 `local-file-protocol.ts` 的目录 token 处理。目录穿越防护复用该文件中已有的 `isInsideDirectory()` 检查，不新增另一套路径判断。

### Preload

在 `apps/electron/src/preload/index.ts` 暴露：

```ts
prepareHtmlPreview(
  filePath: string,
  access?: FileAccessOptions | string[],
): Promise<HtmlPreviewResult | null>
```

### 渲染进程

新增 `HtmlPreviewFrame` 组件：

- 接收 `filePath`、`sessionId`、`basePaths`、`refreshVersion`。
- 调用 `window.electronAPI.prepareHtmlPreview()` 获取 URL。
- 使用 iframe 加载 URL。
- 当 `refreshVersion` 变化时自动 reload，reload 在组件内通过 `useEffect + setTimeout` 实现 150ms trailing debounce。
- iframe `onLoad` 后清除加载态；iframe `onError` 或 URL 准备失败时进入错误态。
- 对加载中、失败、刷新中提供状态展示。

iframe 使用 sandbox：

```html
sandbox="allow-scripts allow-same-origin allow-forms"
```

第一版不授予 `allow-popups`，避免被预览页面主动打开弹窗。外部链接仍由主窗口已有导航拦截策略处理，普通 http/https 打开到系统浏览器。

`proma-file://` token 当前有 1 小时 TTL。HTML 预览不延长全局 TTL；组件每次手动刷新或自动刷新都会重新调用 `prepareHtmlPreview()`，从而签发新 token。若用户长时间保持预览窗口打开且资源请求因 token 过期失败，iframe 错误态提供“重新加载”，重新加载会重新注册目录 token。

### 布局宽度

右侧 HTML 预览复用 `MainArea` 现有分栏结构和分隔条，但需要调整现有限制。当前拖拽逻辑把 `splitRatio` 固定限制在 `0.3` 到 `0.8`，导致预览区最多只能占 70%，在 HTML 页面预览场景仍偏窄。

第一版改为基于最小像素宽度限制：

- `previewSplitRatioAtom` 继续持久化对话区占比，保持现有用户偏好。
- 拖拽时根据容器实际宽度计算比例，而不是使用固定 `0.3-0.8`。
- 对话区最小宽度建议为 360px，避免输入框和消息列表不可用。
- 预览区最小宽度建议为 320px，避免预览面板工具栏和错误态挤压。
- 因此对话区占比范围为 `360 / containerWidth` 到 `1 - 320 / containerWidth`，并额外 clamp 到 `0.15-0.9`，避免极端窗口尺寸下比例异常。
- 拖拽时临时禁用 iframe pointer events，避免 iframe 吃掉鼠标事件；现有逻辑已经覆盖该问题。

这样在常见桌面宽度下，右侧 HTML 预览可以拉到 80% 以上，用户不需要切换到预览 Tab 就能看较完整的页面。

### 预览分发

在预览内容入口增加轻量分发：

- `previewKind === 'html'` 时渲染 `HtmlPreviewFrame`。
- 其他情况继续渲染现有 `DiffTabContent`。

避免把 HTML iframe 逻辑塞进 `DiffTabContent`，保持现有 diff/Markdown/Office/image 预览职责清晰。

新增轻量分发组件，例如 `PreviewContentRouter`：

- `PreviewPanel` 使用该组件渲染右侧内联预览。
- `PreviewTabContent` 使用该组件渲染预览 Tab。
- `DetachedPreviewApp` 同步使用该组件渲染独立预览窗口。

### 独立预览窗口

`DetachedPreviewWindowInput` 和 `DetachedPreviewWindowData` 需要同步增加：

```ts
previewKind?: 'file' | 'html'
```

`openDetachedPreviewWindow()` 的 signature 去重逻辑也应包含 `previewKind`，避免同一文件的 diff 预览和 HTML 页面预览复用错误窗口。

`DetachedPreviewApp` 当前直接渲染 `DiffTabContent`。实现时需要改为渲染 `PreviewContentRouter`，否则 HTML 场景会走错分支。

### 自动识别

在 `useGlobalAgentListeners.ts` 的自动预览构造逻辑中：

- 文件扩展名为 `.html` 或 `.htm` 时设置 `previewKind: 'html'` 和 `previewOnly: true`。
- 其他文件保持现有行为。
- 工具开始时可以先切换目标文件。
- 工具成功完成时递增预览刷新版本并触发 iframe reload。

### 刷新状态

优先新增独立的 `previewRefreshVersionAtom`，避免继续扩大 `agentDiffRefreshVersionAtom` 的语义范围。

推荐结构：

```ts
export const previewRefreshVersionAtom = atom<Map<string, number>>(new Map())
```

刷新规则：

- Agent 写类工具成功完成时，仍递增 `agentDiffRefreshVersionAtom`，保持现有 diff 列表和文件预览刷新行为。
- 同时递增 `previewRefreshVersionAtom`，供 HTML iframe 等非 diff renderer 监听。
- 手动点击 HTML 预览刷新时，只需要递增 `previewRefreshVersionAtom`。
- 如果为了减少第一版改动临时复用 `agentDiffRefreshVersionAtom`，必须在实现注释中说明这是兼容路径，并在后续重构中迁移到 `previewRefreshVersionAtom`。本设计以新增独立 atom 为准。

## 数据流

```text
Agent Write/Edit/MultiEdit 开始
  -> useGlobalAgentListeners 识别目标 HTML
  -> previewFileMapAtom 设置 previewKind='html'
  -> previewPanelOpenMapAtom 打开右侧预览
  -> HtmlPreviewFrame 请求 prepareHtmlPreview
  -> 主进程校验路径并注册目录 token
  -> iframe 加载 proma-file://token/page.html

Agent 工具成功完成
  -> agentDiffRefreshVersionAtom +1
  -> previewRefreshVersionAtom +1
  -> HtmlPreviewFrame debounce reload
  -> iframe 展示最新文件内容
```

## 安全边界

- 渲染进程不直接接收可任意拼接绝对路径的 file URL。
- `proma-file://` token 由主进程签发，有 TTL 和最大数量限制。
- HTML 所在目录作为资源根，协议处理器复用已有 `isInsideDirectory()` 阻止 `..` 目录穿越。
- `prepareHtmlPreview` 必须复用当前文件访问校验。
- 不允许通过 HTML 预览读取未授权目录。
- Node integration 保持关闭。
- iframe sandbox 不包含 `allow-popups`。

## 测试策略

### 单元测试

- HTML 扩展名识别：`.html`、`.htm` 命中，其他文件不命中。
- 自动预览构造：HTML 文件生成 `previewKind: 'html'`。
- IPC 路径校验：授权路径成功，越权路径返回 null。
- 目录 token：相对资源路径可解析，目录穿越返回 403。
- `previewKind: 'html'` 优先于 `previewOnly: false`，不会进入 diff 分支。
- `DetachedPreviewWindowInput` 的 signature 包含 `previewKind`。

### 组件测试

- `HtmlPreviewFrame` 加载成功时渲染 iframe。
- `previewRefreshVersionAtom` 变化时触发 150ms trailing debounce reload。
- IPC 返回 null 时显示错误态。
- iframe `onError` 时显示错误态并允许重新加载。
- token 失效后点击重新加载会重新调用 `prepareHtmlPreview()`。
- 拖拽分隔条后，HTML iframe 和对话区宽度按像素最小值约束变化，刷新后比例保持。

### 手动验证

1. 让 Agent 写入 `index.html`，自动打开预览。
2. 再让 Agent 修改颜色或文案，确认预览自动刷新。
3. HTML 引用 `style.css`、`script.js`、图片，确认相对资源正常加载。
4. 拖拽对话区和预览区之间的分隔条，确认 HTML 预览能明显变宽，且对话区不会小于可用宽度。
5. 点击“作为标签页打开预览”，确认 Tab 内展示一致。
6. 关闭自动预览后，Agent 写 HTML 不自动打开，但手动预览可用。

## 后续增强

- 增加设备尺寸切换。
- 增加 iframe 内页面错误和 console 日志面板。
- 增加手动刷新快捷键。
- 支持 dev server 型项目预览。
- 支持保存滚动位置或局部刷新。
