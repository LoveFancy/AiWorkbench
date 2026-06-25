# talents CLI 命令参考手册

> 版本：1.0.0
>
> 命令名：`talents`

## 总览

当前面向用户提供 6 个命令：

| 命令 | 主要用途 | 是否需要后端 |
|------|----------|--------------|
| `workspace [keyword]` | 查询工作区列表 | 是 |
| `rag list` | 列出知识库 (RAG) | 是 |
| `rag query` | 查询知识库内容 | 是 |
| `agent list` | 列出已发布的 API 通道代理 | 是 |
| `agent new` | 为代理创建新对话 | 是 |
| `agent query` | 向代理发送聊天查询 | 是 |

## 全局选项

所有命令均支持以下全局选项：

| 选项 | 说明 | 默认值 |
|------|------|--------|
| `--env <env>` | Talents 环境：`dev`、`sit`、`uat`、`prd` | `uat` |
| `--token <token>` | 当前命令使用的访问 token | 无 |
| `--no-input` | 禁用交互式提示 | 否 |
| `-V, --cli-version` | 显示 CLI 版本号 | - |
| `-h, --help` | 显示帮助信息 | - |

支持的环境变量：

| 变量 | 说明 |
|------|------|
| `AGENTOS_ENV` | 默认环境 |
| `HTSKILL_TOKEN` | 访问 token，优先级低于 `--token` |



## 字段说明

### appType（应用类型）

`agent list` 返回的 `appType` 字段标识应用的交互模式。常见取值：

| 值 | 说明 |
|----|------|
| `chat` | 对话型应用，支持多轮对话 |

> **注意**：`agent new`（创建对话）和 `agent query`（发送查询）命令**仅支持 `appType` 为 `chat` 的应用**。补全型应用不支持创建对话和多轮对话操作。使用 `agent list` 时请关注 `appType` 字段，筛选出对话型应用后再进行后续操作。

### 命令间参数来源

下表说明各命令所需参数可从哪个命令的返回数据中获取：

| 当前命令参数 | 来源命令 | 来源字段 |
|-------------|---------|---------|
| `--workspace-id` | `talents workspace` | `workspaceId` |
| `--app-id` | `talents agent list` | `id` |
| `--dataset-id` | `talents rag list` | `datasetXid` |
| `--app-conversation-id` | `talents agent new` | `appConversationID` |

典型调用链：

```bash
# 1. 查询工作区，获取 workspaceId
talents workspace

# 2. 列出工作区下的代理，获取 app-id
talents agent list --workspace-id ws-001

# 3. 创建对话，获取 app-conversation-id
talents agent new --workspace-id ws-001 --app-id agent-001

# 4. 发送查询
talents agent query --workspace-id ws-001 --app-id agent-001 --query "你好" --app-conversation-id conv-001
```


## workspace


```bash
talents workspace [keyword] [options]
```

参数：

| 参数 | 必填 | 说明 |
|------|------|------|
| `[keyword]` | 否 | 搜索关键词，支持模糊匹配工作空间名称 |

选项：

| 选项 | 说明 |
|------|------|
| `--keyword <keyword>` | 搜索关键词（与 positional argument 等价） |
| `--json` | 输出完整的 JSON 响应格式 |

示例：

```bash
# 查询所有工作空间
talents workspace

# 根据关键词搜索
talents workspace 测试

# 使用 --keyword 选项搜索
talents workspace --keyword 测试

# JSON 格式输出
talents workspace --json
talents workspace 测试 --json
```

输出格式：

- **默认格式**：CSV 格式（制表符分隔），包含 `workspaceId`、`workspaceName` 列
- **JSON 格式**：完整的 API 响应 data 数组

响应格式：

```json
{
  "code": "200",
  "message": "操作成功",
  "success": true,
  "data": [
    {
      "workspaceId": "ws-001",
      "workspaceName": "测试空间"
    },
    {
      "workspaceId": "ws-002",
      "workspaceName": "生产空间"
    }
  ]
}
```

