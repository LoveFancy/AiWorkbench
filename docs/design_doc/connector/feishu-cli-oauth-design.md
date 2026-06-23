# 飞书 CLI 连接器 — 认证设计

> 版本：v3.2  
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

### 1.2 目标（已实现）

用户扫码注册应用（无需手动填凭证）→ 发起 OAuth 设备授权流 → 浏览器确认授权 → 拿到 User Access Token + Refresh Token → 存为 lark-cli 兼容格式。

```
扫码注册 App → POST /oauth/v1/device_authorization → 展示授权 URL → 浏览器确认
  → 轮询 POST /open-apis/authen/v2/oauth/token (Phase 1)
  → 若拿不到 refresh_token → Phase 2: 重新获取 device_code 后重新轮询
  → 拿到 access_token + refresh_token
  → 写 config.json + Registry（DPAPI 加密） → lark-cli 可直接使用
```

---

## 二、认证流程

### 2.1 两阶段认证机制（实际实现）

代码实现了**两阶段认证**，而非设计文档最初描述的单阶段：

```
Phase 1: 
  startFeishuDeviceAuth(appId, appSecret)
  → POST /oauth/v1/device_authorization → 获取 device_code
  → pollFeishuDeviceAuth(phase=1) → 轮询 POST /authen/v2/oauth/token
  → 如果拿到 refresh_token → 认证完成
  → 如果拿不到 refresh_token → 自动进入 Phase 2

Phase 2:
  → 重新 POST /oauth/v1/device_authorization → 新 device_code
  → 前端重新展示新 URL，用户再次确认
  → pollFeishuDeviceAuth(phase=2) → 拿到完整的 access_token + refresh_token
```

### 2.2 API 端点（实际代码）

| 步骤 | 方法 | URL | 说明 |
|------|------|-----|------|
| 请求设备码 | `POST` | `https://accounts.feishu.cn/oauth/v1/device_authorization` | 用 App ID + Secret 换 device_code |
| 轮询获取 Token | `POST` | `https://open.feishu.cn/open-apis/authen/v2/oauth/token` | `grant_type=urn:ietf:params:oauth:grant-type:device_code` |
| 获取用户信息 | `GET` | `https://open.feishu.cn/open-apis/authen/v1/user_info` | 用 access_token 获取 openId + 用户名 |
| 解绑 | 删 config.json + Registry 凭据 | 不调用飞书 revoke API | 本地清理 |

