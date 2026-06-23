# WorkMate 本地 API 服务设计

## 背景

WorkMate 当前已经支持多种外部入口触发 Agent。飞书 Bridge 的链路是：

```text
飞书消息 -> feishu-bridge -> runAgentHeadless -> AgentOrchestrator -> agentEventBus -> 飞书卡片/消息
```

这条链路证明 Agent 的创建会话、发送消息、流式事件和停止任务已经可以脱离渲染进程运行。用户希望把类似能力放到本地，通过一个可配置的 HTTP Server 让外部程序、本地脚本、自动化系统或后续 MCP 工具调用 WorkMate。

本设计第一版聚焦 Agent 模式，不把 Chat 模式一起纳入，避免同时处理两套会话、消息和流式协议。

## 目标

- 在 Electron 主进程内提供可选的本地 HTTP API 服务。
- 外部调用方可以创建 Agent 会话、发送消息、订阅流式事件、停止指定会话。
- 复用现有 `createAgentSession`、`runAgentHeadless`、`stopAgent` 和 `agentEventBus`，不模拟 renderer IPC。
- 服务可在设置界面启停和配置，默认关闭，默认只监听 `127.0.0.1`。
- 所有非健康检查接口需要 API Token 鉴权。
- 同一会话并发沿用现有 `AgentOrchestrator` 锁，外部 API 返回明确的 `409 session_busy`。
- 配置继续使用本地 JSON 文件，不引入本地数据库。

## 非目标

- 不在第一版提供公网 SaaS 服务。
- 不默认监听 `0.0.0.0`。
- 不支持 Chat 模式 API。
- 不提供 WebSocket；第一版使用 REST + SSE。
- 不重新实现 Agent 调度、权限系统、消息持久化或工作区隔离。
- 不绕过现有工作区、MCP、Skill 和权限模式边界。

## 推荐方案

采用“主进程本地 HTTP Server + REST + SSE”的方案。

数据流：

```text
外部程序
  -> localhost HTTP API
  -> WorkMate 主进程 local-api-server
  -> createAgentSession / runAgentHeadless / stopAgent
  -> AgentOrchestrator
  -> agentEventBus
  -> SSE 或 JSON 响应
```

REST 负责命令型操作：健康检查、创建会话、发送消息、停止任务、查询会话和消息。SSE 负责单向流式输出，和 Agent 当前事件模型一致。

第一版不使用 Express、Fastify 或 Hono。使用 Node 原生 `node:http` 即可满足需求，并避免新增依赖。若后续 API 面扩大，再评估是否引入框架；引入依赖前需要按项目约定先搜索和评估版本。

## 方案取舍

### 方案 A：同步 REST

`POST /messages` 后一直等待 Agent 完成，再返回最终结果。

优点是实现最简单，调用方也容易理解。缺点是 Agent 任务可能持续很久，容易遇到 HTTP 超时、客户端断连和代理缓冲问题，也无法自然展示工具调用进度。

结论：不作为主方案，可作为 `wait=true` 的兼容能力后续补充。

### 方案 B：REST + SSE

`POST /messages` 启动一轮运行并返回 `runId`，调用方通过 SSE 订阅事件。

优点是贴合当前 `agentEventBus`，实现成本可控，能稳定表达文本增量、工具事件、错误和完成。调用方用 curl、浏览器、Node、Python 都容易接入。

结论：推荐作为第一版方案。

### 方案 C：WebSocket

WebSocket 适合双向实时控制和复杂会话，但第一版只需要“发起命令 + 单向流式输出”。过早引入 WebSocket 会增加连接状态、重连、心跳和鉴权复杂度。

结论：暂不做。

## API 协议

### 通用约定

默认基础地址：

```text
http://127.0.0.1:17373
```

除 `GET /api/health` 外，所有接口都要求：

```text
Authorization: Bearer <apiToken>
```

请求和响应使用 JSON。错误响应统一格式：

```json
{
  "error": {
    "code": "session_busy",
    "message": "上一条消息仍在处理中，请稍候再试"
  }
}
```

### 健康检查

```text
GET /api/health
```

响应：

```json
{
  "ok": true,
  "version": "0.9.5",
  "apiVersion": "v1"
}
```

### 创建 Agent 会话

```text
POST /api/agent/sessions
```