data 数组中每个对象的字段说明：

| 字段 | 类型 | 说明 |
|------|------|------|
| `workspaceId` | string | 工作区唯一标识，用于其他命令的 `--workspace-id` 参数 |
| `workspaceName` | string | 工作区名称 |

## rag list

```bash
talents rag list --workspace-id <workspaceId> [options]
```

参数：

| 参数 | 必填 | 说明 | 来源 |
|------|------|------|------|
| `--workspace-id <workspaceId>` | 是 | 工作区 ID（必需） | `talents workspace` → `workspaceId` |

选项：

| 选项 | 说明 |
|------|------|
| `--kb-name <kbName>` | 按知识库名称关键词过滤 |
| `--json` | 输出完整的 JSON 响应格式 |
| `--verbose` | 详细输出格式，显示知识库的详细信息 |

示例：

```bash
# 列出所有知识库
talents rag list --workspace-id ws-001

# 按名称过滤
talents rag list --workspace-id ws-001 --kb-name 测试

# JSON 格式输出
talents rag list --workspace-id ws-001 --json

# 详细输出
talents rag list --workspace-id ws-001 --verbose
```

输出格式：

- **默认格式**：CSV 格式（制表符分隔），包含 `workspaceId`、`workspaceRole`、`workspaceName`、`datasetXid`、`datasetName`、`indexingTechnique` 列
- **JSON 格式**：完整的 API 响应 data 数组
- **详细格式**：显示每个知识库的详细信息，包括工作区、角色、创建时间、更新时间和用途等

响应格式：

```json
{
  "code": "200",
  "message": "操作成功",
  "success": true,
  "data": [
    {
      "workspaceId": "ws-001",
      "workspaceName": "测试空间",
      "workspaceRole": "owner",
      "datasetXid": "ds-001",
      "datasetName": "测试知识库",
      "indexingTechnique": "vector",
      "createdAt": "2024-01-01T00:00:00Z",
      "updatedAt": "2024-01-02T00:00:00Z",
      "usagePurpose": 1
    }
  ]
}
```

data 数组中每个对象的字段说明：

| 字段 | 类型 | 说明 |
|------|------|------|
| `workspaceId` | string | 知识库所属工作区 ID |
| `workspaceName` | string | 工作区名称 |
| `workspaceRole` | string | 当前用户在工作区中的角色（如 `owner`、`member`） |
| `datasetXid` | string | 数据集外部 ID |
| `datasetName` | string | 数据集名称 |
| `indexingTechnique` | string | 索引技术（如 `vector` 向量索引） |
| `createdByUserId` | string | 创建者用户 ID |
| `createdByUserName` | string | 创建者用户名 |
| `createdAt` | string | 创建时间 |
| `updatedByUserId` | string | 最后更新者用户 ID |
| `updatedByUserName` | string | 最后更新者用户名 |
| `updatedAt` | string | 最后更新时间 |
| `usagePurpose` | number | 用途标识 |
| `targetWorkspaceId` | string | 目标工作区 ID（跨工作区订阅时有值） |
| `targetWorkspaceName` | string | 目标工作区名称 |
| `applyUserName` | string | 申请人用户名 |
| `applyDisplayUserName` | string | 申请人显示名 |


## rag query

```bash
talents rag query --workspace-id <workspaceId> --dataset-id <datasetId> [--keyword <keyword>...] [options]
```

参数：

| 参数 | 必填 | 说明 | 来源 |
|------|------|------|------|
| `--workspace-id <workspaceId>` | 是 | 工作区 ID（必需） | `talents workspace` → `workspaceId` |
| `--dataset-id <datasetId...>` | 是 | 数据集 ID（必需，可指定多个） | `talents rag list` → `datasetXid` |

选项：

