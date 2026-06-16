# Tool Builder：EIP 网关 Token 自动注入

> 版本：v1.0
> 日期：2026-06-16
> 状态：设计阶段

---

## 一、背景

Tool Builder 允许用户在 Chat 模式中创建自定义 HTTP 工具，通过 `chat-tools.json` 配置 API 端点、参数、认证方式等。

当前自定义工具的认证方式只有一种：在 `httpConfig.headers` 中硬编码静态凭据（如 `Authorization: Bearer xxx`）。对于华泰内部 EIP 网关域名的接口，需要携带 EIP 登录后获取的动态 Token（`EIPGW-TOKEN`），而该 Token 是运行时通过 `safeStorage` 解密获取的，无法硬编码到配置文件中。

### 现有 EIP Token 使用模式

项目中已有两个模块使用了 EIP Token 注入模式：

| 模块 | 文件 | 注入方式 |
|------|------|----------|
| 通用 HTTP 客户端 | `src/shared/hteip-client.ts` | `buildAuthCookie()` → `Cookie: EIPGW-TOKEN=...` |
| SkillHub 认证 | `src/main/lib/skillhub-auth-service.ts` | 直接 `import { getToken } from '../../auth/auth-service'` |

两者都复用了 `auth/auth-service.ts` 的 `getToken()` 函数，该函数从 `auth.json` 中通过 `safeStorage.decryptString()` 解密获取 Token。

---

## 二、需求描述

当 Tool Builder 创建的自定义工具的 `urlTemplate` 域名包含 `eip` 时（即目标是 EIP 网关后的内部接口），执行器应自动注入 `Cookie: EIPGW-TOKEN=<token>` 请求头，无需用户在配置中手动填写 Token。

### 判断条件

- 配置层面：`httpConfig` 新增 `useEipAuth: true` 字段，由 Agent（SKILL.md）在创建工具时自动判断并设置
- 运行时：执行器检测到 `useEipAuth === true` 时，调用 `getToken()` 注入 Cookie

### 示例配置

```json
{
  "id": "custom-query-staff",
  "name": "查询员工信息",
  "description": "通过工号查询员工基本信息",
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

---

## 三、修改范围

### 3.1 涉及文件

| 文件 | 操作 | 改动量 | 说明 |
|------|------|--------|------|
| `packages/shared/src/types/chat-tool.ts` | ✏️ 修改 | +3 行 | `ChatToolHttpConfig` 新增 `useEipAuth` 字段 |
| `apps/electron/src/main/lib/chat-tools/http-tool-executor.ts` | ✏️ 修改 | ~10 行 | 执行时检测 `useEipAuth`，注入 Cookie |
| `apps/electron/default-skills/tool-builder/SKILL.md` | ✏️ 修改 | ~15 行 | 文档新增 `useEipAuth` 说明 + 示例 |

**总计：3 个文件，约 30 行改动。**

### 3.2 不需要改动的文件

| 文件 | 原因 |
|------|------|
| `chat-tool-config.ts` | 配置读写逻辑不变，`useEipAuth` 只是 `httpConfig` 的一个字段，自动透传 |
| `chat-tool-registry.ts` | 工具注册/转换逻辑不变，`httpConfig` 不参与 `convertMetaToDefinition()` |
| `chat-tool-executor.ts` | 分发逻辑不变，仍然调用 `executeHttpTool()` |
| `chat-tools-watcher.ts` | 文件监听逻辑不变 |
| `auth/auth-service.ts` | 已有 `getToken()` 和 `buildAuthHeaders()`，无需修改 |
| `hteip-client.ts` | 不涉及，自定义工具执行器独立实现 |

---

## 四、详细设计

### 4.1 类型定义修改

`packages/shared/src/types/chat-tool.ts` — `ChatToolHttpConfig` 接口：

```typescript
export interface ChatToolHttpConfig {
  urlTemplate: string
  method: 'GET' | 'POST'
  headers?: Record<string, string>
  bodyTemplate?: string
  resultPath?: string
  /** 是否注入 EIP 网关认证 Cookie（EIPGW-TOKEN），默认 false */
  useEipAuth?: boolean
}
```

### 4.2 执行器修改

`apps/electron/src/main/lib/chat-tools/http-tool-executor.ts` — `executeHttpRequest()` 函数：

```typescript
import { getToken } from '../../auth/auth-service'