请求：

```json
{
  "title": "外部系统任务",
  "channelId": "channel-id",
  "workspaceId": "workspace-id",
  "expertGroupId": "optional",
  "expertPluginId": "optional",
  "expertIntroduction": "optional"
}
```

处理：

- 调用 `createAgentSession(title, channelId, workspaceId, expertGroupId, expertPluginId, expertIntroduction)`。
- 返回会话元数据。
- 不强制创建飞书 Session 镜像；本地 API 不应触发飞书建群副作用。
- 创建会话阶段不持久化 `modelId`。模型选择在发送消息时通过 `modelId` 指定；缺省时使用应用设置中的 Agent 默认模型。

响应：

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

### 查询 Agent 会话

```text
GET /api/agent/sessions
```

响应：

```json
{
  "sessions": []
}
```

第一版可以直接返回 `listAgentSessions()` 的结果。后续如外部调用增多，再补分页和工作区过滤。

### 查询会话消息

```text
GET /api/agent/sessions/:sessionId/messages
```

响应：

```json
{
  "messages": []
}
```

使用 `getAgentSessionSDKMessages(sessionId)`，保持与 Agent UI 一致。

### 发送 Agent 消息

```text
POST /api/agent/sessions/:sessionId/messages
```

请求：

```json
{
  "userMessage": "帮我分析这个目录",
  "channelId": "channel-id",
  "modelId": "claude-sonnet-4",
  "workspaceId": "workspace-id",
  "permissionMode": "ask",
  "mentionedSkills": [],
  "mentionedSessionIds": [],
  "selectedMcpServers": []
}
```

字段规则：

- `userMessage` 必填，不能为空字符串。
- `channelId` 优先使用请求值；缺省时使用会话元数据中的 `channelId`。
- `workspaceId` 优先使用请求值；缺省时使用会话元数据中的 `workspaceId`。
- `modelId` 优先使用请求值；缺省时使用应用设置中的 Agent 模型或会话渠道对应默认模型。
- `permissionMode` 映射到 `permissionModeOverride`。默认使用设置页配置，不默认 bypass。

响应：

```json
{
  "runId": "run-id",
  "sessionId": "session-id",
  "status": "started",
  "eventsUrl": "/api/agent/sessions/session-id/events?runId=run-id"
}
```

处理：

1. 校验 token、sessionId、请求体。
2. 查询会话元数据，不存在则返回 `404 session_not_found`。
3. 如果该会话正在运行，返回 `409 session_busy`。
4. 注册本轮 `runId` 与 `sessionId`。
5. 调用 `runAgentHeadless(input, callbacks)`。
6. `runAgentHeadless` Promise 不阻塞 HTTP 响应；运行结果通过 SSE 发送。

### 订阅事件

```text
GET /api/agent/sessions/:sessionId/events?runId=run-id
```

响应使用 `text/event-stream`：

```text
event: run_started
data: {"runId":"run-id","sessionId":"session-id","startedAt":1782090000000}

event: delta
data: {"text":"你好"}

event: tool_start
data: {"id":"tool-id","name":"Read","input":{}}

event: tool_result
data: {"id":"tool-id","content":"...","isError":false}

event: title_updated
data: {"title":"新的标题"}

event: error
data: {"code":"agent_error","message":"..."}

event: done
data: {"stoppedByUser":false}
```

事件来源：

- `agentEventBus.on` 负责接收 `AgentStreamPayload`。
- 本地 API 层按 `sessionId` 和 `runId` 路由到 SSE 连接。
- `runAgentHeadless` 的 `onError`、`onComplete`、`onTitleUpdated` 补充控制事件。

第一版可以允许“先发消息后订阅”。为减少事件丢失，API 层为每个 `runId` 保留一个短期内存事件缓冲，例如最近 200 条或运行结束后 5 分钟。SSE 建立后先 replay 缓冲，再继续推送实时事件。

### 停止 Agent

```text
POST /api/agent/sessions/:sessionId/stop
```

处理：

- 调用 `stopAgent(sessionId)`。
- 如果该会话没有运行，返回 200 并标记 `wasActive: false`，避免调用方必须区分幂等停止。

响应：

```json
{
  "sessionId": "session-id",
  "stopped": true,
  "wasActive": true
}
```

## 设置界面

