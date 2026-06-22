# WorkMate 本地 API 服务设计文档

## 1. 背景

WorkMate 可以通过本地 Agent 会话完成任务处理、工具调用和工作区操作。为了让外部系统也能调用这些能力，WorkMate 将提供一个本地 HTTP API 服务。

外部用户只需要在 WorkMate 设置中开启服务，配置访问地址和 API Token，就可以通过 HTTP 接口创建会话、发送消息、接收流式结果和停止任务。

该能力适合以下场景：

- 本地脚本调用 WorkMate 执行自动化任务。
- 内部系统把任务分发给本机 WorkMate。
- 开发者工具、MCP 工具或其他桌面应用集成 WorkMate。
- CI、运维脚本或研发助手在可信本机环境中调用 WorkMate。

## 2. 总体方案

WorkMate 在本机启动一个可配置的 HTTP Server。外部程序通过 HTTP 请求访问 WorkMate。

默认地址：

```text
http://127.0.0.1:17373
```

整体调用流程：

```text
外部程序
  -> 调用 WorkMate 本地 HTTP API
  -> 创建或选择 Agent 会话
  -> 发送用户消息
  -> 通过 SSE 接收流式结果
  -> 任务完成或主动停止
```

第一版采用 REST + SSE：

- REST：用于创建会话、发送消息、查询会话、停止任务。
- SSE：用于接收实时输出、工具进度、错误和完成事件。

## 3. WorkMate 内配置

用户可以在 WorkMate 设置中打开“本地 API 服务”页面。

建议配置项：

| 配置项 | 说明 | 默认值 |
| --- | --- | --- |
| 启用本地 API 服务 | 是否启动 HTTP API | 关闭 |
| 监听地址 | HTTP Server 监听地址 | `127.0.0.1` |
| 端口 | HTTP Server 端口 | `17373` |
| API Token | 外部调用鉴权凭证 | 用户生成 |
| 允许远程访问 | 是否允许局域网或其他机器访问 | 关闭 |
| 默认权限模式 | API 调用 Agent 时的默认权限策略 | `ask` |
| 允许跳过权限确认 | 是否允许外部请求使用自动放行模式 | 关闭 |
| CORS 允许来源 | 浏览器页面调用时允许的 Origin | 空 |
| 请求日志 | 是否记录 API 调用日志 | 开启 |

安全建议：

- 普通用户保持默认监听 `127.0.0.1`。
- 只有明确需要被其他机器访问时，才开启远程访问。
- API Token 应视为敏感凭证，不要提交到代码仓库。
- 不建议默认开启“允许跳过权限确认”。

## 4. 鉴权方式

除健康检查接口外，所有接口都需要携带 Bearer Token。

请求头：

```http
Authorization: Bearer <api_token>
```

示例：

```bash
curl http://127.0.0.1:17373/api/agent/sessions \
  -H "Authorization: Bearer $WORKMATE_API_TOKEN"
```

未携带 Token 或 Token 错误时返回：

```json
{
  "error": {
    "code": "unauthorized",
    "message": "认证失败"
  }
}
```

## 5. 接口清单

### 5.1 健康检查

```http
GET /api/health
```

用途：检查本地 API 服务是否可用。

响应示例：

```json
{
  "ok": true,
  "version": "0.9.5",
  "apiVersion": "v1"
}
```

### 5.2 创建 Agent 会话

```http
POST /api/agent/sessions
```

请求示例：

```json
{
  "title": "外部系统任务",
  "channelId": "channel-id",
  "workspaceId": "workspace-id"
}
```

字段说明：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `title` | 否 | 会话标题，不传则使用默认标题 |
| `channelId` | 否 | 使用的 AI 渠道 ID |
| `workspaceId` | 否 | 使用的 WorkMate 工作区 ID |

响应示例：

```json
{
  "session": {
    "id": "session-id",
    "title": "外部系统任务",
    "channelId": "channel-id",
    "workspaceId": "workspace-id",
    "createdAt": 1782090000000,
    "updatedAt": 1782090000000
  }
}
```

### 5.3 查询 Agent 会话列表

```http
GET /api/agent/sessions
```

响应示例：

```json
{
  "sessions": [
    {
      "id": "session-id",
      "title": "外部系统任务",
      "channelId": "channel-id",
      "workspaceId": "workspace-id",
      "createdAt": 1782090000000,
      "updatedAt": 1782090000000
    }
  ]
}
```

### 5.4 查询会话消息

```http
GET /api/agent/sessions/:sessionId/messages
```

用途：获取指定会话的历史消息。

响应示例：

```json
{
  "messages": []
}
```

### 5.5 发送消息

```http
POST /api/agent/sessions/:sessionId/messages
```

请求示例：

```json
{
  "userMessage": "请帮我分析当前工作区的代码结构",
  "channelId": "channel-id",
  "modelId": "claude-sonnet-4",
  "workspaceId": "workspace-id",
  "permissionMode": "ask",
  "mentionedSkills": [],
  "mentionedSessionIds": [],
  "selectedMcpServers": []
}
```

