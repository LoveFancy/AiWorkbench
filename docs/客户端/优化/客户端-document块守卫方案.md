# 客户端 - `type: document` 内容块守卫方案

## 1. 背景与报错现象

与大模型交互时，网关返回 HTTP 400，报文核心如下：

```json
{
  "error": {
    "type": "Bad Request",
    "code": 400,
    "message": "2 validation errors ... 'loc': ('body','messages',2,'content','list[AnthropicContentBlock]',1,'type'), 'msg': \"Input should be 'text','image','tool_use','tool_result','thinking' or 'redacted_thinking'\", 'input': 'document'"
  }
}
```

报文里同一条 `messages[2].content` 是一个内容块数组，其中包含：

- 一个 `tool_result` 块，文本是 `PDF file read: ...nginx离线安装教程-2.pdf (124.6KB)`；
- 紧跟一个 `{ "type": "document", "source": { "type": "base64", "media_type": "application/pdf", "data": "JVBER..." }, "cache_control": {...} }` 块。

网关（注意 `tool_use_id: call_...` 是 OpenAI 风格 id，属于被翻译过的 Anthropic 兼容网关）只接受 `text / image / tool_use / tool_result / thinking / redacted_thinking` 六种块类型，**`document` 不在白名单**，于是 pydantic 校验失败返回 400。

### 1.1 对话框现象

