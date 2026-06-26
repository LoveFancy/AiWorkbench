# hi-agent / SkillHub 统一认证方案

> 版本：v1.0
> 日期：2026-06-25
> 状态：设计阶段

---

## 一、背景

当前 hi-agent 和 SkillHub 使用**两套各自独立的认证机制**：

| | hi-agent | SkillHub |
|---|---|---|
| 认证方式 | 用户手动填写 Token | EIPGW-TOKEN 换票 |
| 凭证存储 | `{工作区}/connectors/hi-agent/secrets.json` | `~/.proma/skillhub-auth.json` |
| 运行时注入 | `collectCliConnectorEnv` 读 secrets.json → env | `skillHubFetch()` 读 skillhub-auth.json → Bearer |
| 存储加密 | safeStorage 加密 | safeStorage 加密 |

问题：
1. 用户要**手动填写 Token**，且不知道去哪获取
2. 换票回来的 Token 只给 SkillHub API 用，hi-agent 没法用
3. 两套存储位置，维护成本高

**目标**：统一为一个认证入口——**SkillHub 换票（EIPGW-TOKEN → accessToken）**，Token 统一存到 `~/.htskill/auth.json`，hi-agent 和 SkillHub API 都从这里读取。**不加密存储**。

---

## 二、auth.json 格式

### 2.1 存储位置

```
C:\Users\{username}\.htskill\auth.json      ← Windows
~/.htskill/auth.json                         ← macOS / Linux
```

### 2.2 数据结构

```json
{
  "uat": {
    "tokenType": "Bearer",
    "accessToken": "eyJhbGciOiJIUzUxMiJ9...",
    "expiresAt": "2026-07-02T07:10:53.569Z",
    "env": "uat",
    "gatewayBaseUrl": "http://talentshub-uat.sit.saas.htsc"
  }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `tokenType` | `string` | Token 类型，固定 `"Bearer"` |
| `accessToken` | `string` | 访问令牌 |
| `expiresAt` | `string` | ISO 8601 过期时间 |
| `env` | `string` | 环境标识，固定 `"uat"` |
| `gatewayBaseUrl` | `string` | API 网关地址 |

> **唯一写入方：SkillHub 换票**。明文存储，不加密。hi-agent 和 SkillHub API 都从 `uat` key 读取。

---

## 三、与 hi-agent 连接器的映射

### 3.1 当前 cli.json

```json
"userProvidedData": [
  { "name": "HTSKILL_TOKEN", "type": "password", "required": true },
  { "name": "AGENTOS_ENV", "type": "select", "options": ["dev","sit","uat","prd"] }
],
"env": {
  "HTSKILL_TOKEN": "{{HTSKILL_TOKEN}}",
  "AGENTOS_ENV": "{{AGENTOS_ENV}}"
}
```

### 3.2 改动后

移除所有用户输入，Token 从 auth.json 读取，环境固定 `uat`：

```json
"userProvidedData": [],
"env": {
  "HTSKILL_TOKEN": "{{HTSKILL_TOKEN}}",
  "AGENTOS_ENV": "uat"
}
```

映射关系：

```
auth.json.uat.accessToken  →  HTSKILL_TOKEN
cli.json.env.AGENTOS_ENV   →  "uat"（硬编码）
```

---

## 四、代码改动

### 4.1 新增 `hiagent-auth-service.ts`

文件：`apps/electron/src/main/lib/hiagent-auth-service.ts`

职责：读写 `~/.htskill/auth.json`，Token 过期时触发 SkillHub 换票。

```ts
interface HiAgentAuthEntry {
  tokenType: string
  accessToken: string
  expiresAt: string
  env: string
  gatewayBaseUrl: string
}

function getAuthPath(): string           // 返回 ~/.htskill/auth.json 路径
function readUatAuth(): HiAgentAuthEntry | null  // 读 uat key
function writeUatAuth(entry: HiAgentAuthEntry): void  // 写 uat key（明文）
function isExpired(entry: HiAgentAuthEntry): boolean  // 是否过期

