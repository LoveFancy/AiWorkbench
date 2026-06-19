# Agent READ 保护机制与 Auto Mode 多模态切换方案

本文总结 Proma 当前 Agent 在读取图片、PDF、Office 文档等非纯文本文件时的风险点，并给出 READ / Bash base64 前置保护机制，以及 Agent Auto Mode 在多模态与非多模态模型之间切换时的约束方案。

## 一、背景与问题定义

当前 Agent 通过 Claude Agent SDK 使用 `Read`、`Bash`、`Glob`、`Grep` 等工具。`Read` 被视为只读工具，在 `auto` / `plan` 权限模式下容易被自动放行。

问题在于：图片、PDF、Office 文档等文件并不适合被当作普通文本读取。如果 SDK 的 `Read` 默认行为发生变化，或者模型通过 `Bash` 执行 `base64` 读取二进制文件，可能导致大量不可读内容进入上下文，浪费 token，甚至让模型基于错误信息推理。

## 二、当前实现现状

| 模块 | 当前行为 | 风险 |
| --- | --- | --- |
| 权限系统 | `Read` 在 `SAFE_TOOLS` 中，`auto` 模式本地 classifier 会自动放行。 | 没有按文件类型区分文本、图片、PDF、Office、二进制。 |
| Plan 模式 | `Read` 在 `PLAN_MODE_ALLOWED_TOOLS` 中，计划阶段可直接调用。 | 计划阶段也可能读取图片或 PDF。 |
| 系统提示词 | 提示模型不要直接把 `docx`、`pdf`、`pptx`、`xlsx` 等二进制内容交给模型猜测。 | 这是软约束，不是硬拦截。 |
| 图片附件 | 前端根据 `supportsMultimodal` 控制是否允许添加图片。 | Auto Mode 实际模型可能不同于 UI 当前选中模型。 |
| 文件类型判断 | 多数路径依赖后缀或 MIME；少数桥接场景使用 magic bytes。 | 单靠后缀可被改名绕过。 |

## 三、READ 保护机制设计

### 3.1 基本原则

- 文本文件继续允许使用 `Read`。
- 图片不通过 `Read` 或 `Bash base64` 作为文本读取；图片应走多模态图片通道。
- PDF、DOCX、PPTX、XLSX 等文档不通过 base64 或原始二进制进入上下文；优先走文档解析器或对应 Skill 提取文本。
- 未知二进制文件默认拒绝作为文本读取。
- 保护逻辑应在权限模式判断之前执行，覆盖 `auto`、`plan`、`bypassPermissions`。
- 该保护不是权限审批问题，而是协议/通道正确性问题：即使 `bypassPermissions` 表示跳过人工审批，也不应允许模型通过错误通道把二进制内容塞进文本上下文。

### 3.2 推荐前置守卫

当前代码里的模型能力字段是 `ChannelModel.supportsMultimodal`，建议在 Agent run 开始时由后端根据实际 `currentChannelId + resolvedModel` 生成一次能力快照，并通过闭包传给 `canUseTool`：

```ts
interface RunToolGuardContext {
  supportsMultimodal: boolean
  autoModeEnabled: boolean
  runHasImageInput: boolean
  sessionRequiresVisionContext: boolean
  canAutoSwitchToMultimodal: () => boolean
}
```

传递路径建议放在 `AgentOrchestrator` 内部，而不是让 `AgentPermissionService` 自己查全局状态：

```ts
const runToolGuardContext = buildRunToolGuardContext({
  channelId: currentChannelId,
  modelId: resolvedModel,
  autoModeConfig,
  sessionMeta,
  userMessage,
  pendingFiles,
})

const canUseTool = async (toolName, input, options) => {
  const guardFailure = guardToolUseBeforePermission(toolName, input, runToolGuardContext)
  if (guardFailure) return guardFailure

  // 后续再进入 EnterPlanMode / ExitPlanMode / auto / plan / bypassPermissions 分派
}
```

