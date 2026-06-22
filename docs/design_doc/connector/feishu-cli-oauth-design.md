# 飞书 CLI 连接器 — 认证设计

> 版本：v3.1  
> 日期：2026-06-22  
> 状态：已实现

---

## 一、背景与目标

### 1.1 当前状态

WorkMate 已有两套飞书集成：

| 集成方式 | 认证方式 | 存储位置 | 用途 |
|---------|---------|---------|------|
| 飞书 Bot Bridge | App ID + App Secret | `~/.workmate/feishu.json`，safeStorage 加密 | 接收飞书消息 |
| 飞书 CLI 连接器 | OAuth 2.0 设备码流 | `~/.lark-cli/config.json` + Registry | Agent 通过 lark-cli 操作飞书 |

### 1.2 目标

用户填 App ID + App Secret → 发起 OAuth 设备授权流 → 用户在浏览器确认授权 scope → 拿到 User Access Token + Refresh Token → 存为 lark-cli 兼容格式。

```
填凭证 → POST /authen/v1/device_token → 展示授权 URL → 用户浏览器确认
  → 轮询 POST /authen/v1/oidc/access_token → 拿到 user_access_token + refresh_token
  → 写 config.json + Registry → lark-cli 直接用
```

---

## 二、认证流程（OAuth 2.0 设备授权流）

### 2.1 API 端点总览

| 步骤 | 方法 | URL | 说明 |
|------|------|-----|------|
| 1. 请求设备码 | `POST` | `https://open.feishu.cn/open-apis/authen/v1/device_token` | 用 App ID + Secret 换 device_code |
| 2. 轮询获取 Token | `POST` | `https://open.feishu.cn/open-apis/authen/v1/oidc/access_token` | `grant_type=urn:ietf:params:oauth:grant-type:device_code` |
| 3. 刷新 Token | `POST` | `https://open.feishu.cn/open-apis/authen/v1/oidc/access_token` | `grant_type=refresh_token` |
| 4. 撤销 Token | `POST` | `https://open.feishu.cn/open-apis/authen/v1/revoke` | 解绑时调用 |

### 2.2 端点 1 — 请求设备码

```
POST https://open.feishu.cn/open-apis/authen/v1/device_token
Content-Type: application/json

{ "app_id": "cli_xxx", "app_secret": "xxx" }

Response (200):
{
  "code": 0,
  "data": {
    "device_code": "Z3j...",
    "user_code": "N2K...",
    "verification_uri_complete": "https://accounts.feishu.cn/oauth/device?user_code=N2K...",
    "expires_in": 600,
    "interval": 5
  }
}
```

### 2.3 端点 2 — 轮询获批

```
POST https://open.feishu.cn/open-apis/authen/v1/oidc/access_token
Content-Type: application/json

{
  "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
  "client_id": "cli_xxx",
  "client_secret": "xxx",
  "code": "Z3j..."
}

# 用户尚未确认（继续轮询）：
{ "code": 99991664, "msg": "authorization_pending" }

# 用户确认后：
{
  "code": 0,
  "access_token": "u-xxx",
  "refresh_token": "r-xxx",
  "token_type": "Bearer",
  "expires_in": 7200,
  "scope": "calendar:calendar:read im:message ..."
}
```

### 2.4 端点 3 — 刷新 Token

```
POST https://open.feishu.cn/open-apis/authen/v1/oidc/access_token
Content-Type: application/json

{
  "grant_type": "refresh_token",
  "refresh_token": "r-xxx"
}

Response: { "code": 0, "access_token": "u-new", "refresh_token": "r-new", "expires_in": 7200 }
```

### 2.5 端点 4 — 撤销 Token（解绑）

```
POST https://open.feishu.cn/open-apis/authen/v1/revoke
Content-Type: application/json

{ "token": "u-xxx" }
```

### 2.6 完整时序

```
WorkMate                 飞书开放平台                      用户浏览器
  │                          │                                │
  │── POST device_token ──→ │                                │
  │←── device_code + URL ── │                                │
  │                          │                                │
  │  展示授权 URL ──────────────────────────────────────────→ │
  │                          │←── 用户确认授权 scope ──────── │
  │                          │                                │
  │── POST oidc/access_token (device_code, polling) ───────→ │
  │←── { code: 99991664, pending } ───────────────────────   │
  │   ...polling every N seconds...                           │
  │── POST oidc/access_token (device_code) ────────────────→ │
  │←── { code: 0, access_token, refresh_token } ───────────  │
  │                          │                                │
  │  写 config.json + Registry                                 │
```

### 2.7 scope 默认值（对应 `lark-cli auth login --recommend`）

```
approval:approval
attendance:attendance
calendar:calendar
contact:contact
docs:doc
drive:drive
im:message
mail:mail
meeting_room:meeting_room
minutes:minutes
task:task
vc:vc
wiki:wiki
```

---

## 三、存储格式

### 3.1 ~/.lark-cli/config.json

