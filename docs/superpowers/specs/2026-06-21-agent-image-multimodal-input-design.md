# Agent 图片多模态输入根本修复方案

## 背景

用户在 Agent 会话中切换到已标记为多模态的模型（如 `saas-kimi-k26`）后发送图片，模型仍然回复“当前模型不支持图片理解”，并触发 AskUser 让用户选择 OCR、查看元信息等降级处理方式。

从当前代码链路看，问题不在模型配置本身。`saas-kimi-k26` 在默认模型表中已配置 `supportsMultimodal: true`，设置页也能展示“多模态”状态。真正的问题是：Agent 发送图片时，图片只被保存为文件路径并拼进文本 prompt，未作为 SDK 原生图片内容块传给模型。

## 当前链路与根因

前端发送图片时：

1. 将图片保存到 Agent session 目录。
2. 在用户消息前拼接 `<attached_files>` 文本块：

   ```text
   <attached_files>
   - 3.png: C:\Users\...\3.png
   </attached_files>
   ```

3. 后端仍把用户消息构造成纯文本 SDK user message：

   ```ts
   content: [{ type: 'text', text: userMessage }]
   ```

这意味着模型只看到“这里有一张图片文件路径”，没有收到图片像素内容。模型若尝试使用 `Read` 读取图片，会经过两层保护：

- `apps/electron/src/main/lib/agent-tool-read-guard.ts`：Proma 自己的 `canUseTool` 前置守卫，按文件类型拒绝把图片当普通文本读取。
- `apps/electron/src/main/lib/agent-tool-multimodal-guard.ts`：SDK `PreToolUse` hook 守卫，用于在 SDK 自定义 spawn 路径下拦截不支持多模态模型的图片读取。

最终模型会误判为“当前模型不支持多模态”或请求用户选择 OCR 等替代方式。

## 目标

当用户使用支持多模态的 Agent 模型发送图片时，后端应将图片作为 SDK 原生 image content block 注入本轮用户消息，让模型直接接收图片内容并基于视觉信息回答。

同时保留现有文件路径展示和历史可读性，避免将大段 base64 长期写入 JSONL。

## 非目标

- 不改变 Chat 模式的图片发送链路。
- 不把所有二进制文件都纳入多模态输入；本方案只处理常见 raster image。
- 不取消 `Read` 图片守卫；图片仍不能通过 `Read` 当文本读取。
- 不在前端通过 IPC 传递完整图片 base64；图片已保存到 session 目录，后端按路径读取即可。

## 方案概述

将 Agent 用户输入从“纯字符串 prompt”升级为“多模态 content blocks”：

```ts
[
  { type: 'text', text: '请识别这张图片' },
  {
    type: 'image',
    source: {
      type: 'base64',
      media_type: 'image/png',
      data: '...'
    }
  }
]
```

本地 SDK 类型显示 `SDKUserMessage['message']['content']` 支持数组；`assistant.d.ts` 中 `pushPrompt(content: string | SDKUserMessage['message']['content'])` 也说明该方向可行。

## 详细设计

### 1. 扩展共享类型

修改 `packages/shared/src/types/agent-provider.ts`：

- `AgentQueryInput.prompt` 从 `string` 放宽为 `string | AgentUserContentBlock[]`。
- `SDKUserMessageInput.message.content` 暂不放宽，继续保持 `string`。

新增类型：

```ts
export interface AgentTextContentBlock {
  type: 'text'
  text: string
}

export interface AgentImageContentBlock {
  type: 'image'
  source: {
    type: 'base64'
    media_type: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
    data: string
  }
}

export type AgentUserContentBlock = AgentTextContentBlock | AgentImageContentBlock
```

`AgentQueryInput.prompt` 和 `SDKUserMessageInput.message.content` 承担不同角色：

- `AgentQueryInput.prompt` 是 Adapter 发起一轮新 SDK query 时消费的首条用户消息，需要支持 image block。
- `SDKUserMessageInput.message.content` 是 `sendQueuedMessage()` 运行中注入消息使用的类型。当前 UI 在 Agent running/background waiting 时明确不支持追加附件，只允许纯文本追加，因此此类型先保持 string，避免扩大运行中注入链路的行为面。

如果未来支持运行中追加图片，再单独扩展 `SDKUserMessageInput` 并补齐队列注入的图片读取、大小限制和持久化策略。

### 2. 保持 AgentSendInput 轻量

`packages/shared/src/types/agent.ts` 中 `AgentSendInput.attachments` 继续保持：

```ts
attachments?: Array<{ filename: string; mediaType?: string; path?: string }>
```

理由：

- 前端已经将图片保存到 session 目录。
- 后端可以通过 `path` 读取图片并生成 base64。
- 避免通过 IPC 传输大 base64，降低内存和消息体风险。

### 3. 新增后端 content 构造器

新增 `apps/electron/src/main/lib/orchestrator/agent-user-content.ts`。

