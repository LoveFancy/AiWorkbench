# QClaw 对接飞书 OAuth 认证技术文档

> 版本：1.0\
> 日期：2026-06-22\
> 环境：Windows 10 / QClaw v0.2.27.560 / lark-cli v1.0.55

***

## 1. 概述

QClaw（管家）通过 **OAuth 2.0 Device Authorization Grant（RFC 8628）** 协议对接飞书开放平台，实现用户身份认证和 API 授权。认证完成后，凭证以 **lark-cli 兼容格式** 存储，使 lark-cli 可以直接读取并调用飞书 API。

### 1.1 架构总览

```
┌─────────────┐     ┌──────────────┐     ┌──────────────────┐     ┌──────────────┐
│  QClaw 管家  │────▶│  lark-cli     │────▶│  飞书开放平台 API  │────▶│  飞书服务端    │
│  (Electron)  │     │  (二进制 CLI)  │     │  (open.feishu.cn) │     │              │
└─────────────┘     └──────────────┘     └──────────────────┘     └──────────────┘
       │                    │
       │  写入凭证（兼容格式） │  读取凭证 + 调用 API
       ▼                    ▼
┌──────────────────────────────────────┐
│         本地凭证存储                   │
│  ~/.lark-cli/config.json (非敏感)     │
│  Windows Registry (敏感, DPAPI加密)   │
└──────────────────────────────────────┘
```

### 1.2 角色分工

| 组件               | 角色                   | 说明                 |
| ---------------- | -------------------- | ------------------ |
| QClaw 管家         | OAuth Client         | 发起认证、管理 token 生命周期 |
| lark-cli         | API Client           | 读取 token、调用飞书 API  |
| 飞书开放平台           | Authorization Server | 颁发 token、验证权限      |
| Windows Registry | Token Store          | 加密存储敏感凭证           |

***

## 2. 飞书开放平台接口

### 2.1 接口清单

| # | 接口                                 | 方法   | 用途          | 认证方式                          |
| - | ---------------------------------- | ---- | ----------- | ----------------------------- |
| 1 | `/oauth/v1/app/registration`       | POST | 动态注册个人应用    | 无需认证                          |
| 2 | `/oauth/v1/device_authorization`   | POST | 发起设备授权      | client\_id                    |
| 3 | `/open-apis/authen/v2/oauth/token` | POST | 获取/刷新 token | device\_code / refresh\_token |
| 4 | `/open-apis/authen/v1/user_info`   | GET  | 获取用户信息      | access\_token                 |

**Base URL：** `https://open.feishu.cn`

### 2.2 接口详情

#### 2.2.1 注册应用

```
POST https://open.feishu.cn/oauth/v1/app/registration
```

**请求体：**

```json
{
  "archetype": "PersonalAgent",
  "auth_method": "client_secret"
}
```

**响应体：**

```json
{
  "code": 0,
  "data": {
    "app_id": "cli_aab9ebcda679dcef",
    "app_secret": "xxxxxxxxxxxxxxxx"
  }
}
```

**说明：**

- `archetype: "PersonalAgent"` — 应用类型为"个人代理"，每个用户注册独立应用
- 每个用户首次连接飞书时动态注册，生成唯一的 `appId` + `appSecret`

***

#### 2.2.2 设备授权

```
POST https://open.feishu.cn/oauth/v1/device_authorization
```

**请求体：**

```json
{
  "client_id": "cli_aab9ebcda679dcef",
  "client_secret": "xxxxxxxxxxxxxxxx",
  "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
  "scope": "offline_access calendar:calendar:read im:message ..."
}
```

**响应体：**

```json
{
  "code": 0,
  "data": {
    "device_code": "xxxxx",
    "user_code": "ABCD1234",
    "verification_uri": "https://open.feishu.cn/page/cli?user_code=ABCD1234",
    "verification_uri_complete": "https://open.feishu.cn/page/cli?user_code=ABCD1234",
    "expires_in": 600,
    "interval": 5
  }
}
```