```json
{
  "apps": [
    {
      "appId": "cli_xxxxxxxxxxxxxxxx",
      "appSecret": { "source": "keychain", "id": "appsecret:cli_xxx" },
      "brand": "feishu",
      "lang": "zh",
      "defaultAs": "user",
      "users": [{ "userOpenId": "ou_xxx", "userName": "张三" }]
    }
  ],
  "currentApp": "cli_xxxxxxxxxxxxxxxx"
}
```

### 3.2 Windows Registry（base64 编码）

```
HKCU\Software\LarkCli\keychain
  ├── appsecret:{appId}     ← App Secret
  ├── token:{appId}:access  ← user_access_token
  ├── token:{appId}:refresh ← refresh_token
  └── token:{appId}:scope   ← 授权的 scope 列表
```

---

## 四、文件清单

| 文件 | 改动类型 | 说明 |
|------|---------|------|
| `feishu-device-auth.ts` | 重写 | tenant_access_token → OAuth 设备码流（`requestDeviceCode` / `pollDeviceToken` / `refreshAccessToken` / `unbindFeishuCli`） |
| `FeishuCliConnectorDialog.tsx` | 重构 | App ID/Secret 表单 → 授权 URL 展示 + 轮询 UI |
| `types/agent.ts` | 修改 | 新增 `FeishuCliDeviceCodeData` / `FeishuCliPollResult`；移除 `FeishuCliAuthResult`；新增 2 个 IPC 通道，移除 `START_FEISHU_CLI_AUTH` |
| `ipc.ts` | 修改 | 新增 `REQUEST_FEISHU_DEVICE_CODE` / `POLL_FEISHU_DEVICE_TOKEN` handler；移除 `START_FEISHU_CLI_AUTH` |
| `preload/index.ts` | 修改 | 新增 `requestFeishuDeviceCode` / `pollFeishuDeviceToken`；移除 `connectFeishuCli` |

---

## 五、前后端交互

### 5.1 IPC 通道

| 通道 | 方向 | 入参 | 出参 | 说明 |
|------|------|------|------|------|
| `GET_FEISHU_CLI_AUTH_STATUS` | 前端→后端 | - | `FeishuCliAuthState` | 检查 token 是否存在 |
| `REQUEST_FEISHU_DEVICE_CODE` | 前端→后端 | `appId, appSecret` | `FeishuCliDeviceCodeData` | 请求设备码 + 写预置 config |
| `POLL_FEISHU_DEVICE_TOKEN` | 前端→后端 | `appId, appSecret, deviceCode` | `FeishuCliPollResult` | 轮询 token |
| `UNBIND_FEISHU_CLI` | 前端→后端 | - | `boolean` | 撤销 token + 清本地凭据 |

### 5.2 前端 UI 状态机

```
idle ──点「连接飞书」──→ authorizing ──轮询成功──→ done
  ↑                        │                         │
  │                        │ 超时/拒绝                │ 点「更换凭据」
  │                        ↓                         ↓
  └─────── 点「重试」────── error ←───────────────── idle
```

---

## 六、设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 认证方式 | OAuth 2.0 Device Authorization Grant | 飞书开放平台官方支持，无需回调 URL |
| Token 类型 | User Access Token (UAT) + Refresh Token | Agent 以用户身份操作飞书数据（消息/日历/文档） |
| scope | `--recommend` 对应集合（13 个域） | 覆盖常用飞书业务域，用户授权一次即可 |
| 轮询策略 | 按服务器返回的 `interval` 间隔，最多 `expiresIn / interval + 5` 次 | 跟随服务器节奏，防止频率过高 |
| 存储格式 | lark-cli 兼容（config.json + Registry） | lark-cli 可直接使用 |
| 解绑 | revoke + 删 config + 删 Registry | 服务端侧注销 + 本地清理 |
| Token 刷新 | 后端 `refreshAccessToken()` 函数 | lark-cli 可自行刷新也可由 WorkMate 手动触发 |

---

## 七、实施细则（代码对照）