职责：

- 输入 `userMessage` 与 `attachments`。
- 识别 `image/png`、`image/jpeg`、`image/gif`、`image/webp`。
- 异步从附件路径读取图片并生成 image block。不要使用 `readFileSync()` 读取大图片，避免阻塞 Electron 主进程；优先使用 `Bun.file(path).arrayBuffer()` 或 `fs.promises.readFile()`。
- 生成首个 text block，保留用户原文与非图片附件路径信息。
- 不支持的图片类型（如 `bmp`、`svg`、`heic`）不注入 image block，保留路径文本。
- 设置大小上限：
  - 单张图片最大值使用共享常量 `AGENT_IMAGE_INPUT_LIMITS.MAX_SINGLE_IMAGE_BYTES`。
  - 单轮图片总量最大值使用共享常量 `AGENT_IMAGE_INPUT_LIMITS.MAX_TOTAL_IMAGE_BYTES`。
  - 超限时返回结构化错误或降级为路径文本，并给出可展示的错误原因。

建议在 `packages/shared/src/config/agent-image-input.ts` 新增常量并从 `packages/shared/src/config/index.ts` 导出：

```ts
export const AGENT_IMAGE_INPUT_LIMITS = {
  MAX_SINGLE_IMAGE_BYTES: 10 * 1024 * 1024,
  MAX_TOTAL_IMAGE_BYTES: 20 * 1024 * 1024,
} as const
```

`agent-user-content.ts` 内部拆出可单测函数：

```ts
export function validateImageSize(input: {
  filename: string
  sizeBytes: number
  totalSizeBytes: number
}): { ok: true } | { ok: false; reason: string }
```

MIME 推断不要另起一套规则。应复用现有文件类型判断能力，并在新模块中集中提供 `resolveSupportedImageMediaType()`：

```ts
export function resolveSupportedImageMediaType(input: {
  filename: string
  mediaType?: string
  path?: string
}): 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' | null
```

该函数只返回 SDK image block 支持的四类 MIME；其他 raster image（如 bmp、ico、tiff、heic）可以继续保留为路径文本，并提示需要先转换格式。

### 4. 修改 AgentOrchestrator

修改 `apps/electron/src/main/lib/agent-orchestrator.ts`。

当前持久化用户消息与传给 SDK 的 prompt 都使用纯文本。改为区分两个概念：

- `displayText`：用于 UI 展示、历史 JSONL 可读性，仍使用当前 `finalMessage`。
- `sdkUserContent`：用于真实传给 SDK，支持 text + image blocks。

流程：

1. 根据 `attachments` 判断 `runHasImageInput`。
2. 若本轮需要图片理解且模型不支持多模态，继续使用现有 preflight 拦截。
3. 若模型支持多模态，调用 `buildAgentUserContent()` 读取图片并构造 content blocks。
4. 传给 Adapter 的 `prompt` 使用 `sdkUserContent`。
5. 持久化消息不写完整 base64，只保存 text 与必要的 image placeholder 元数据。

Resume 策略：

- 对“本轮新发送”的图片附件，即使当前 SDK query 使用 `resumeSessionId` 续接旧 SDK session，也必须重新构造并注入本轮 `sdkUserContent`。resume 只恢复历史会话状态，不会替我们把本轮图片路径转换为 image block。
- 对“历史消息中的旧图片”，不从 JSONL placeholder 自动重建 image block。历史图片已在它所属的发送轮次提供给模型；后续 resume 依赖 SDK 自身的会话上下文。如果用户希望模型重新查看历史图片，应重新附加图片或引用文件后重新发送。
- 分叉/回退若截断到图片消息之前，再发送新图片走同一条新附件注入路径；不要从旧 JSONL 的 placeholder 恢复 base64。

### 5. 修改 ClaudeAgentAdapter

修改 `apps/electron/src/main/lib/adapters/claude-agent-adapter.ts`。

当前首条消息入队：

```ts
channel.enqueue({
  type: 'user',
  message: {
    role: 'user',
    content: options.prompt,
  },
  parent_tool_use_id: null,
})
```

实现上基本可保持不变，但需要将 `options.prompt` 类型从 `string` 放宽为 `string | AgentUserContentBlock[]`，并移除不必要的字符串假设。

同时新增 runtime 类型守卫，避免继续依赖 `as SDKUserMessage` 架空类型检查：

```ts
function isValidAgentPromptContent(input: unknown): input is string | AgentUserContentBlock[] {
  if (typeof input === 'string') return true
  if (!Array.isArray(input) || input.length === 0) return false
  return input.every((block) => {
    if (!block || typeof block !== 'object') return false
    const record = block as Record<string, unknown>
    if (record.type === 'text') return typeof record.text === 'string'
    if (record.type !== 'image') return false
    const source = record.source as Record<string, unknown> | undefined
    return source?.type === 'base64' &&
      typeof source.data === 'string' &&
      ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(String(source.media_type))
  })
}
```