**说明：**

- `verification_uri` — 管家弹出此 URL，用户在浏览器中打开并扫码确认
- `interval` — 轮询 token 接口的最小间隔（秒）
- `expires_in` — device\_code 有效期（秒）

***

#### 2.2.3 获取 Token

```
POST https://open.feishu.cn/open-apis/authen/v2/oauth/token
```

**请求体（设备码模式）：**

```json
{
  "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
  "device_code": "xxxxx",
  "client_id": "cli_aab9ebcda679dcef",
  "client_secret": "xxxxxxxxxxxxxxxx"
}
```

**请求体（刷新模式）：**

```json
{
  "grant_type": "refresh_token",
  "refresh_token": "xxxxx",
  "client_id": "cli_aab9ebcda679dcef",
  "client_secret": "xxxxxxxxxxxxxxxx"
}
```

**响应体：**

```json
{
  "code": 0,
  "data": {
    "access_token": "t-xxxxx",
    "refresh_token": "ur-xxxxx",
    "token_type": "Bearer",
    "expires_in": 6900,
    "refresh_token_expires_in": 604800,
    "scope": "offline_access calendar:calendar:read ..."
  }
}
```

**轮询状态码：**

| 状态                      | 含义              | 处理       |
| ----------------------- | --------------- | -------- |
| `authorization_pending` | 用户尚未确认          | 继续轮询     |
| `slow_down`             | 轮询过快            | 增大间隔后继续  |
| `expired_token`         | device\_code 过期 | 重新发起设备授权 |
| `access_denied`         | 用户拒绝授权          | 终止流程     |

***

#### 2.2.4 获取用户信息

```
GET https://open.feishu.cn/open-apis/authen/v1/user_info
Authorization: Bearer {access_token}
```

**响应体：**

```json
{
  "code": 0,
  "data": {
    "open_id": "ou_81c11994fe6f0e891429a56eb3337c24",
    "name": "AnKh",
    "tenant_key": "xxx"
  }
}
```

***

## 3. 认证流程

### 3.1 完整时序图

```
用户            QClaw管家                 飞书开放平台              用户浏览器
 │                 │                         │                      │
 │  点击"连接飞书"   │                         │                      │
 │────────────────▶│                         │                      │
 │                 │  ① POST /app/registration │                      │
 │                 │────────────────────────▶│                      │
 │                 │  ← appId + appSecret     │                      │
 │                 │                         │                      │
 │                 │  ② POST /device_authorization │                 │
 │                 │────────────────────────▶│                      │
 │                 │  ← device_code + user_code   │                  │
 │                 │                         │                      │
 │                 │  ③ 弹出验证URL             │                      │
 │◀────────────────│  open.feishu.cn/page/cli │                      │
 │                 │    ?user_code=ABCD1234   │                      │
 │                 │                         │                      │
 │  在浏览器中打开   │                         │    ④ 用户扫码确认     │
 │─────────────────────────────────────────────────────────────────▶│
 │                 │                         │◀─────────────────────│
 │                 │                         │                      │
 │                 │  ⑤ 轮询 POST /oauth/token │                     │
 │                 │────────────────────────▶│                      │
 │                 │  ← authorization_pending │                      │
 │                 │                         │                      │
 │                 │  ⑥ 继续轮询...            │                      │
 │                 │────────────────────────▶│                      │
 │                 │  ← access_token + refresh_token                │
 │                 │                         │                      │
 │                 │  ⑦ GET /user_info        │                      │
 │                 │────────────────────────▶│                      │
 │                 │  ← openId + userName     │                      │
 │                 │                         │                      │
 │                 │  ⑧ 保存凭证（lark-cli兼容格式）│                   │
 │                 │                         │                      │
 │  连接成功 ✓      │                         │                      │
 │◀────────────────│                         │                      │
```