| 选项 | 说明 |
|------|------|
| `--keyword <keyword...>` | 查询关键词（必需，可指定多个，例如 `--keyword 关键词1 --keyword 关键词2`） |
| `--score-threshold <scoreThreshold>` | 相关性得分阈值，低于此值的结果将被过滤（可选，默认：`0.5`） |
| `--top-k <topK>` | 返回结果数量（可选，默认：`3`） |
| `--json` | 输出完整的 JSON 响应格式 |
| `--verbose` | 详细输出格式，显示片段的详细信息 |

示例：

```bash
# 查询单个数据集
talents rag query --workspace-id ws-001 --dataset-id ds-001 --keyword 测试

# 查询多个数据集
talents rag query --workspace-id ws-001 --dataset-id ds-001 --dataset-id ds-002 --keyword 测试

# 查询多个关键词
talents rag query --workspace-id ws-001 --dataset-id ds-001 --keyword 测试 --keyword 示例

# JSON 格式输出
talents rag query --workspace-id ws-001 --dataset-id ds-001 --keyword 测试 --json

# 详细输出
talents rag query --workspace-id ws-001 --dataset-id ds-001 --keyword 测试 --verbose
```

输出格式：

- **默认格式**：CSV 格式（制表符分隔），包含 `datasetId`、`datasetName`、`documentId`、`documentName`、`segmentId`、`score`、`content`（前50字符）列
- **JSON 格式**：完整的 API 响应 data 数组
- **详细格式**：显示每个片段的详细信息，包括文档、内容、得分和 URL 等

响应格式：

```json
{
  "code": "200",
  "message": "操作成功",
  "success": true,
  "data": [
    {
      "datasetId": "ds-001",
      "datasetName": "测试知识库",
      "documentId": "doc-001",
      "documentName": "测试文档",
      "documentFileType": 1,
      "documentType": 1,
      "documentUrl": "https://example.com/doc-001",
      "documentObsUrl": "obs://bucket/doc-001",
      "segmentId": "seg-001",
      "serial": 1,
      "content": "这是测试内容...",
      "orientationContent": null,
      "score": 0.95,
      "qaMetadata": null,
      "termMetadata": null,
      "indexes": null
    }
  ]
}
```

data 数组中每个对象（Segment）的字段说明：

| 字段 | 类型 | 说明 |
|------|------|------|
| `datasetId` | string | 数据集 ID |
| `datasetName` | string | 数据集名称 |
| `documentId` | string | 文档 ID |
| `documentName` | string | 文档名称 |
| `documentFileType` | number | 文档文件类型标识 |
| `documentType` | number | 文档类型标识 |
| `documentUrl` | string | 文档访问 URL |
| `documentObsUrl` | string | 文档 OBS 存储 URL |
| `segmentId` | string | 文档片段 ID |
| `serial` | number | 片段序号 |
| `content` | string | 片段文本内容 |
| `orientationContent` | object | 定向内容（含宽高、页数等元数据，通常为 null） |
| `score` | number | 相关性得分（0~1），值越高表示与查询越相关 |
| `qaMetadata` | object | 问答元数据（问答型知识库时有值） |
| `termMetadata` | object | 术语元数据 |
| `indexes` | object[] | 索引信息数组 |

## agent list

```bash
talents agent list --workspace-id <workspaceId> [options]
```

参数：

| 参数 | 必填 | 说明 | 来源 |
|------|------|------|------|
| `--workspace-id <workspaceId>` | 是 | 工作区 ID（必需） | `talents workspace` → `workspaceId` |

选项：

| 选项 | 说明 |
|------|------|
| `--json` | 输出完整的 JSON 响应格式 |
| `--verbose` | 详细输出格式，显示代理的详细信息 |

示例：

```bash
# 列出所有已发布代理
talents agent list --workspace-id ws-001

# JSON 格式输出
talents agent list --workspace-id ws-001 --json

# 详细输出
talents agent list --workspace-id ws-001 --verbose
```

输出格式：