Adapter 在 enqueue 前校验 `options.prompt`。校验失败时抛出带中文上下文的错误，避免把非法内容交给 SDK 后变成难定位的运行时异常。

队列消息 `queueAgentMessage` 暂不支持附件，保持纯文本即可。对应 `SDKUserMessageInput.message.content` 暂不扩展到 image block。

### 6. 调整图片 Read 守卫文案

修改 `apps/electron/src/main/lib/agent-tool-read-guard.ts`。

`apps/electron/src/main/lib/agent-tool-multimodal-guard.ts` 保持负责 SDK `PreToolUse` hook 层面的模型能力拦截；本次只在必要时同步调整其错误文案，不改变职责边界。

当模型支持多模态但尝试 `Read` 图片时，继续拒绝，但文案改为：

```text
图片已通过多模态输入提供给模型，请直接基于视觉内容回答，不要用 Read 当作文本读取。
```

这样能避免模型被当前“请走多模态图片输入流程”的文案误导。

### 7. 前端展示兼容

`apps/electron/src/renderer/components/agent/SDKMessageRenderer.tsx` 当前会解析 `<attached_files>` 并显示附件 chip。保留现状。

如果持久化消息中引入 `{ type: 'image' }` placeholder：

- `extractUserText()` 应忽略 image block，只提取 text block。
- 图片展示仍通过现有附件 chip、缩略图或路径展示完成。
- 不从 JSONL 中的 base64 渲染图片。

## 测试方案

### 单元测试

新增 `apps/electron/src/main/lib/orchestrator/agent-user-content.test.ts`：

- 图片附件生成 `text + image` blocks。
- 非图片附件只保留文本路径，不生成 image block。
- 不支持 MIME 的图片降级为路径文本或返回明确错误。
- 单图超过上限时返回明确错误。
- 总图片大小超过上限时返回明确错误。

扩展类型/源码测试：

- `AgentQueryInput.prompt` 支持 content block array。
- `SDKUserMessageInput.message.content` 仍保持 string，运行中队列消息暂不支持 image block。
- `ClaudeAgentAdapter` 首条消息不再假设 prompt 是 string。
- `ClaudeAgentAdapter` 对非法 prompt content 会在 enqueue 前报错。

### 编排测试

覆盖 `AgentOrchestrator`：

- 支持多模态模型 + 图片附件：不触发 `model_not_support_multimodal` preflight 错误。
- 不支持多模态模型 + 图片附件：继续触发 `model_not_support_multimodal`。
- resume 续发 + 本轮新图片附件：仍重新生成 image block 注入 SDK。
- 历史 placeholder 图片：不会被自动重建为 image block。
- 持久化消息不包含完整 base64。

### 手工验证

1. 使用 `saas-kimi-k26` 发送一张包含明确文字或 UI 元素的图片，要求模型描述内容。
2. 使用明确不支持多模态的模型发送同一张图片，确认前置拦截清晰提示。
3. 在同一会话中先用文本模型处理纯文本，再切换到多模态模型发送图片，确认本轮使用新模型。
4. 检查对应 JSONL，确认没有完整图片 base64 膨胀。

## 风险与降级

### Provider 兼容风险

虽然 SDK 类型支持 image content block，但不同 Claude Code 兼容 Provider 是否接受 Anthropic image block 仍需实际验证。`saas-kimi-k26` 标记多模态，不等于其当前 Agent SDK 兼容入口一定支持 image block。

处理策略：

- 若 API 返回 image unsupported，展示明确错误。
- 不自动 fallback 到 `Read` 图片，因为 `Read` 图片是错误读取通道。
- 引导用户切换已验证的视觉模型或使用 OCR。

### Payload 体积风险

图片 base64 会显著增加请求体。通过单图和总量上限控制风险，并避免将完整 base64 持久化到 JSONL。

大小上限通过 `@proma/shared` 配置常量集中定义，避免散落在主进程实现中。

### 历史会话兼容

旧消息只有 `<attached_files>` 文本路径，继续按旧方式展示。新消息的 image block placeholder 需要 renderer 忽略或轻量展示，不能破坏历史解析。

## 推荐实施顺序

1. 新增共享图片输入限制常量。
2. 新增 `agent-user-content.ts` 和对应测试。
2. 放宽 shared/provider 类型。
3. 为 `ClaudeAgentAdapter` 增加 prompt content runtime 类型守卫。
4. 接入 `ClaudeAgentAdapter` 首轮 prompt content。
5. 接入 `AgentOrchestrator`，保持持久化不写 base64，并覆盖 resume 新附件场景。
6. 调整 `Read` 图片守卫文案。
7. 跑 `bun test` 与 `bun run typecheck`。
8. 用 `saas-kimi-k26` 和一个已验证视觉模型手动验证图片识别。