字段说明：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `userMessage` | 是 | 用户发送给 Agent 的消息 |
| `channelId` | 否 | 本次调用使用的 AI 渠道，不传则使用会话或应用默认配置 |
| `modelId` | 否 | 本次调用使用的模型，不传则使用应用默认配置 |
| `workspaceId` | 否 | 本次调用使用的工作区，不传则使用会话默认工作区 |
| `permissionMode` | 否 | 权限模式，例如 `ask`、`plan`、`bypassPermissions` |
| `mentionedSkills` | 否 | 本次显式引用的 Skill 列表 |
| `mentionedSessionIds` | 否 | 本次引用的历史会话 ID 列表 |
| `selectedMcpServers` | 否 | 本次选择启用的 MCP Server 名称列表 |

响应示例：

```json
{
  "runId": "run-id",
  "sessionId": "session-id",
  "status": "started",
  "eventsUrl": "/api/agent/sessions/session-id/events?runId=run-id"
}
```

拿到 `runId` 后，调用方通过 SSE 接口接收实时结果。

### 5.6 订阅流式事件

```http
GET /api/agent/sessions/:sessionId/events?runId=run-id
```

响应类型：

```http
Content-Type: text/event-stream
```

事件示例：

```text
event: run_started
data: {"runId":"run-id","sessionId":"session-id","startedAt":1782090000000}

event: delta
data: {"text":"我会先查看项目结构。"}

event: tool_start
data: {"id":"tool-id","name":"Read","input":{}}

event: tool_result
data: {"id":"tool-id","content":"读取完成","isError":false}

event: title_updated
data: {"title":"代码结构分析"}

event: error
data: {"code":"agent_error","message":"执行失败"}

event: done
data: {"stoppedByUser":false}
```

事件类型说明：

| 事件 | 说明 |
| --- | --- |
| `run_started` | 本轮任务开始 |
| `delta` | Agent 文本增量输出 |
| `tool_start` | 工具开始执行 |
| `tool_result` | 工具执行结果 |
| `title_updated` | 会话标题更新 |
| `error` | 任务执行出错 |
| `done` | 本轮任务结束 |

### 5.7 停止任务

```http
POST /api/agent/sessions/:sessionId/stop
```

用途：停止指定会话当前正在运行的 Agent 任务。

响应示例：

```json
{
  "sessionId": "session-id",
  "stopped": true,
  "wasActive": true
}
```

## 6. 调用示例

### 6.1 创建会话

```bash
curl -X POST http://127.0.0.1:17373/api/agent/sessions \
  -H "Authorization: Bearer $WORKMATE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "代码分析任务",
    "channelId": "channel-id",
    "workspaceId": "workspace-id"
  }'
```

### 6.2 发送消息

```bash
curl -X POST http://127.0.0.1:17373/api/agent/sessions/session-id/messages \
  -H "Authorization: Bearer $WORKMATE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "userMessage": "请总结这个项目的主要模块",
    "permissionMode": "ask"
  }'
```

### 6.3 订阅 SSE

```bash
curl -N http://127.0.0.1:17373/api/agent/sessions/session-id/events?runId=run-id \
  -H "Authorization: Bearer $WORKMATE_API_TOKEN"
```

### 6.4 停止任务

```bash
curl -X POST http://127.0.0.1:17373/api/agent/sessions/session-id/stop \
  -H "Authorization: Bearer $WORKMATE_API_TOKEN"
```

## 7. 并发规则

WorkMate 对同一个会话采用串行执行策略：

- 同一个 `sessionId` 同一时间只能运行一个任务。
- 如果同一会话上一条消息还在处理中，再次发送消息会返回 `409 session_busy`。
- 不同会话可以同时运行。
- 停止任务只影响指定会话。

并发冲突响应示例：

```json
{
  "error": {
    "code": "session_busy",
    "message": "上一条消息仍在处理中，请稍候再试"
  }
}
```

## 8. 错误码

| HTTP 状态码 | 错误码 | 说明 |
| --- | --- | --- |
| `400` | `invalid_json` | 请求体不是合法 JSON |
| `400` | `invalid_request` | 请求参数不合法 |
| `401` | `unauthorized` | Token 缺失或错误 |
| `403` | `forbidden` | 当前配置不允许该操作 |
| `403` | `permission_mode_forbidden` | 当前配置不允许使用请求的权限模式 |
| `404` | `session_not_found` | 会话不存在 |
| `404` | `run_not_found` | 运行记录不存在或已过期 |
| `409` | `session_busy` | 指定会话正在运行 |
| `429` | `too_many_runs` | 达到最大并发限制 |
| `500` | `agent_error` | Agent 执行失败 |
| `500` | `internal_error` | 服务内部错误 |

## 9. 版本规划

第一版能力：

- 开启和关闭本地 API 服务。
- API Token 鉴权。
- 创建会话。
- 查询会话。
- 查询历史消息。
- 发送消息。
- SSE 流式事件。
- 停止任务。
- 同会话并发保护。

后续可扩展能力：

- 同步等待模式，例如 `wait=true`。
- 附件上传和图片输入。
- 更细粒度的 API 权限配置。
- 更完整的浏览器 CORS 管理。
- API 调用统计和审计日志。

## 10. 注意事项

- 本地 API 服务默认面向可信本机环境。
- 开启远程访问前，需要确认网络环境和 Token 管理方式。
- 外部系统不应把 API Token 写入前端页面或公开仓库。
- 如果 Agent 需要访问工作区文件，仍然受 WorkMate 内的工作区和权限配置影响。
- 如果使用 `bypassPermissions`，需要用户在 WorkMate 设置中显式允许。