### 3.2 两阶段认证

认证过程分为两个阶段，确保同时获得 bot 身份和 user 身份的 token：

#### Phase-1：Bot Token

```
目的：获取应用级别的 bot token
流程：标准设备授权流
结果：access_token（可能带或不带 refresh_token）
```

**日志标识：**

```
[lark] [phase-1] New app! starting first device authorization round...
[lark] [phase-1] Got user token with refresh_token, auth complete
```

**如果 Phase-1 只拿到 scope 授权但没有 refresh\_token：**

```
[lark] [phase-1] No refresh_token! scope authorization only, proceeding to phase 2...
```

#### Phase-2：User Token

```
目的：获取用户级别的 token（带 refresh_token）
前提：等待 5 秒（让 scope 授权在飞书侧生效）
流程：再次发起设备授权，带 request_user_info=true
结果：access_token + refresh_token（用户级别）
```

**日志标识：**

```
[lark] [phase-2] Waiting 5s for scope approval to propagate...
[lark] [phase-2] Starting second device authorization for user identity...
[lark] [phase-2] Got user token with refresh_token, auth complete
```

**如果 Phase-2 仍未拿到 refresh\_token：**

```
[lark] [phase-2] Still no refresh_token after phase-2! Token is likely bot/app token, not user token.
```

***

## 4. 凭证存储

### 4.1 存储架构

```
~/.lark-cli/
├── config.json                              ← 非敏感信息（明文 JSON）
└── openclaw/                                ← 管家额外写入
    ├── config.json                          ← 同结构的配置副本
    ├── cache/                               ← 元数据缓存
    ├── locks/                               ← token 刷新锁（防并发）
    │   └── refresh_{appId}_{openId}.lock
    └── logs/                                ← 认证日志
        └── auth-{date}.log

Windows Registry:
  Software\LarkCli\keychain                  ← 敏感信息（DPAPI 加密）
    ├── appsecret:{appId}                    ← 应用密钥
    ├── token:{appId}:bot                    ← bot access_token
    ├── token:{appId}:user:{openId}          ← user access_token
    └── refresh:{appId}:user:{openId}        ← refresh_token
```

### 4.2 config.json 结构

```json
{
  "apps": [
    {
      "appId": "cli_aab9ebcda679dcef",
      "appSecret": {
        "source": "keychain",
        "id": "appsecret:cli_aab9ebcda679dcef"
      },
      "brand": "feishu",
      "lang": "zh",
      "defaultAs": "user",
      "users": [
        {
          "userOpenId": "ou_81c11994fe6f0e891429a56eb3337c24",
          "userName": "AnKh"
        }
      ]
    }
  ],
  "currentApp": "cli_aab9ebcda679dcef"
}
```

**关键字段说明：**

| 字段                   | 说明                                 |
| -------------------- | ---------------------------------- |
| `appId`              | 飞书应用 ID（非敏感）                       |
| `appSecret.source`   | 标记"去系统密钥库查找"，值为 `"keychain"`       |
| `appSecret.id`       | 密钥库中的查找 key，格式 `appsecret:{appId}` |
| `brand`              | 品牌标识，`"feishu"` 或 `"lark"`         |
| `defaultAs`          | 默认身份，`"user"` 表示以用户身份调用 API        |
| `users[].userOpenId` | 用户 Open ID                         |
| `users[].userName`   | 用户名                                |
| `currentApp`         | 当前使用的应用 appId                      |

### 4.3 Windows Registry 加密机制

**存储位置：** `HKCU\Software\LarkCli\keychain`

**加密方式：** master.key + DPAPI（Data Protection API）

```
master.key 文件
     │
     ▼ 加密密钥
DPAPI (Windows Data Protection API)
     │
     ▼ 绑定当前 Windows 用户
Registry 中的加密数据
```

**特点：**