代码：[feishu-device-auth.ts:105-170](file:///d:/code/workmate/dev/AiWorkbench/apps/electron/src/main/lib/feishu-device-auth.ts#L105-L170)

### 2.3 scope 默认值

```typescript
const DEVICE_AUTH_SCOPE = [
  'offline_access',
  'calendar:calendar:*', 'calendar:calendar.event:*', 'calendar:calendar.free_busy:read',
  'im:message', 'im:message:*', 'im:chat:*',
  'docx:document:*', 'docs:document:*',
  'drive:file:*', 'drive:drive.metadata:readonly',
  'sheets:spreadsheet:*', 'wiki:*',
  'task:task:*', 'mail:user_mailbox:*',
  'contact:user.basic_profile:readonly', 'contact:user:search',
  'approval:instance:read', 'approval:task:read',
  'search:message',
].join(' ')
```

---

## 三、存储格式

### 3.1 ~/.lark-cli/config.json（多 app 支持）

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

### 3.2 Windows Registry（DPAPI 加密存储）

```
HKEY_CURRENT_USER\Software\LarkCli\keychain\lark-cli
  ├── appsecret:{appId}     ← App Secret（DPAPI + entropy 加密）
  ├── token:{appId}:{openId}  ← StoredUAToken JSON（含 access_token / refresh_token / expiresAt 等）
```

entropy 格式：`"lark-cli\x00{account}"`

---

## 四、文件清单（实际实现）

| 文件 | 状态 | 说明 |
|------|------|------|
| `feishu-device-auth.ts` | 已实现 | OAuth 设备码流 + DPAPI 存储 + 两阶段认证 |
| `FeishuCliConnectorDialog.tsx` | 已实现 | 扫码注册 → 展示授权 URL → 轮询 → 完成 |
| `types/agent.ts` | 已实现 | `FeishuCliAuthState` / `FeishuCliDeviceCodeData` / `FeishuCliPollResult` |
| `ipc.ts` | 已实现 | 6 个 IPC handler + 2 个 event 推送 |
| `dpapi.ts` | 已实现 | 直接 require prebuild 二进制，绕过 `node-gyp-build` |
| `default-connectors/feishu-cli/connector.json` | 已实现 | 预设模板（type: cli, skillDirs: ["skill"]） |

---

## 五、前后端交互（实际 IPC 通道）

| IPC 通道 | 实际名称 | 入参 | 出参 | 说明 |
|----------|---------|------|------|------|
| 检查连接状态 | `agent:get-feishu-cli-auth-status` | - | `FeishuCliAuthState` | 检查 token 是否存在 |
| 注册飞书应用 | `agent:register-feishu-app` | - | `{ appId, appSecret }` | SDK registerApp() + QR 码流 |
| 取消注册 | `agent:cancel-feishu-cli-register` | - | void | AbortController |
| 发起设备授权 | `agent:start-feishu-device-auth` | `appId, appSecret` | `FeishuCliDeviceCodeData` | 写 Registry + config |
| 轮询 Token | `agent:poll-feishu-device-auth` | `appId, appSecret, deviceCode, phase` | `FeishuCliPollResult` | 两阶段认证 |
| 解绑 | `agent:unbind-feishu-cli` | - | `boolean` | 删 Registry + config.json |

Event 推送（前端接收）：

| Event | 数据 | 说明 |
|-------|------|------|
| `agent:feishu-cli-register-qrcode` | `{ url, expireIn }` | QR 码 URL，前端展示 |
| `agent:feishu-cli-register-status` | `{ status, interval }` | 注册状态变化 |

---

## 六、前端 UI 状态机（实际实现）

```
idle ──「连接飞书」→ registering ──QR码展示→ user_scan ──注册成功→ idle(有appId)
  │                        │                        │
  │                        └── 取消 → idle           └── 失败 → registering_error

idle(有appId) ──「开始授权」→ authorizing ──Phase 1 轮询成功→ connected
  │                              │
  │                              │ 无 refresh_token → Phase 2
  │                              │   → 重新展示 URL → 重新轮询 → connected / error
  │                              │
  │                              │ 超时/拒绝
  │                              ↓
  └─────── 点「重试」────── error ←─

connected ──「解绑」→ idle
```

---

## 七、DPAPI Native Binary 加载（已解决）

### 问题

`@primno/dpapi` 的 JS loader 依赖 `node-gyp-build`，Bun workspace hoist 导致 Electron 进程解析失败 → `"DPAPI is not supported on this platform."`

### 方案

[dpapi.ts](file:///d:/code/workmate/dev/AiWorkbench/apps/electron/src/main/lib/dpapi.ts) 直接 `require()` prebuild 二进制：

```typescript
const prebuildsDir = app.isPackaged
  ? join(process.resourcesPath, 'dpapi-prebuilds')       // 生产
  : join(__dirname, '..', 'node_modules', '@primno', 'dpapi', 'prebuilds')  // 开发
return require(join(prebuildsDir, `${platform}-${arch}`, '@primno+dpapi.node'))
```

### 打包

```yaml
# electron-builder.yml
extraResources:
  - from: node_modules/@primno/dpapi/prebuilds
    to: dpapi-prebuilds
```

### 影响

- 加密算法不变（DPAPI + entropy `"lark-cli\x00{account}"`，与 lark-cli 兼容）
- 不依赖 `node-gyp-build`，不受 Bun workspace / npm hoist 影响