这样 `supportsMultimodal` 是本次 run 的实际模型能力，而不是前端 UI 当前选中的模型能力。

```ts
function guardToolUseBeforePermission(toolName, input, context) {
  if (toolName === 'Read') {
    const kind = detectFileKind(input.file_path)

    // SVG 是文本格式图片，允许按 XML 源码读取；光栅图片必须走多模态通道
    if (kind === 'svg_text') {
      return null
    }

    if (kind === 'raster_image') {
      if (!context.supportsMultimodal && context.canAutoSwitchToMultimodal()) {
        return deny('当前模型不支持多模态图片理解，Auto Mode 应切换到多模态候选模型后再处理该图片。')
      }

      return deny(
        context.supportsMultimodal
          ? '图片不能通过 Read 作为文本读取，请走多模态图片输入流程。'
          : '当前模型不支持多模态图片理解，请切换支持图片的模型。'
      )
    }

    if (kind === 'pdf' || kind === 'office') {
      return deny('文档不能通过 Read/base64 直接读取，请使用文档解析或对应 Skill 提取文本。')
    }

    if (kind === 'binary') {
      return deny('二进制文件不能作为文本读取。')
    }
  }

  if (toolName === 'Bash' && looksLikeBase64BinaryRead(input.command)) {
    return deny('禁止使用 base64 方式读取图片、PDF 或二进制文件。')
  }

  return null
}
```

`looksLikeBase64BinaryRead()` 只能作为 best-effort 二次防线，不能承诺拦截所有 Bash 读取二进制的方式。模型仍可能尝试 `openssl base64`、`python -c`、管道组合、hex 编码、`xxd` 等变体。真正可靠的边界仍应放在专用工具和文件读取通道上：`Read` 做文件类型硬拦截，图片走多模态通道，文档走解析器 / Skill。

### 3.3 文件类型识别策略

| 层级 | 用途 | 说明 |
| --- | --- | --- |
| 扩展名 | 快速判断 | 识别 `.png`、`.jpg`、`.pdf`、`.docx`、`.pptx`、`.xlsx` 等常见类型。 |
| MIME | 已有附件元数据 | 使用 `image/*`、`application/pdf`、Office MIME 等辅助判断。 |
| magic bytes | 防改名绕过 | 识别 `%PDF`、PNG、JPEG、GIF、WebP、ZIP-based Office 等文件头。 |
| 文本可读性检测 | 兜底 | 未知类型可抽样检测控制字符比例和 UTF-8 解码质量，避免二进制误读。 |

## 四、图片与文档的正确处理路径

### 4.1 图片

- 如果当前 run 的实际模型支持多模态，允许用户明确上传、附加或 `@` 引用图片。
- 图片应通过多模态图片通道传给模型，而不是通过 `Read` / base64 作为文本传入。
- 如果当前模型不支持多模态，应拒绝图片输入，并提示切换到支持多模态的模型。
- SVG 是例外：SVG 文件本身是 XML 文本，读取源码进行分析或编辑是合理路径；但若 SVG 内嵌大段 base64 图像数据，应按二进制/大文本风险处理。
- `WebFetch` 也需要同类保护：如果响应 `Content-Type` 是 `image/*`、`application/pdf`、Office MIME 或其他非文本类型，应拒绝把响应作为普通文本返回，并提示改用图片多模态通道或文档解析通道。

### 4.2 PDF 和 Office 文档

- PDF 优先用 `pdf-parse` 或文档 Skill 提取文本。
- DOCX、PPTX、XLSX 等优先用 `officeparser` 或对应 Skill 读取结构化内容。
- 如果需要 OCR 或版面视觉理解，应走专门的 PDF 页面渲染 / OCR / 多模态流程，而不是 base64。

## 五、Agent Auto Mode 的模型切换问题

### 5.1 当前 Auto Mode 逻辑