- **默认格式**：CSV 格式（制表符分隔），包含 `workspaceID`、`workspaceName`、`id`、`appType`、`name`、`description` 列
- **JSON 格式**：完整的 API 响应 data 数组
- **详细格式**：显示每个代理的详细信息，包括工作区、类型、发布状态、模型和创建时间等

响应格式：

```json
{
  "code": "200",
  "message": "操作成功",
  "success": true,
  "data": [
    {
      "workspaceID": "ws-001",
      "workspaceName": "测试空间",
      "id": "agent-001",
      "appType": "chat",
      "name": "测试代理",
      "description": "这是一个测试代理",
      "isPublished": true,
      "modelID": "model-001",
      "modelName": "GPT-4",
      "createTime": "2024-01-01T00:00:00Z"
    }
  ]
}
```

data 数组中每个对象的字段说明：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 应用唯一标识 |
| `workspaceID` | string | 所属工作区 ID |
| `workspaceName` | string | 所属工作区名称 |
| `name` | string | 应用名称 |
| `appType` | string | 应用类型：`chat`（对话型）、`completion`（补全型）。详见 [appType 说明](#apptype应用类型) |
| `description` | string | 应用描述 |
| `icon` | string | 应用图标 URL |
| `background` | string | 应用背景图 URL |
| `image` | string | 应用封面图 URL |
| `isPublished` | boolean | 是否已发布 |
| `httpRunnable` | boolean | 是否支持 HTTP 调用 |
| `apiRunnable` | boolean | 是否支持 API 调用 |
| `modelID` | string | 使用的模型 ID |
| `modelName` | string | 使用的模型名称 |
| `createUserName` | string | 创建者名称 |
| `createUserNo` | string | 创建者工号 |
| `createTime` | string | 创建时间 |
| `publishTime` | string | 发布时间 |
| `publishedChannels` | string[] | 已发布的通道列表（如 `["api", "web"]`） |
| `publishAgentMode` | string | 发布时的 Agent 模式 |
| `draftAgentMode` | string | 草稿时的 Agent 模式 |
| `rateLimit` | object | 限流配置，包含 `qps`（每秒请求数限制） |

## agent new

```bash
talents agent new --workspace-id <workspaceId> --app-id <appId> [options]
```

参数：

| 参数 | 必填 | 说明 | 来源 |
|------|------|------|------|
| `--workspace-id <workspaceId>` | 是 | 工作区 ID（必需） | `talents workspace` → `workspaceId` |
| `--app-id <appId>` | 是 | 应用 ID（必需） | `talents agent list` → `id` |

选项：

| 选项 | 说明 |
|------|------|
| `--json` | 输出完整的 JSON 响应格式 |
| `--verbose` | 详细输出格式，显示对话的详细信息 |

示例：

```bash
# 创建新对话
talents agent new --workspace-id ws-001 --app-id app-001

# JSON 格式输出
talents agent new --workspace-id ws-001 --app-id app-001 --json

# 详细输出
talents agent new --workspace-id ws-001 --app-id app-001 --verbose
```

输出格式：

- **默认格式**：CSV 格式（制表符分隔），包含 `appConversationID`、`conversationID`、`conversationName` 列
- **JSON 格式**：完整的 API 响应 data 对象
- **详细格式**：显示对话的详细信息，包括对话 ID、名称、创建时间和是否置顶等

响应格式：

```json
{
  "code": "200",
  "message": "操作成功",
  "success": true,
  "data": {
    "conversation": {
      "appConversationID": "conv-001",
      "conversationID": "conv-001",
      "conversationName": "新对话",
      "createTime": "2024-01-01T00:00:00Z",
      "lastChatTime": "2024-01-01T00:00:00Z",
      "isPinned": false,
      "emptyConversation": true
    }
  }
}
```

> **注意**：仅 `appType` 为 `chat` 的应用支持创建对话。

data.conversation 字段说明：

| 字段 | 类型 | 说明 |
|------|------|------|
| `appConversationID` | string | 应用级对话 ID，用于 `agent query` 的 `--app-conversation-id` 参数 |
| `conversationID` | string | 系统级对话 ID |
| `conversationName` | string | 对话名称（通常由系统自动生成） |
| `createTime` | string | 对话创建时间 |
| `lastChatTime` | string | 最后一次聊天时间 |
| `isPinned` | boolean | 是否置顶 |
| `emptyConversation` | boolean | 是否为空对话（尚未发送任何消息） |

## agent query

```bash
talents agent query --workspace-id <workspaceId> --app-id <appId> --query <query> --app-conversation-id <appConversationId> [options]
```

参数：

| 参数 | 必填 | 说明 | 来源 |
|------|------|------|------|
| `--workspace-id <workspaceId>` | 是 | 工作区 ID（必需） | `talents workspace` → `workspaceId` |
| `--app-id <appId>` | 是 | 应用 ID（必需） | `talents agent list` → `id` |
| `--query <query>` | 是 | 查询文本（必需） | - |
| `--app-conversation-id <appConversationId>` | 是 | 应用对话 ID（必需） | `talents agent new` → `appConversationID` |

选项：

| 选项 | 说明 |
|------|------|
| `--json` | 输出完整的 JSON 响应格式 |
| `--verbose` | 详细输出格式，显示查询结果的详细信息 |

示例：

```bash
# 发送简单查询
talents agent query --workspace-id ws-001 --app-id app-001 --query "你好" --app-conversation-id conv-001


# JSON 格式输出
talents agent query --workspace-id ws-001 --app-id app-001 --query "你好" --app-conversation-id conv-001 --json

# 详细输出
talents agent query --workspace-id ws-001 --app-id app-001 --query "你好" --app-conversation-id conv-001 --verbose
```

输出格式：

- **默认格式**：CSV 格式（制表符分隔），包含 `event`、`task_id`、`id`、`conversation_id`、`answer` 列
- **JSON 格式**：完整的 API 响应 data 对象
- **详细格式**：显示查询结果的详细信息，包括任务 ID、消息 ID、回答、延迟、令牌使用量和代理配置等

响应格式：

```json
{
  "code": "200",
  "message": "操作成功",
  "success": true,
  "data": {
    "event": "chat.completion",
    "task_id": "task-001",
    "id": "msg-001",
    "conversation_id": "conv-001",
    "answer": "你好！我是测试代理。",
    "created_at": 1704067200,
    "latency": 1.5,
    "input_tokens": 10,
    "output_tokens": 20,
    "total_tokens": 30,
    "start_time_first_resp": 1704067200,
    "latency_first_resp": 500,
    "agent_configuration": {
      "retriever_resource": {
        "enabled": true
      }
    }
  }
}
```

> **注意**：仅 `appType` 为 `chat` 的应用支持发送对话查询。

data 字段说明：

| 字段 | 类型 | 说明 |
|------|------|------|
| `event` | string | 事件类型，如 `chat.completion` |
| `task_id` | string | 任务 ID，用于追踪本次请求 |
| `id` | string | 消息 ID |
| `conversation_id` | string | 对话 ID |
| `answer` | string | Agent 返回的回答文本 |
| `created_at` | number | 消息创建时间戳（秒） |
| `latency` | number | 整体响应延迟（秒） |
| `input_tokens` | number | 输入 token 数 |
| `output_tokens` | number | 输出 token 数 |
| `total_tokens` | number | 总 token 数（输入 + 输出） |
| `start_time_first_resp` | number | 首字响应开始时间戳（秒） |
| `latency_first_resp` | number | 首字响应延迟（毫秒），即从请求发出到收到第一个字的时间 |
| `agent_configuration` | object | Agent 配置信息 |
| `agent_configuration.retriever_resource.enabled` | boolean | 是否启用了知识库检索（RAG） |