在设置中增加独立的“本地 API 服务”Tab。独立 Tab 比放入 Agent 设置高级区块更清晰，也便于展示安全提示、Token 管理和后续 API 文档。

配置项：

- 启用本地 API 服务：默认关闭。
- 监听地址：默认 `127.0.0.1`。
- 端口：默认 `17373`。
- API Token：生成、重置、复制。
- 允许远程访问：默认关闭；开启时监听地址可选 `0.0.0.0`，并展示风险提示。
- CORS 允许来源：默认仅允许空来源、本机来源或不返回 CORS；需要浏览器调用时用户显式配置。
- 默认权限模式：默认 `ask`，可选 `plan`、`ask`、`bypassPermissions`。
- 允许 API 使用 bypassPermissions：默认关闭。关闭时，即使请求传 `bypassPermissions` 也返回 `403 permission_mode_forbidden`。
- 最大并发会话数：默认不额外限制；如配置为正数，则在 API 层限制本地 API 发起的活跃运行数。
- 请求日志：默认开启基础日志，不记录完整 prompt；可选调试模式记录更多细节。

设置变更后：

- 启用状态、监听地址或端口变化时热重启 HTTP Server。
- Token 变化立即生效，已有 SSE 连接可继续保持或在下一次事件发送前断开。第一版推荐继续保持已有连接，降低实现复杂度；新请求必须使用新 token。

## 配置存储

继续使用本地 JSON。建议新增独立配置服务：

```text
apps/electron/src/main/lib/local-api-settings-service.ts
```

配置结构：

```ts
export interface LocalApiSettings {
  enabled: boolean
  host: string
  port: number
  apiTokenHash: string | null
  corsOrigins: string[]
  allowRemoteAccess: boolean
  defaultPermissionMode: PromaPermissionMode
  allowBypassPermissions: boolean
  maxConcurrentRuns: number | null
  requestLoggingEnabled: boolean
}
```

Token 不明文写入设置文件。生成后只展示一次明文，存储哈希。鉴权时对传入 token 做固定时间比较。

如果为了用户体验需要“复制当前 token”，则必须明文持久化或使用系统安全存储。第一版推荐“重置并复制新 token”，不提供查看旧 token。

## 主进程模块

建议新增：

```text
apps/electron/src/main/lib/local-api-server.ts
apps/electron/src/main/lib/local-api-types.ts
apps/electron/src/main/lib/local-api-settings-service.ts
```

职责划分：

- `local-api-server.ts`：HTTP Server 生命周期、路由、鉴权、SSE 连接、错误响应。
- `local-api-types.ts`：请求/响应类型、错误码、SSE 事件类型。
- `local-api-settings-service.ts`：读取、保存、校验配置和 token 生成。

主进程启动时：

1. 加载 local API 设置。
2. 如果 `enabled` 为 true，启动 HTTP Server。
3. 监听设置变更，必要时 stop/start。
4. 应用退出时关闭 HTTP Server 和所有 SSE 连接。

## 安全设计

默认安全策略：

- 默认关闭服务。
- 默认只监听 `127.0.0.1`。
- 非 health 接口必须 Bearer Token。
- 远程访问必须用户显式开启。
- 不默认允许 `bypassPermissions`。
- 不允许 API 请求任意覆盖底层环境变量。
- 不允许 API 直接传入任意 MCP server 配置；第一版只允许选择当前工作区已有 MCP server。动态 `customMcpServers` 暂不开放。
- 不开放任意文件读写接口；文件能力仍通过 Agent 权限和工作区边界控制。

CORS：

- 非浏览器调用不需要 CORS。
- 默认不返回宽松的 `Access-Control-Allow-Origin: *`。
- 用户配置来源后，只对匹配 origin 返回 CORS header。

日志：

- 默认记录请求路径、状态码、耗时、sessionId、runId。
- 默认不记录完整用户消息和 token。
- 错误日志使用中文，保留必要专业术语。

## 并发与运行状态

现有 Agent 并发规则是按 `sessionId` 加锁：

- 同一会话正在运行时，再发送消息返回 `409 session_busy`。
- 不同会话可以并发运行。
- `stopAgent(sessionId)` 只停止指定会话。

API 层需要做更清晰的状态映射：