> 以下对照设计文档与 [feishu-device-auth.ts](file:///d:/code/workmate/dev/AiWorkbench/apps/electron/src/main/lib/feishu-device-auth.ts)、[ipc.ts](file:///d:/code/workmate/dev/AiWorkbench/apps/electron/src/main/ipc.ts) 的实际实现，记录差异与实施细节。

### 7.1 API 端点差异

设计文档基于飞书开放平台文档编写，实际代码使用的端点有差异：

| API | 设计文档 | 实际代码 |
|-----|---------|---------|
| 请求设备码 | `POST /open-apis/authen/v1/device_token` | `POST /oauth/v1/device_authorization`（accounts 域名） |
| 轮询 Token | `POST /open-apis/authen/v1/oidc/access_token` | `POST /open-apis/authen/v2/oauth/token`（v2 版本） |

### 7.2 两阶段认证机制

设计文档描述的是单阶段轮询，实际代码实现了**两阶段认证**：

```
Phase 1: POST /oauth/v1/device_authorization → 获取 device_code
  → 轮询 POST /authen/v2/oauth/token
  → 如果拿到 refresh_token → 认证完成
  → 如果拿不到 refresh_token → 自动进入 Phase 2

Phase 2: 重新 POST /oauth/v1/device_authorization → 新 device_code
  → 用户再次在浏览器确认
  → 轮询 → 拿到完整的 access_token + refresh_token
```

代码实现在 [feishu-device-auth.ts:118-170](file:///d:/code/workmate/dev/AiWorkbench/apps/electron/src/main/lib/feishu-device-auth.ts#L118-L170)，通过 `phase` 参数（1→2）控制流程。

### 7.3 IPC 通道对照

| 设计文档 IPC 通道 | 实际 IPC 通道 | 说明 |
|-------------------|--------------|------|
| `GET_FEISHU_CLI_AUTH_STATUS` | `GET_FEISHU_CLI_AUTH_STATUS` | 一致 |
| `REQUEST_FEISHU_DEVICE_CODE` | `START_FEISHU_DEVICE_AUTH` | 名称不同 |
| `POLL_FEISHU_DEVICE_TOKEN` | `POLL_FEISHU_DEVICE_AUTH` | 名称不同，多一个 `phase` 参数 |
| `UNBIND_FEISHU_CLI` | `UNBIND_FEISHU_CLI` | 一致 |
| 未提及 | `REGISTER_FEISHU_APP` | 新增：通过 lark SDK 注册飞书应用 |
| 未提及 | `CANCEL_FEISHU_CLI_REGISTER` | 新增：取消注册流程 |
| 未提及 | `FEISHU_CLI_REGISTER_QRCODE` | 新增：推送 QR 码给前端（event） |
| 未提及 | `FEISHU_CLI_REGISTER_STATUS` | 新增：推送注册状态给前端（event） |

### 7.4 App 注册流程

设计文档未描述飞书应用注册步骤，实际代码新增了完整的注册流程：

1. 前端调用 `REGISTER_FEISHU_APP` → 后端调用 `larksuiteoapi/node-sdk` 的 `registerApp()`
2. 后端通过 event 推送 QR 码 URL（`FEISHU_CLI_REGISTER_QRCODE`）→ 前端展示
3. 后端通过 event 推送状态变化（`FEISHU_CLI_REGISTER_STATUS`）→ 前端更新 UI
4. 用户扫码确认后返回 `appId` + `appSecret` → 进入设备授权流程

### 7.5 scope 范围差异

设计文档用 `lark-cli --recommend` 对应的 13 个 scope 域，实际代码扩展为更细粒度的 scope 列表（[feishu-device-auth.ts:33-51](file:///d:/code/workmate/dev/AiWorkbench/apps/electron/src/main/lib/feishu-device-auth.ts#L33-L51)），包含日历事件的细分权限、飞书消息的子权限等。

### 7.6 存储实现

| 组件 | 设计文档 | 实际代码 |
|------|---------|---------|
| Region path | `HKCU\Software\LarkCli\keychain` | `HKEY_CURRENT_USER\Software\LarkCli\keychain\lark-cli` |
| DPAPI entropy | 未描述 | `'lark-cli\x00{account}'` 格式 |
| config.json | 固定结构 | 多 app 支持：`apps` 数组 + `currentApp` |
| Token 结构 | 简单 key-value | JSON 序列化的 `StoredUAToken`（含 expiresAt、refreshExpiresAt、grantedAt 等字段） |

### 7.7 前端 UI 状态机（实际实现）

设计文档的状态机在代码中扩展了"注册应用"阶段：

```
idle ──「连接飞书」→ registering ──QR码展示→ user_scan ──注册成功→ idle(有appId)
  │                        │                        │
  │                        └── 取消 → idle           └── 失败 → registering_error
  
idle(有appId) ──「开始授权」→ authorizing ──轮询成功→ connected
  │                              │
  │                              │ 超时/拒绝
  │                              ↓
  └─────── 点「重试」────── error ←─

connected ──「解绑」→ idle
```

### 7.8 核心代码文件对照

| 设计文档文件 | 实际文件 | 状态 |
|-------------|---------|------|
| `feishu-device-auth.ts` | [feishu-device-auth.ts](file:///d:/code/workmate/dev/AiWorkbench/apps/electron/src/main/lib/feishu-device-auth.ts) | 已实现（204 行） |
| `FeishuCliConnectorDialog.tsx` | [FeishuCliConnectorDialog.tsx](file:///d:/code/workmate/dev/AiWorkbench/apps/electron/src/renderer/components/agent-skills/FeishuCliConnectorDialog.tsx) | 已实现 |
| `types/agent.ts` | [agent.ts](file:///d:/code/workmate/dev/AiWorkbench/packages/shared/src/types/agent.ts) | 已添加 `FeishuCliDeviceCodeData`、`FeishuCliPollResult`、`FeishuCliAuthState` |
| `ipc.ts` | [ipc.ts](file:///d:/code/workmate/dev/AiWorkbench/apps/electron/src/main/ipc.ts) | 已添加 7 个 IPC handler |
| `preload/index.ts` | preload | 已添加 API 桥接 |
