# HTML 预览能力设计

## 背景

Workmate 的 Agent 已经能在工作区内创建和修改文件，并且现有预览体系支持文件预览、Diff 预览、独立预览 Tab 和自动预览开关。用户希望 Agent 写完 HTML 页面后，应用能够自动打开预览界面，直接可视化展示页面，并在 Agent 连续修改时自动刷新。

第一版只支持静态 HTML 文件预览，不自动启动 Vite、React、Vue 等项目型 dev server，也不实现浏览器级 HMR。

## 目标

- Agent 修改 `.html` 或 `.htm` 文件时，自动打开 Workmate 内置预览。
- Agent 多次修改同一个 HTML 文件时，预览在每次写入成功后自动刷新。
- HTML 内的相对 CSS、JS、图片资源可以基于 HTML 所在目录正常加载。
- 手动点击 HTML 文件的预览入口时，也进入页面预览，而不是代码预览。
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
4. Agent 写入成功后递增现有刷新版本，HTML iframe 通过变更 `key` 或 URL 查询参数自动 reload。

该方案和当前“自动预览修改中文件”开关一致，用户不需要学习新的工作流。

## 用户体验

### 自动预览

当“自动预览修改中文件”开启时：

- Agent 开始修改 HTML 文件时，右侧预览面板切换到该文件。
- 修改尚未完成时，预览显示当前磁盘版本或加载态。
- 工具成功完成后，预览自动刷新到最新内容。
- 同一轮连续多次修改同一个 HTML 文件时，每次成功写入后刷新一次。

为了避免连续工具调用造成闪烁，刷新动作使用 120-250ms 的 debounce。最终状态必须展示最新文件内容。

### 手动预览

用户从文件浏览器或工具结果点击 HTML 文件的“预览”时：

- 打开页面预览。
- 右侧面板和预览 Tab 都使用同一套 HTML 预览组件。
- 工具栏保留刷新、复制路径、系统浏览器打开、作为标签页打开、关闭等能力。

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

在 `apps/electron/src/renderer/atoms/preview-atoms.ts` 扩展 `PreviewFile`：

```ts
previewKind?: 'file' | 'html'
```

默认值为 `file`，避免影响现有预览。

### 主进程

新增 IPC：`file:prepare-html-preview`。

输入：

- `filePath`
- `access?: FileAccessOptions | string[]`

处理流程：

1. 使用现有 `resolveFilePath()` 解析路径。
2. 使用现有 `isPathAllowed()` 校验访问权限。
3. 确认文件存在且扩展名为 `.html` 或 `.htm`。
4. 将 HTML 文件所在目录通过 `registerPromaDirectoryPath()` 注册为 `proma-file://` URL。
5. 返回入口 URL，例如 `proma-file://<token>/index.html`。

相对资源由现有 `local-file-protocol.ts` 的目录 token 处理。协议处理器必须继续阻止目录穿越。

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
- 当 `refreshVersion` 变化时自动 reload。
- 对加载中、失败、刷新中提供状态展示。

iframe 使用 sandbox：

```html
sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
```

外部链接仍由主窗口已有导航拦截策略处理，普通 http/https 打开到系统浏览器。

### 预览分发

在预览内容入口增加轻量分发：

- `previewKind === 'html'` 时渲染 `HtmlPreviewFrame`。
- 其他情况继续渲染现有 `DiffTabContent`。

避免把 HTML iframe 逻辑塞进 `DiffTabContent`，保持现有 diff/Markdown/Office/image 预览职责清晰。

### 自动识别

在 `useGlobalAgentListeners.ts` 的自动预览构造逻辑中：

- 文件扩展名为 `.html` 或 `.htm` 时设置 `previewKind: 'html'` 和 `previewOnly: true`。
- 其他文件保持现有行为。
- 工具开始时可以先切换目标文件。
- 工具成功完成时递增刷新版本并触发 iframe reload。

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
  -> HtmlPreviewFrame debounce reload
  -> iframe 展示最新文件内容
```

## 安全边界

- 渲染进程不直接接收可任意拼接绝对路径的 file URL。
- `proma-file://` token 由主进程签发，有 TTL 和最大数量限制。
- HTML 所在目录作为资源根，协议处理器阻止 `..` 目录穿越。
- `prepareHtmlPreview` 必须复用当前文件访问校验。
- 不允许通过 HTML 预览读取未授权目录。
- Node integration 保持关闭。

## 测试策略

### 单元测试

- HTML 扩展名识别：`.html`、`.htm` 命中，其他文件不命中。
- 自动预览构造：HTML 文件生成 `previewKind: 'html'`。
- IPC 路径校验：授权路径成功，越权路径返回 null。
- 目录 token：相对资源路径可解析，目录穿越返回 403。

### 组件测试

- `HtmlPreviewFrame` 加载成功时渲染 iframe。
- `refreshVersion` 变化时触发 reload。
- IPC 返回 null 时显示错误态。

### 手动验证

1. 让 Agent 写入 `index.html`，自动打开预览。
2. 再让 Agent 修改颜色或文案，确认预览自动刷新。
3. HTML 引用 `style.css`、`script.js`、图片，确认相对资源正常加载。
4. 点击“作为标签页打开预览”，确认 Tab 内展示一致。
5. 关闭自动预览后，Agent 写 HTML 不自动打开，但手动预览可用。

## 后续增强

- 增加设备尺寸切换。
- 增加 iframe 内页面错误和 console 日志面板。
- 增加手动刷新快捷键。
- 支持 dev server 型项目预览。
- 支持保存滚动位置或局部刷新。