- 前端开启 Auto Mode 后，发送消息时会把 `modelId` 传为 `undefined`。
- 后端从 `autoSwitchCandidateModels` 候选池选择初始模型。
- 模型失败后会先同模型重试一次；再失败则切到候选池下一个可用模型。
- 当前候选池没有按 `supportsMultimodal` 做能力过滤。

### 5.2 风险

如果候选池同时包含多模态模型和纯文本模型，会出现上下文能力不一致：前面多模态模型已经读取图片，后续失败切到纯文本模型后，纯文本模型无法继续理解图片内容，可能报错、忽略图片，或基于之前的文字描述继续猜测。

### 5.3 推荐切换约束

- 本轮输入包含图片时，Auto Mode 候选池只允许 `supportsMultimodal=true` 的模型。
- 会话历史中出现图片上下文后，标记 `session.requiresVisionContext=true`。
- `requiresVisionContext=true` 时，后续自动切换仍只允许多模态模型。
- 如果初始 prompt 没有图片，Auto Mode 从纯文本模型开始运行，但运行中模型尝试 `Read` 图片，前置守卫应拒绝本次 `Read`，并返回可识别的“需要多模态模型”错误。Auto Mode 可以把这类错误归类为能力不匹配，触发一次切换到多模态候选后重试；如果没有多模态候选，则停止并提示用户配置。
- 如果用户手动切到纯文本模型，应提示该会话包含图片上下文，建议新建会话、清空上下文，或先把图片理解结果固化为文字摘要。
- 如果过滤后没有可用多模态候选，应停止自动切换并提示用户配置多模态候选模型。

```ts
const runRequiresVision = runHasImageInput || session.requiresVisionContext

const candidatePool = autoMode.candidates.filter((candidate) => {
  if (!runRequiresVision) return true
  return candidate.supportsMultimodal === true
})

if (runRequiresVision && candidatePool.length === 0) {
  throw new Error('当前会话需要多模态模型，但 Auto Mode 候选池中没有可用的多模态模型。')
}
```

运行中发现图片读取需求时，可以使用同一套候选过滤：

```ts
if (guardError.code === 'requires_multimodal_model' && autoMode.enabled) {
  const next = selectNextCandidateModel({
    requiredCapabilities: { supportsMultimodal: true },
    excludeModelIds: triedModelIds,
  })

  if (next) {
    switchToModel(next)
    retryCurrentRun()
  }
}
```

## 六、建议落地顺序

1. 新增统一文件类型检测模块，组合扩展名、MIME、magic bytes 和文本可读性检测。
2. 在 `canUseTool` 最前面加入 `guardToolUseBeforePermission`，优先于 `auto`、`plan`、`bypassPermissions` 放行逻辑。
3. 拦截 `Read` 图片、PDF、Office、未知二进制，以及 `Bash base64` 读取二进制。
4. 在 Agent run 开始时生成实际模型能力快照，包括 `supportsMultimodal`，并通过闭包传入 `canUseTool` 前置守卫。
5. 给 Auto Mode 候选池加入能力过滤：本轮或会话需要 vision 时，只允许多模态候选。
6. 会话元数据增加 `requiresVisionContext`，图片输入成功后置 `true`。
7. 补充测试：`Read` 光栅图片拒绝、`Read` SVG 源码允许、`Read` PDF 拒绝、`Bash base64` 图片 best-effort 拒绝、`WebFetch image/*` 拒绝、Auto Mode 图片场景跳过纯文本模型、运行中发现图片需求时切到多模态候选。

## 七、结论

READ 保护机制的核心不是阻止模型处理图片或文档，而是阻止图片、PDF、Office、未知二进制通过错误的文本读取路径进入上下文。图片应走多模态通道，文档应走解析器或 Skill。

Agent Auto Mode 需要从“失败后任意切候选模型”升级为“按上下文能力约束切换模型”。一旦本轮或会话需要视觉能力，就必须锁定多模态候选池，避免多模态和纯文本模型混用造成上下文不兼容。