async function executeHttpRequest(
  args: Record<string, unknown>,
  config: ChatToolHttpConfig,
): Promise<unknown> {
  const url = replaceTemplatePlaceholders(config.urlTemplate, args, true)

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...config.headers,
  }

  // EIP 网关认证：自动注入 Cookie
  if (config.useEipAuth) {
    const token = getToken()
    if (token) {
      headers['Cookie'] = `EIPGW-TOKEN=${token}`
    }
    // Token 不存在时不阻断请求，由网关返回 401
  }

  // ... 后续逻辑不变
}
```

关键设计决策：
- **Token 不存在时不阻断**：不抛异常，让请求正常发出，由 EIP 网关返回 401，错误信息更明确
- **Cookie 优先级**：`config.headers` 中的 `Cookie` 会覆盖自动注入的（因为 `...config.headers` 在后面展开），用户可手动覆盖
- **不依赖 hteip-client**：自定义工具执行器保持独立，不引入 `hteip-client` 的复杂抽象（URL 拼接、超时合并等），只复用 `getToken()`

### 4.3 SKILL.md 修改

在 `httpConfig 字段说明` 表格中新增一行：

| 字段 | 必填 | 说明 |
|------|------|------|
| `useEipAuth` | 否 | 是否注入 EIP 网关认证 Cookie。当 `urlTemplate` 域名包含 `eip` 时自动设为 `true` |

新增示例：EIP 内部接口工具：

```json
{
  "id": "custom-staff-query",
  "name": "员工查询",
  "description": "通过工号查询员工信息",
  "params": [
    { "name": "jobId", "type": "string", "description": "工号", "required": true }
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

Agent 创建工具时的判断逻辑（写入 SKILL.md 工作流）：

> 当 `urlTemplate` 的域名部分包含 `eip` 时，自动设置 `"useEipAuth": true`，无需用户手动配置 Token。

---

## 五、数据流

```
用户创建工具（Agent 通过 SKILL.md）
  → 检测 urlTemplate 域名含 "eip"
  → 自动设置 useEipAuth: true
  → 写入 chat-tools.json
        ↓
Chat 模式 LLM 调用工具
  → chat-tool-executor 分发到 executeHttpTool()
  → executeHttpRequest() 检测 useEipAuth === true
  → getToken() 从 auth.json 解密获取 EIPGW-TOKEN
  → 注入 Cookie: EIPGW-TOKEN=xxx
  → 发起 HTTP 请求到 EIP 网关
```

---

## 六、边界情况

| 场景 | 行为 |
|------|------|
| `useEipAuth: true` 但用户未登录 | `getToken()` 返回 null，不注入 Cookie，请求正常发出，网关返回 401 |
| `useEipAuth: true` 且 `config.headers` 已有 Cookie | 用户手动设置的 Cookie 优先（展开顺序保证） |
| `useEipAuth: false`（默认） | 行为不变，完全向后兼容 |
| Token 已过期 | `getToken()` 内部检查 `expiresAt`，过期返回 null，同上 |
| 非 EIP 域名的工具 | `useEipAuth` 不设置或为 false，无任何影响 |

---

## 七、与现有模块的关系

```
auth/auth-service.ts
  ├── getToken()  ← 已有，被复用
  ├── buildAuthHeaders()  ← 已有，不直接使用（格式相同但独立实现更清晰）
  │
  ├──→ hteip-client.ts (buildAuthCookie)  ← 已有，不涉及
  ├──→ skillhub-auth-service.ts           ← 已有，不涉及
  └──→ http-tool-executor.ts              ← 🆕 新增调用点
```

不引入循环依赖：`http-tool-executor.ts` 单向依赖 `auth/auth-service.ts`，`auth/` 目录不依赖 `main/lib/`。