- 使用 Windows 原生 DPAPI 加密，密钥绑定当前 Windows 用户
- master.key 文件存储在本地，用于辅助加密/解密
- 其他 Windows 用户无法解密当前用户的凭证
- lark-cli 启动时自动读取并解密

### 4.4 Token 刷新机制

```
lark-cli 调用 API
       │
       ▼
  返回 401 (token 过期)
       │
       ▼
  自动用 refresh_token 调用 /oauth/token
  grant_type=refresh_token
       │
       ▼
  获取新 access_token + refresh_token
       │
       ▼
  写回 Windows Registry
       │
       ▼
  用新 token 重试原请求
```

**刷新锁：** `locks/refresh_{appId}_{openId}.lock` 防止多个 lark-cli 进程并发刷新 token。

**有效期：**

| Token 类型           | 有效期            |
| ------------------ | -------------- |
| access\_token      | \~2 小时         |
| refresh\_token     | 7 天            |
| refresh\_token 过期后 | 需在管家「连接」面板重新授权 |

***

## 5. 授权范围（Scope）

当前 QClaw 请求的完整 scope 列表：

### 日历

| Scope                              | 说明     |
| ---------------------------------- | ------ |
| `calendar:calendar:read`           | 读取日历   |
| `calendar:calendar:create`         | 创建日历   |
| `calendar:calendar:update`         | 更新日历   |
| `calendar:calendar:delete`         | 删除日历   |
| `calendar:calendar.event:read`     | 读取日程事件 |
| `calendar:calendar.event:create`   | 创建日程事件 |
| `calendar:calendar.event:update`   | 更新日程事件 |
| `calendar:calendar.event:delete`   | 删除日程事件 |
| `calendar:calendar.free_busy:read` | 查询忙闲   |

### 消息

| Scope                              | 说明        |
| ---------------------------------- | --------- |
| `im:message`                       | 消息基础权限    |
| `im:message:readonly`              | 读取消息      |
| `im:message.send_as_user`          | 以用户身份发消息  |
| `im:message.p2p_msg:get_as_user`   | 获取单聊消息    |
| `im:message.group_msg:get_as_user` | 获取群聊消息    |
| `im:message.reactions:read`        | 读取表情回复    |
| `im:message.reactions:write_only`  | 添加表情回复    |
| `im:message.pins:read`             | 读取 Pin 消息 |
| `im:message.pins:write_only`       | Pin 消息    |
| `im:chat:read`                     | 读取群信息     |
| `im:chat:update`                   | 更新群信息     |
| `im:chat.members:read`             | 读取群成员     |
| `im:chat.members:write_only`       | 管理群成员     |

### 文档与云盘

| Scope                           | 说明      |
| ------------------------------- | ------- |
| `docx:document:readonly`        | 读取文档    |
| `docx:document:create`          | 创建文档    |
| `docx:document:write_only`      | 编辑文档    |
| `docs:document:copy`            | 复制文档    |
| `docs:document:export`          | 导出文档    |
| `docs:document.content:read`    | 读取文档内容  |
| `drive:file:upload`             | 上传文件    |
| `drive:file:download`           | 下载文件    |
| `drive:drive.metadata:readonly` | 读取云盘元数据 |
| `sheets:spreadsheet:read`       | 读取表格    |
| `sheets:spreadsheet:write_only` | 写入表格    |
| `sheets:spreadsheet:create`     | 创建表格    |
| `wiki:wiki:readonly`            | 读取知识库   |
| `wiki:space:read`               | 读取知识空间  |
| `wiki:node:read`                | 读取知识节点  |
| `wiki:node:create`              | 创建知识节点  |

### 其他

