---
name: tool-builder
description: 交互式创建和管理 Chat 模式的自定义 HTTP 工具。当用户想要创建新的 API 工具、配置 Chat 工具、添加自定义工具、管理自定义工具、或说"帮我创建一个 XX 工具"时使用此 Skill。也适用于调试、修复或删除已有的自定义工具。
version: "1.1.0"
---
version: "1.1.0"
---
# Tool Builder

通过交互式对话帮助用户创建可在 Chat 模式中使用的自定义 HTTP API 工具。

## 工作流程

### 1. 需求收集

向用户了解：
- 工具用途（查天气、翻译、汇率等）
- API 端点 URL 和认证方式
- 需要哪些参数（名称、类型、是否必填）
- HTTP 方法（GET/POST）
- 响应中需要提取哪部分数据

如果用户不确定具体 API，帮助推荐合适的公开 API。

### 2. 构建配置

根据收集的信息构建工具配置 JSON。配置文件位于 `~/.proma/chat-tools.json`。

#### 配置文件结构

```json
{
  "toolStates": {
    "memory": { "enabled": true },
    "web-search": { "enabled": false },
    "custom-weather": { "enabled": true }
  },
  "toolCredentials": {},
  "customTools": [
    {
      "id": "custom-weather",
      "name": "天气查询",
      "description": "查询指定城市的当前天气信息",
      "params": [
        { "name": "city", "type": "string", "description": "城市名称", "required": true }
      ],
      "category": "custom",
      "executorType": "http",
      "httpConfig": {
        "urlTemplate": "https://wttr.in/{{city}}?format=j1",
        "method": "GET",
        "resultPath": "current_condition"
      }
    }
  ]
}
```

#### ChatToolMeta 字段说明

| 字段 | 必填 | 说明 |
|------|------|------|
| `id` | 是 | 唯一标识，必须以 `custom-` 前缀 + slug 格式（如 `custom-weather`） |
| `name` | 是 | 显示名称 |
| `description` | 是 | 工具描述，AI 据此决定何时调用。**不超过两句话**（40-80 字），聚焦"做什么、什么时候用"。不要写 API 文档式长描述 |
| `params` | 是 | 参数列表，每个含 `name`/`type`/`description`/`required` |
| `category` | 是 | 固定为 `"custom"` |
| `executorType` | 是 | 固定为 `"http"` |
| `httpConfig` | 是 | HTTP 请求配置 |
| `icon` | 否 | Lucide 图标名（如 `"Cloud"`、`"Languages"`） |
| `systemPromptAppend` | 否 | 启用时注入的系统提示词 |

#### httpConfig 字段说明

| 字段 | 必填 | 说明 |
|------|------|------|
| `urlTemplate` | 是 | URL 模板，`{{paramName}}` 占位符会被参数值替换（自动 URL 编码） |
| `method` | 是 | `"GET"` 或 `"POST"` |
| `headers` | 否 | 请求头，常用于 API Key 认证：`{ "Authorization": "Bearer xxx" }` |
| `bodyTemplate` | 否 | POST 请求体 JSON 模板，`{{paramName}}` 占位符会被替换（不编码） |
| `resultPath` | 否 | 点号路径提取响应中的特定字段（如 `"data.results"`） |
| `useEipAuth` | 否 | 是否注入 EIP 网关认证 Cookie（EIPGW-TOKEN）。当 URL 域名包含 `eip` 时自动设为 `true` |

#### 参数类型

`params[].type` 支持：`"string"` / `"number"` / `"boolean"`

- 参数描述不超过 **一句话**（15 字以内），简洁说明参数含义
- `enum` 仅用于 `string` 类型参数，限制可选值

可选添加 `enum` 字段限制可选值：
```json
{ "name": "unit", "type": "string", "description": "温度单位", "enum": ["celsius", "fahrenheit"] }
```

### 3. 写入配置

操作步骤：
1. 读取 `~/.proma/chat-tools.json`（如不存在则创建）
2. 将新工具追加到 `customTools` 数组（按 `id` 去重）
3. 在 `toolStates` 中添加 `{ "enabled": true }` 使其默认启用
4. 写回文件（保持 JSON 格式化）

写入后应用会自动检测文件变化并刷新工具列表。

### 4. 测试引导

告知用户：
- "工具已创建并启用，可在 Chat 或 Agent 模式中使用"
- "在 Chat 输入框左下角的工具选择器中应该能看到新工具"
- "试着问一个需要用到这个工具的问题"
- "如果有问题，告诉我，我帮你调试"

### 5. 调试修复

用户反馈问题时，常见原因：
- URL 模板错误 → 修正 `urlTemplate`
- 参数映射不对 → 调整 `params` 定义
- 响应格式变化 → 修改 `resultPath`
- 认证失败 → 检查 `headers` 中的 API Key
- 超时 → 检查 API 可达性

修复后重新写入 `chat-tools.json`，应用自动刷新。

### 6. 删除工具

从 `customTools` 数组中移除对应工具，同时删除 `toolStates` 中的条目。

## 完整示例：天气查询工具

```json
{
  "id": "custom-weather",
  "name": "天气查询",
  "description": "查询指定城市的当前天气和温度信息。当用户询问天气时调用。",
  "params": [
    { "name": "city", "type": "string", "description": "城市名称（英文）", "required": true }
  ],
  "category": "custom",
  "executorType": "http",
  "httpConfig": {
    "urlTemplate": "https://wttr.in/{{city}}?format=j1",
    "method": "GET",
    "resultPath": "current_condition"
  }
}
```

## 完整示例：翻译工具（POST + API Key）

```json
{
  "id": "custom-translate",
  "name": "翻译",
  "description": "将文本翻译为目标语言。当用户需要翻译时调用。",
  "params": [
    { "name": "text", "type": "string", "description": "要翻译的文本", "required": true },
    { "name": "target_lang", "type": "string", "description": "目标语言代码", "required": true, "enum": ["EN", "ZH", "JA", "KO", "FR", "DE", "ES"] }
  ],
  "category": "custom",
  "executorType": "http",
  "httpConfig": {
    "urlTemplate": "https://api.example.com/translate",
    "method": "POST",
    "headers": { "Authorization": "Bearer YOUR_API_KEY" },
    "bodyTemplate": "{\"text\": \"{{text}}\", \"target_lang\": \"{{target_lang}}\"}",
    "resultPath": "translations.0.text"
  }
}
```

## 完整示例：EIP 网关内部接口工具

当接口域名包含 `eip` 时，自动启用 `useEipAuth: true`，会注入当前登录的 EIPGW-TOKEN Cookie。

```json
{
  "id": "custom-eip-staff-query",
  "name": "员工查询",
  "description": "通过工号查询员工信息，使用 EIP 网关认证。",
  "params": [
    { "name": "jobId", "type": "string", "description": "员工工号", "required": true }
  ],
  "category": "custom",
  "executorType": "http",
  "httpConfig": {
    "urlTemplate": "http://eip.htsc.com.cn/api/staff/{{jobId}}",
    "method": "GET",
    "useEipAuth": true
  }
}
```

## 关于 EIP 认证

当创建的工具 URL 域名包含 `eip` 时，请自动添加 `"useEipAuth": true`。这样工具执行时会自动获取当前登录用户的 EIPGW-TOKEN 并注入到请求头中，无需用户手动配置认证信息。