该错误经统一错误分类器 [classifySdkError](file:///d:/AiWorkbench-workmate/apps/electron/src/main/lib/orchestrator/error-classifier.ts#L73-L178) 处理：

- statusCode=400，不属于 429/5xx，[isAutoRetryable](file:///d:/AiWorkbench-workmate/apps/electron/src/main/lib/orchestrator/error-classifier.ts#L182-L195) 返回 false → **不自动重试**；
- 落入 `api_fatal`，经 [friendlyErrorMessage](file:///d:/AiWorkbench-workmate/apps/electron/src/main/lib/adapters/claude-agent-adapter.ts#L257-L267) 命中 `/validation error/i`。

对话框显示一张红色错误卡片：

> **执行错误**
> API 请求格式校验失败，请重试或开启新会话

且因 `api_fatal` 本轮直接终止、不自动重试（即便重试也会再次 400，因为 `document` 块仍留在上下文里）。

## 2. 根因

**`document` 块只可能来自 SDK 内置 `Read` 工具读取二进制文档（PDF/Office 等）。**

- 用户**直接附件**路径不会产生 `document` 块：[buildAgentUserContent](file:///d:/AiWorkbench-workmate/apps/electron/src/main/lib/orchestrator/agent-user-content.ts#L83-L129) 只把受支持图片转成 `image` 块，PDF 等直接 `continue` 跳过；[isValidAgentPromptContent](file:///d:/AiWorkbench-workmate/apps/electron/src/main/lib/adapters/claude-agent-adapter.ts#L42-L59) 也仅允许 `text` / `image`。
- 报文里的 `PDF file read: ...(124.6KB)` 是 **SDK 自带 `Read` 工具**的输出（代码库内搜不到该字符串），它读取二进制文档时会顺带把原生 `document`（base64）块注入到该工具结果的内容里。
- 该 `document` 块随会话上下文发往兼容网关 → 网关不认 `document` → 400。

> 关键认知（本次需求的核心）：**报错的充要条件是「出现 `type: document` 块」，与具体是不是 `.pdf` 文件无关。** 凡是 `type: document` 都会触发，因此守卫必须以**块类型**为不变量，而不是维护一张文件扩展名清单。

## 3. 之前的守卫逻辑（详细分析）

### 3.0 架构概览：守卫在什么位置

当用户发送一条消息，整体流程如下：

```
用户输入 → agent-orchestrator.sendMessage()
  → 构建 queryOptions（含 canUseTool 回调、hooks 注册）
  → claude-agent-adapter.query()
    → 启动 claude.exe 子进程（SDK）
    → SDK 内部迭代，模型每轮调用工具时触发守卫
```

两道旧守卫插入在不同阶段：

- **第 1 道（read-guard）**：挂在 `canUseTool` 回调里，由 orchestrator 传给 SDK。SDK 在**每次工具调用前**调用这个回调。
- **第 2 道（multimodal-guard）**：挂在 `hooks.PreToolUse` 里，由 adapter 直接注册。SDK 在**工具执行前**触发 hook。

### 3.1 背景知识：`canUseTool` 和 `bypassPermissions`

对话框右下角输入框旁的三个权限模式对应 SDK 的三种模式：

| SDK 模式 | 对话框标签 | 含义 |
|----------|-----------|------|
| `bypassPermissions` | **完全自动** | 所有工具调用自动允许，**不经过任何审批**，`canUseTool` 回调不会被调用 |
| `auto` | **自动审批** | SDK 内置分类器自动放行低风险操作，高风险操作才回调 `canUseTool` 让 host 审批 |
| `plan` | **计划模式** | 仅规划不执行，写操作需用户审批通过后才能做 |

**默认模式是 `bypassPermissions`（完全自动）**（见 [PROMA_DEFAULT_PERMISSION_MODE](file:///d:/AiWorkbench-workmate/packages/shared/src/types/agent.ts#L1640)），飞书渠道更是强制使用它。这意味着默认情况下 `canUseTool` 回调**不会被调用**。

---

### 3.2 第 1 道 · `canUseTool` 扩展名/魔数守卫

**文件**：[agent-tool-read-guard.ts](file:///d:/AiWorkbench-workmate/apps/electron/src/main/lib/agent-tool-read-guard.ts)

#### 核心入口：`guardToolUseBeforePermission`

```ts
function guardToolUseBeforePermission(
  toolName: string,        // 工具名，如 'Read' / 'Bash' / 'WebFetch'
  input: Record<string, unknown>,  // 工具参数，如 { file_path: '/path/to/file.pdf' }
  context: RunToolGuardContext,    // 上下文（模型能力、是否自动模式等）
): PermissionResult | null
```

返回 `PermissionResult`（`{ behavior: 'deny', message: string }`）表示拒绝，返回 `null` 表示放行。

#### 上下文 `RunToolGuardContext`

```ts
interface RunToolGuardContext {
  supportsMultimodal: boolean           // 当前模型是否支持多模态（图片理解）
  imagesProvidedAsMultimodal?: boolean  // 用户本轮是否已通过 image 块提供了图片
  autoModeEnabled: boolean              // 是否启用了自动模式
  runHasImageInput: boolean             // 本轮是否有图片输入
  sessionRequiresVisionContext: boolean // 会话是否标记为需要视觉上下文
  cwd?: string                          // 当前工作目录
  canAutoSwitchToMultimodal: () => boolean  // 回调：自动模式能否切换到多模态模型
}
```

这些值由 `agent-orchestrator.ts` 在发起消息时构造，传入 `canUseTool` 和 `permissionService.createCanUseTool`。

#### 三个分支：Read / Bash / WebFetch

**① Read 分支**（`toolName === 'Read'`）：
1. 从 `input.file_path` 提取文件路径，用 `resolveToolPath` 拼成绝对路径
2. 调用 `detectAgentReadableFileKind(absolutePath)` 判定文件类型：
   - 先用**扩展名**（`.pdf` → `pdf`，`.png` → `raster_image`，`.docx` → `office`）
   - 再用**文件魔数**（读文件头几个字节，`%PDF` → pdf，`\x89PNG` → png，`PK` → zip-based Office）
3. 调用 `guardFileRead(kind, context)` 按类型裁决：

| 文件类型 | 裁决 |
|---------|------|
| `text` / `svg_text` / `unknown` | **放行**（return null） |
| `raster_image`（位图） | 根据 `supportsMultimodal` 等上下文拒绝，引导走 `image` 多模态通道 |
| `pdf` / `office` | **无条件拒绝**，提示"请使用文档解析或对应 Skill 提取文本" |
| `binary` | **无条件拒绝**，提示"二进制文件不能作为文本读取" |

**② Bash 分支**（`toolName === 'Bash'`）：
- 调用 `looksLikeBase64BinaryRead(command)` 检查命令是否在用 `base64` / `openssl base64` / `certutil -encode` 读取二进制文件
- 检查逻辑：从命令参数中提取看起来像文件路径的词，再用 `detectAgentReadableFileKind` 判断类型
- 如果命中二进制文件 → 拒绝

**③ WebFetch 分支**（`toolName === 'WebFetch'`）：
- 从 URL 的 pathname 提取扩展名，推断响应类型
- 如果是图片/PDF/Office/二进制 → 拒绝

#### 调用路径

```
agent-orchestrator.ts:808  canUseTool = async (toolName, input, options) => {
agent-orchestrator.ts:819    const readGuardFailure = guardToolUseBeforePermission(...)  ← 这里
                                ↓
agent-tool-read-guard.ts:193  guardToolUseBeforePermission(toolName, input, context)
                                ↓
                    根据 toolName 分派到 Read/Bash/WebFetch 分支
```

同时也在 `agent-permission-service.ts` 的 `createCanUseTool` 里注册（供 auto 模式使用）：

```
agent-permission-service.ts:143  const guardFailure = guardToolUseBeforePermission(...)
```

---

### 3.3 第 2 道 · `PreToolUse` 多模态守卫

**文件**：[agent-tool-multimodal-guard.ts](file:///d:/AiWorkbench-workmate/apps/electron/src/main/lib/agent-tool-multimodal-guard.ts)

#### 核心入口：`buildPreToolUseMultimodalGuardOutput`

```ts
function buildPreToolUseMultimodalGuardOutput(
  input: MultimodalGuardInput
): PreToolUseGuardOutput | null
```

`MultimodalGuardInput` 只有三个字段：`toolName`、`input`（工具参数）、`supportsMultimodal`（模型是否多模态）。

返回 `PreToolUseGuardOutput`：
```ts
{
  continue: false,              // ← 关键：false 表示中止整轮，不是只拒这一个工具
  reason: "...",
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    permissionDecision: 'deny',       // 拒绝这个工具
    permissionDecisionReason: "...",
  }
}
```

#### 判断逻辑：`getBlockedMultimodalToolUse`

1. 只对 `toolName === 'Read'` 生效，其他工具直接返回 null
2. 从 `input.file_path` 或 `input.path` 提取文件路径
3. 调用 `requiresDocumentRead(filePath)` — 检查扩展名是否 `.pdf/.docx/.pptx/.xlsx` 或显式请求了 base64 输出
4. 如果是文档 → 拒绝
5. 如果 `supportsMultimodal === false` 且 `requiresMultimodalRead` 为 true（扩展名是图片/pdf/office 或显式 base64）→ 拒绝
6. 否则 → 放行

#### 调用路径

```
claude-agent-adapter.ts:857  hooks: {
claude-agent-adapter.ts:858    PreToolUse: [{
claude-agent-adapter.ts:859      hooks: [async (input: unknown) => {
                                ↓
claude-agent-adapter.ts:868        const blocked = buildPreToolUseMultimodalGuardOutput({...})
                                ↓
agent-tool-multimodal-guard.ts:97    buildPreToolUseMultimodalGuardOutput(...)
                                ↓
agent-tool-multimodal-guard.ts:71      getBlockedMultimodalToolUse(...)
```

这个 hook 是注册在 `sdk.query({ options: { hooks: { PreToolUse: [...] } } })` 里的，**SDK 在子进程内执行工具前触发**，不在 `canUseTool` 回调链里，所以**不受 `bypassPermissions` 影响**。

---

### 3.4 两道守卫对比总结

| 维度 | 第 1 道 read-guard | 第 2 道 multimodal-guard |
|------|-------------------|--------------------------|
| 挂载点 | `canUseTool` 回调 | `hooks.PreToolUse` |
| 触发时机 | 权限检查阶段 | 工具执行前 |
| 受 bypass 影响？ | **是**（直接绕过） | **否**（hook 始终执行） |
| 覆盖工具 | Read / Bash / WebFetch | 仅 Read |
| 判断方式 | 扩展名 + 魔数 | 仅扩展名 |
| 拒绝后果 | 单工具拒绝，模型可继续 | `continue:false` 中止整轮 |
| 是否有单元测试 | 有 | 有 |

## 4. 守卫为何失效

| # | 失效点 | 说明 |
|---|--------|------|
| 1 | **`bypassPermissions` 绕过 canUseTool** | 默认权限模式即"完全自动"（`bypassPermissions`），飞书强制它。SDK 在该模式下**不会调用 `canUseTool` 回调**，直接放行工具。第 1 道因此对默认模式完全失效。 |
| 2 | **第 2 道是后补的** | 产生本次报错的线上构建很可能早于第 2 道的提交（`3355752a`），当时只有第 1 道、而它在 bypass 下失效 → PDF 被读 → `document` 块 → 400。 |
| 3 | **守卫维度错误（核心）** | 两道守卫都基于「文件扩展名/魔数」预测，是会漏的代理条件。只要某条路径绕过预测（新文档类型、`Bash base64`、`WebFetch`、子代理等）产出了 `document` 块，就仍会 400。正确的不变量是**块类型**（`type: document`），不是文件扩展名。 |
| 4 | **只拦 `Read`** | 第 2 道对非 `Read` 直接返回 null，不覆盖 `Bash base64` / `WebFetch`。 |
| 5 | **无出站兜底** | 没有任何环节在发往网关前剥离不支持的块，也不探测渠道能力。方案完全依赖"提前拦工具"，一旦产出 `document` 块必然 400 且提示无指导性。 |
| 6 | **hook 返回语义偏重** | 第 2 道返回 `continue:false`，会**中止整轮**而非单工具拒绝；模型无法在被拒后改用解析方式恢复。 |

## 5. 新方案：三层防护体系

### 5.1 第 1 层 · 系统 Prompt 黑名单（事前告知）

**目标**：在 Agent 初始化时，通过系统 prompt 提前告知模型网关不支持的内容块类型，引导模型在工具调用阶段就避开 `document` 块，直接走内容提取路径。

**实现位置**：[agent-prompt-builder.ts](file:///d:/AiWorkbench-workmate/apps/electron/src/main/lib/agent-prompt-builder.ts) 的 `buildSystemPrompt`（约第 170 行），已有 `## 多模态与文档读取规则` 章节。

**新增内容**：在现有规则之后追加一段：

```markdown
## 内容块类型黑名单

当前网关**不支持以下内容块类型**，任何包含该类型的请求都会被拒绝：

- **`document`** — 文档二进制块（base64），不可使用。

因此：

- 读取 PDF/Office 文档时，**禁止**直接使用 `Read` 工具把文件内容作为 `document`（base64）块塞入对话。应改为：
  - 优先使用文档解析 Skill（pdfkit / docx / xlsx 等）提取纯文本；
  - 或使用 bash 命令（如 `pdftotext`、`python` 脚本）提取文本；
  - PDF 如需要视觉理解，可转换为图片后以 `image` 块（base64）提供。
- 读取图片时，**必须**使用 `image` 块类型，**不可**使用 `document` 类型。
- 如果上述方式均不可用，请告知用户并提供替代方案，**不要**尝试直接 Read 文档文件。
```

**效果**：模型在工具调用之前就知道 `document` 不可用，会选择更合适的路径（Skill / bash 提取 / 图片转换），从源头减少 `document` 块的产生。

### 5.2 第 2 层 · `PostToolUse` 块类型拦截（事中拦截）

**目标**：在第 1 层失效时（模型仍调用了 Read 产生了 `document` 块），在工具结果发给模型之前将其剥离，防止进入上下文。

**原理**：利用 SDK 的 **`PostToolUse`** 钩子——它能拿到 `tool_response`，并通过返回 `updatedToolOutput` **在工具结果发给模型之前替换它**（见 [sdk.d.ts:2100-2123](file:///d:/AiWorkbench-workmate/node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts#L2100-L2123)）。

- 在 `PostToolUse` 钩子里扫描 `tool_response`，**只要出现任何 `type:'document'` 块就剥离**（PDF/Word/任何来源一视同仁，块类型驱动）；
- 用一段**引导文本块**替换被剥离的 document 块，告诉模型改用内容提取方式；
- **`type:'text'` 块、纯字符串结果、`tool_result` 等正常块一律原样保留，不做任何修改**；
- `PostToolUse` 属于生命周期钩子，**不受 `bypassPermissions` 影响**，正好堵住第 1 道的洞；
- 块类型驱动，天然覆盖所有产出 `document` 块的路径（`Read` / `Bash base64` / `WebFetch` / 子代理），不再依赖扩展名预测。

**替换引导文本**：

> 文件内容读取失败：当前环境不支持 `document` 类型的内容块，文件内容已被剥离。请改用以下方式获取文件内容：
> - 文本类文档：使用文档解析 Skill 抽取纯文本；
> - PDF：使用 bash 命令（如 `pdftotext`）提取文本，或按页转换为图片（`image` 块）后再理解；
> - 图片：以 `image` 块（base64）提供，`type` 必须为 `image`，不可为 `document`。

**替换后模型如何处理**：

`updatedToolOutput` 是**整体替换** `tool_response` 的，不是块级打补丁。`scrubDocumentBlocks` 的策略是：

1. 遍历 `tool_response` 中的每个块，保留 `type:'text'`、`type:'image'`、`tool_result` 等正常块；
2. 剔除所有 `type:'document'` 块；
3. 如果确实剔除了 document 块，在末尾**追加引导文本**作为新的 `{ type:'text', text: '...' }` 块；
4. 返回完整的替换结果。

模型收到替换后的 `tool_response` 后，看到的是一段完整的工具结果，其中包含原始文本部分（如 `"PDF file read: xxx.pdf (124.6KB)"`）加上引导文本。从 Agent 视角，这是一次**成功的工具调用**（没有抛异常），只是结果内容被替换了。模型会正常处理这段结果，并根据引导文本中的指示尝试替代方案（调用 Skill / bash 提取 / 图片转换），进入下一轮工具调用。整个过程对 Agent 执行循环透明，不会中断或报错。

**混合块场景说明**：Anthropic 的 `document` 块是一个**统一的内容块**，将整个文档（PDF 等）的 base64 数据作为单一 block 提供。模型内部自行解析其中的文本、图片、表格等混合内容——host 侧不会收到拆分的 text/image 子块。因此 `tool_response` 中**不会同时出现 `document` 块和由该文档拆分出的 `image` 块**。剥离 `document` 块意味着模型丢失了该文档的全部内容，引导文本的作用就是让模型重新用其他方式获取。如果 `tool_response` 中存在来自其他工具调用的独立 `image` 块（如直接 Read 图片文件），这些块不受影响，照常保留。

### 5.3 第 3 层 · 历史上下文出站净化（事后修复）

**目标**：对于已有 `document` 块的历史会话（旧 SDK session JSONL 中），在发往网关前将其剥离，让历史会话可继续使用。

**困难**：当前架构中，SDK 通过 `claude.exe` 子进程直接向 API 网关发 HTTP 请求。host 侧没有代理层，**无法直接拦截出站 API 请求**。

**可行方案**：

| 方案 | 说明 | 可行性 |
|------|------|--------|
| A. 读取 SDK session JSONL 并清理 `document` 块 | 在 `agent-session-manager.ts` 中已有 `findSdkSessionJsonl` 定位 SDK JSONL 的路径。可在检测到 400（`document` 校验失败）时，读取 JSONL 逐行过滤 `document` 块后写回，然后重试。 | **可行但风险高**：修改 SDK 内部数据格式，SDK 升级可能改变格式。 |
| B. 利用现有 session-not-found 恢复机制 | 当 session-not-found 发生时，现有错误处理会清除 `sdkSessionId` 并回退到 `buildContextPrompt` / `buildRecoveryPrompt` 路径（文本摘要注入，不依赖 SDK JSONL）。`document` 块不会出现在文本摘要中，因此新会话自然干净。 | **对 document 400 无效**：`document` 校验失败走 `api_fatal` 分支，不会触发 `session_not_found` 恢复。用户需手动开新会话。 |
| C. 在 `persistSDKMessages` 时过滤 `document` 块 | 我们自己的 JSONL 持久化层可以过滤 `document` 块。但 SDK 的恢复（resume）使用的是 SDK 自己的 JSONL，不是我们的。 | **对 resume 路径无效**。 |

**结论**：**不新增专门的 JSONL 清理逻辑**。原因：

1. 第 1 层（系统 prompt）+ 第 2 层（PostToolUse 钩子）可以确保**新产生的消息不会包含 `document` 块**；
2. 对于已有 `document` 块的历史会话，`document` 导致的 400 被 `classifySdkError` 分类为 `api_fatal`（非 `session_not_found`），不会自动清除 `sdkSessionId` 触发恢复。此时用户需**手动开启新会话**绕过——新会话中 `document` 块不会出现在文本摘要回填中，自然干净。该场景在守卫上线后将不再新增，属于过渡期问题；
3. 直接修改 SDK JSONL 引入维护风险，且该场景（历史会话带 `document` 块）在守卫上线后将不再新增，属于过渡期问题。

### 5.4 职责重排

- **第 1 层（系统 prompt）** = 事前告知，引导模型走正确路径，从源头减少 `document` 块产生。
- **第 2 层（PostToolUse 钩子）** = 事中拦截，块类型驱动、不受 bypass 影响，兜底最后一公里。
- **第 3 层（历史净化）** = 事后修复，历史会话中 `document` 导致的 400 走 `api_fatal` 不会自动恢复，用户需手动开新会话。守卫上线后该场景不再新增，属于过渡期问题。
- 现有 **PreToolUse / canUseTool 扩展名守卫降级为"早期友好拦截"**：能提前拒就提前拒（节省一次工具执行），但**正确性不再依赖它那张扩展名清单**。四者并存、互为补充。

## 6. 拟新增/改动点

| 文件 | 改动 |
|------|------|
| [agent-prompt-builder.ts](file:///d:/AiWorkbench-workmate/apps/electron/src/main/lib/agent-prompt-builder.ts) | 在 `## 多模态与文档读取规则` 章节后追加 `## 内容块类型黑名单`，明确告知模型不支持的 `document` 类型。 |
| 新增 `apps/electron/src/main/lib/agent-tool-document-scrub.ts` | 纯函数 `scrubDocumentBlocks(toolResponse)` + `buildPostToolUseDocumentScrubOutput(...)`：递归识别并剥离 `type:'document'` 块，保留 `type:'text'`、`type:'image'`、`tool_result` 等其他块，剔除后末尾追加引导文本块；字符串类型直接原样返回。返回是否命中 + 替换后的 output。 |
| [claude-agent-adapter.ts](file:///d:/AiWorkbench-workmate/apps/electron/src/main/lib/adapters/claude-agent-adapter.ts#L856-L877) `hooks` | 新增 `PostToolUse` 钩子，命中 document 块时返回 `{ hookSpecificOutput: { hookEventName:'PostToolUse', updatedToolOutput } }`。 |
| 新增 `agent-tool-document-scrub.test.ts` | 覆盖多种 `tool_response` 结构。 |

> 本次**不**改动以下文件：
> - [error-classifier.ts](file:///d:/AiWorkbench-workmate/apps/electron/src/main/lib/orchestrator/error-classifier.ts)（用户已确认：暂不为该类校验错误新增专门友好提示）；
> - [agent-session-manager.ts](file:///d:/AiWorkbench-workmate/apps/electron/src/main/lib/agent-session-manager.ts)（不新增 SDK JSONL 清理逻辑，历史会话需用户手动开新会话绕过）。

## 7. 风险与取证计划

内置 `Read` 工具的 `tool_response` **运行时具体结构**无法纯静态确定（可能是数组、`{ content: [...] }`、纯文本或更深的嵌套）。因此：

1. 先用 **TDD** 写覆盖多种结构的失败测试（数组块 / `{content:[...]}` / 文本 / 嵌套 / 保留 `image` 块）；
2. 实现 `scrubDocumentBlocks` 做到对未知结构**安全保守**（无法识别就原样返回，绝不破坏正常结果）；
3. 在 `PostToolUse` 钩子加一次性运行时诊断日志，取证内置 `Read` 的真实 `tool_response` 结构，确认 `updatedToolOutput` 替换确实阻止 `document` 块外发后再移除日志。

## 8. 验证

- `cd apps/electron && bun test agent-tool-document-scrub`；
- `bun run typecheck`；
- 复现路径：bypassPermissions 模式下让 Agent `Read` 一个 PDF，确认：
  - 系统 prompt 包含黑名单说明；
  - PostToolUse 钩子剥离 `document` 块；
  - 不再 400，且模型收到引导文本后改走内容提取。

## 9. 待办

1. 在系统 prompt 中追加内容块类型黑名单。
2. 写 `scrubDocumentBlocks` 失败测试（多结构）。
3. 实现 `scrubDocumentBlocks` + `buildPostToolUseDocumentScrubOutput`。
4. 在 adapter `hooks` 接入 `PostToolUse`。
5. 运行时取证 `Read` 的 `tool_response` 结构。
6. 跑测试 + 类型检查。