| Scope                                 | 说明                      |
| ------------------------------------- | ----------------------- |
| `task:task:read`                      | 读取任务                    |
| `task:task:write`                     | 写入任务                    |
| `mail:user_mailbox:readonly`          | 读取邮件                    |
| `mail:user_mailbox.message:send`      | 发送邮件                    |
| `contact:user.basic_profile:readonly` | 读取联系人基本信息               |
| `contact:user:search`                 | 搜索联系人                   |
| `approval:instance:read`              | 读取审批实例                  |
| `approval:task:read`                  | 读取审批任务                  |
| `search:message`                      | 搜索消息                    |
| `offline_access`                      | 离线访问（refresh\_token 必需） |

***

## 6. 故障排查

### 6.1 常见问题

| 问题                       | 原因                    | 解决方案                |
| ------------------------ | --------------------- | ------------------- |
| `authorization_pending`  | 用户未扫码确认               | 提醒用户打开验证 URL        |
| `slow_down`              | 轮询间隔过短                | 增大轮询间隔（默认 5s → 10s） |
| `expired_token`          | device\_code 过期       | 重新发起设备授权            |
| `access_denied`          | 用户拒绝授权                | 重新发起，引导用户确认         |
| Phase-2 无 refresh\_token | scope 授权未生效           | 等待更长时间后重试           |
| master.key 文件损坏          | 文件被覆盖或删除              | 删除后重新授权（自动重新生成）     |
| Token 过期无法刷新             | refresh\_token 超过 7 天 | 在管家「连接」面板重新授权       |

### 6.2 日志位置

| 日志            | 路径                                          |
| ------------- | ------------------------------------------- |
| lark-cli 认证日志 | `~/.lark-cli/openclaw/logs/auth-{date}.log` |
| 管家日志          | QClaw 应用日志                                  |

### 6.3 重置认证

```powershell
# 方式一：通过 lark-cli 登出
lark-cli auth logout

# 方式二：删除配置文件（完全重置）
Remove-Item -Recurse -Force "$env:USERPROFILE\.lark-cli"

# 重置后在管家「连接」面板重新授权
```

***

## 7. 安全考虑

| 方面                     | 措施                                 |
| ---------------------- | ---------------------------------- |
| **Token 传输**           | 全程 HTTPS 加密                        |
| **Token 存储**           | Windows DPAPI 加密，绑定当前用户            |
| **appSecret 存储**       | 不明文存储，使用 keychain 引用 + Registry 加密 |
| **跨用户隔离**              | DPAPI 绑定 Windows 用户，其他用户无法解密       |
| **Token 刷新**           | 自动刷新，减少 token 泄露窗口                 |
| **refresh\_token 有效期** | 7 天，过期后必须重新授权                      |
| **Scope 最小化**          | 仅请求必要权限                            |

***

## 8. 附录

### 8.1 OAuth 2.0 Device Authorization Grant 流程 (RFC 8628)

```
1. Client 向 Authorization Server 请求 device_code
2. Authorization Server 返回 device_code + user_code + verification_uri
3. Client 向用户展示 verification_uri + user_code
4. 用户在浏览器中打开 URL，输入 user_code 并授权
5. Client 轮询 Authorization Server 获取 token
6. 用户授权后，Client 获得 access_token + refresh_token
```

### 8.2 相关文档

- [飞书开放平台 OAuth 2.0 文档](https://open.feishu.cn/document/common-capabilities/sso/api/get-access_token)
- [RFC 8628: OAuth 2.0 Device Authorization Grant](https://datatracker.ietf.org/doc/html/rfc8628)
- [lark-cli GitHub](https://github.com/larksuite/cli)

### 8.3 关键源码位置

| 文件                                 | 说明                         |
| ---------------------------------- | -------------------------- |
| `openclaw/dist/extensions/feishu/` | QClaw 飞书扩展（JS 编译）          |
| `lark-cli/bin/lark-cli.exe`        | lark-cli 二进制（\~25MB，Go 编译） |
| `lark-cli/scripts/run.js`          | lark-cli 入口脚本              |
| `app.asar`                         | QClaw Electron 主应用包        |