// 获取有效 Token，过期自动换票
async function getValidUatToken(): Promise<HiAgentAuthEntry | null>
```

### 4.2 修改 `collectCliConnectorEnv`

[cli-connector-runtime.ts](../../apps/electron/src/main/lib/cli-connector-runtime.ts) 对 hi-agent 直接读 `~/.htskill/auth.json`：

```ts
for (const [connectorId, connector] of Object.entries(connectorsConfig.connectors)) {
  if (!connector.enabled || connector.type !== 'cli') continue

  const connectorDir = join(connectorsDir, connectorId)
  const definition = readCliConnectorDefinition(connectorDir)

  if (connectorId === 'hi-agent') {
    // 直接从 SkillHub 换票文件读取
    const auth = readUatAuth()
    if (auth) {
      Object.assign(env, resolveCliConnectorEnv(definition, {
        HTSKILL_TOKEN: auth.accessToken,
      }))
    }
  } else {
    const secrets = readCliConnectorSecrets(connectorDir)
    Object.assign(env, resolveCliConnectorEnv(definition, secrets))
  }
}
```

> `AGENTOS_ENV` 已硬编码在 `cli.json` 中为 `"uat"`，不需要从 auth.json 读。

### 4.3 hi-agent `cli.json` 最终版

```json
{
  "runtime": { "type": "node", "version": ">=20" },
  "init": {
    "darwin": "npm install -g @ht/talents-cli",
    "linux": "npm install -g @ht/talents-cli",
    "win32": "npm install -g @ht/talents-cli"
  },
  "versionCheck": {
    "command": {
      "darwin": "talents -V",
      "linux": "talents -V",
      "win32": "talents.cmd -V"
    },
    "minVersion": "1.0.0"
  },
  "userProvidedData": [],
  "status": {
    "darwin": "talents workspace --json",
    "linux": "talents workspace --json",
    "win32": "talents.cmd workspace --json"
  },
  "env": {
    "HTSKILL_TOKEN": "{{HTSKILL_TOKEN}}",
    "AGENTOS_ENV": "uat"
  }
}
```

### 4.4 初始化流程变化

`initializeCliConnector` 对 hi-agent（`connectorId === 'hi-agent'`）：

```
当前（6 步）：
  check-runtime → check-package → install-package → install-skill → write-config → self-check

改动后（5 步）：
  check-runtime → check-package → install-package → install-skill
  → check-auth
        ├── ~/.htskill/auth.json 存在且未过期 → 跳过
        └── 不存在或已过期
              → 自动 SkillHub 换票（EIPGW-TOKEN → accessToken）
              → 明文写入 ~/.htskill/auth.json 的 uat key
  → self-check（用 Token 自检）
  （删掉 write-config，不再写 secrets.json）
```

> EIP 未登录导致换票失败时，提示"请先登录 OA 账号"。

### 4.5 变更清单

| # | 文件 | 操作 | 说明 |
|---|------|------|------|
| 1 | `main/lib/hiagent-auth-service.ts` | 🆕 新增 | 读写 `~/.htskill/auth.json`，Token 过期触发 SkillHub 换票 |
| 2 | `main/lib/cli-connector-runtime.ts` | ✏️ 修改 | hi-agent 从 auth.json 读 Token，不走 secrets.json |
| 3 | `default-connectors/hi-agent/cli.json` | ✏️ 修改 | `userProvidedData` 清空，`AGENTOS_ENV` 硬编码 `"uat"` |
| 4 | `main/lib/default-connector-initializer.ts` | ✏️ 修改 | hi-agent 初始化新增 `check-auth` 步骤，删 `write-config` |
| 5 | `main/lib/skillhub-auth-service.ts` | ✏️ 修改 | 换票结果明文写 `~/.htskill/auth.json` 的 `uat` key，不再加密 |

---

## 五、Token 刷新流程

```
每次读取 Token：
  readUatAuth() → expiresAt 未过期 → 直接返回
                → 过期或文件不存在 → getValidUatToken()
                      → SkillHub 换票（EIPGW-TOKEN → POST /auth/token）
                      → 成功：明文写回 auth.json → 返回新 Token
                      → 失败：返回 null → 提示"请先登录 OA 账号"
```

过期时**不尝试 refreshToken**，直接重新换票。

---

## 六、前端 UI 变化

| 之前 | 之后 |
|------|------|
| 连接 hi-agent 需输入 Token + 环境下拉 | 全部移除，无需用户输入 |
| 无 auth.json 时显示错误 | 自动触发 SkillHub 换票 |
| — | 显示认证状态（已认证 / 已过期 / 未登录 OA） |

---

## 七、认证架构总览

```
                    ┌─────────────────┐
                    │   EIPGW-TOKEN   │  ← 用户登录 EIP 网关（365天）
                    │   (auth.json)   │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │  SkillHub 换票   │  ← POST /ai_skillhub_bff/api/v1/auth/token
                    │  Cookie: EIPGW-  │
                    │  TOKEN           │
                    └────────┬────────┘
                             │
                             ▼
              ┌──────────────────────────────┐
              │  ~/.htskill/auth.json        │
              │  { "uat": { accessToken } }  │
              └──────────────┬───────────────┘
                             │
               ┌─────────────┴─────────────┐
               ▼                            ▼
    ┌──────────────────┐        ┌──────────────────┐
    │ hi-agent 连接器    │        │ SkillHub API      │
    │ (connectorEnv)    │        │ (skillHubFetch)   │
    │ → HTSKILL_TOKEN   │        │ → Bearer token    │
    └──────────────────┘        └──────────────────┘

两个消费者，一个 Token 源，一套存储。
```

**换票触发时机**：

| 触发场景 | 说明 |
|---------|------|
| hi-agent 连接器初始化 | Token 不存在或过期 |
| SkillHub 面板打开 | 首次打开或 Token 即将过期 |
| API 返回 401 | 自动重新换票后重试 |
| `collectCliConnectorEnv` | 每次 Agent 请求时检测过期 |