- `session_busy`：同一 session 正在运行。
- `too_many_runs`：达到 API 设置中的最大并发会话数。
- `run_not_found`：订阅的 runId 不存在或已过期。
- `session_not_found`：sessionId 不存在。

运行状态只保存在内存中。应用重启后旧 runId 失效，历史消息仍在 JSONL 中。

## 错误码

建议第一版错误码：

```text
unauthorized
forbidden
not_found
invalid_json
invalid_request
session_not_found
session_busy
run_not_found
too_many_runs
permission_mode_forbidden
agent_error
internal_error
```

HTTP 状态映射：

- `400`：请求格式或字段错误。
- `401`：缺少或错误 token。
- `403`：权限模式或远程访问策略禁止。
- `404`：资源不存在。
- `409`：会话忙。
- `429`：达到最大并发。
- `500`：未预期错误。

## BDD 测试场景

### 创建会话

```text
Given 本地 API 服务已启用
And 请求携带正确 API Token
When 外部调用 POST /api/agent/sessions
Then 返回 200
And 响应包含 session.id
And Agent 会话索引中存在该会话
```

### 鉴权失败

```text
Given 本地 API 服务已启用
When 外部调用 POST /api/agent/sessions 且未携带 API Token
Then 返回 401
And 响应错误码为 unauthorized
```

### 发送消息

```text
Given 已存在 Agent 会话
And 本地 API 服务已启用
When 外部调用 POST /api/agent/sessions/:sessionId/messages
Then 返回 200
And 响应包含 runId
And Agent 开始通过 runAgentHeadless 执行
```

### 同会话并发

```text
Given 某 Agent 会话正在运行
When 外部再次向同一 sessionId 发送消息
Then 返回 409
And 响应错误码为 session_busy
```

### 不同会话并发

```text
Given 会话 A 正在运行
And 会话 B 不在运行
When 外部向会话 B 发送消息
Then 返回 200
And 会话 B 开始运行
```

### SSE 事件

```text
Given 外部已发送消息并获得 runId
When 外部订阅 GET /api/agent/sessions/:sessionId/events?runId=runId
Then 响应 content-type 为 text/event-stream
And 客户端收到 run_started 事件
And Agent 输出文本时客户端收到 delta 事件
And Agent 完成时客户端收到 done 事件
```

### 停止任务

```text
Given 某 Agent 会话正在运行
When 外部调用 POST /api/agent/sessions/:sessionId/stop
Then 返回 200
And stopAgent 被调用
And SSE 客户端收到 done 或 error 结束事件
```

### 禁止 bypassPermissions

```text
Given 本地 API 设置不允许 bypassPermissions
When 外部发送消息并请求 permissionMode 为 bypassPermissions
Then 返回 403
And 响应错误码为 permission_mode_forbidden
```

## 分阶段实施

### 第一阶段：后端最小闭环

- 新增 local API 设置服务。
- 新增本地 HTTP Server。
- 实现 health、创建会话、发送消息、SSE、停止任务。
- 实现 token 鉴权和基础错误码。
- 添加主进程单元测试。

### 第二阶段：设置界面

- 在设置页增加本地 API 服务配置。
- 支持启停、host、port、token 重置、权限模式和远程访问配置。
- 设置变化后热重启 server。

### 第三阶段：协议完善

- 增加事件缓冲和 replay。
- 增加并发上限。
- 增加 CORS 配置。
- 增加 API 文档片段和 curl 示例。
- 增加 `wait=true` 的同步等待模式，作为脚本调用的便利接口；默认仍使用 REST + SSE。
- 评估附件输入能力。若支持附件，必须复用 Agent 附件保存和路径校验链路，不开放任意路径读取。

## 文档同步

实现阶段如果功能落地，需要按仓库约定同步更新 `README.md` 和 `AGENTS.md`。本设计文档本身不改变产品功能，不直接修改这两个文件；实施完成后再请求用户允许并更新。

## 设计决策

- 默认端口固定为 `17373`。端口冲突时启动失败并在设置页展示错误，用户可手动修改端口。
- 设置入口采用独立的“本地 API 服务”Tab。
- 第一版不支持 `wait=true` 同步等待模式，只提供 REST + SSE。
- 第一版不支持附件输入。后续如支持附件，必须复用 Agent 附件保存和路径校验链路。
