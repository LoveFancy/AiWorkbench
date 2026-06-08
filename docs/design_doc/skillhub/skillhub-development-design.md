# SkillHub 开发详细设计

> 版本：v1.0
> 日期：2026-06-04
> 状态：设计阶段
> 基于：[skillhub-auth-design.md](./skillhub-auth-design.md) | [skillhub-management-design.md](./skillhub-management-design.md) | [skill hub对接接口集合.openapi.json](./skill hub对接接口集合.openapi.json)

---

## 一、总览

### 1.1 目标

基于现有 SkillHub 对接基础（56% 能力覆盖），补齐认证鉴权、卸载、更新检测、批量操作、启用/禁用 UI 等缺失能力，形成完整的远程 Skill 生命周期管理闭环。

### 1.2 涉及模块

```
┌─────────────────────────────────────────────────────────────────┐
│                        前端 (Renderer)                           │
│  AgentSettings.tsx → HtSkillHubPanel → SkillHubPanel.tsx（重构） │
│  ├── Skill 列表（搜索/筛选/状态）                                 │
│  ├── 安装/卸载/启用/禁用/检查更新                                  │
│  ├── 批量操作栏                                                   │
│  └── 认证状态 UI                                                 │
├─────────────────────────────────────────────────────────────────┤
│                        IPC 通道 (Preload)                        │
│  现有 5 个 + 新增 6 个 = 11 个 SkillHub 通道                      │
├─────────────────────────────────────────────────────────────────┤
│                       后端服务 (Main Process)                    │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────────┐ │
│  │ auth-service.ts  │  │skillhub-auth-   │  │skillhub-service  │ │
│  │ (EIP 登录模块)    │  │  service.ts     │  │  .ts             │ │
│  │ + EIPGW-TOKEN     │  │ (换票 + 缓存)    │  │ (全部切新接口)    │ │
│  └─────────────────┘  └─────────────────┘  └──────────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│                      外部服务                                    │
│  EIP 网关 ← → SkillHub 认证服务 ← → SkillHub API                │
└─────────────────────────────────────────────────────────────────┘
```

### 1.3 能力覆盖目标

| 分类 | 当前 | 目标 | 具体改动 |
|------|------|------|---------|
| **列表展示** | 100% (5/5) | 100% | **改造**：接口从 `GET /.well-known/skills/index.json` 切到 `POST /market/skills`，增加服务端 `keyword`/`category` 筛选，删除前端本地过滤逻辑 |
| **预览** | 100% (1/1) | 100% | **改造**：不再单独请求 `SKILL.md` 文件，改为从 `GET /market/skills/{name}` 的 `readme` 字段展示 |
| **安装** | 100% (2/2) | 100% | **改造**：下载从逐个文件拉取改为 `POST /download/{name}/{version}`，安装后写入 `.proma-source.json` 来源标记 |
| **开关** | 50% (1/2) | 100% | **新增**：前端接入已有的 `toggleWorkspaceSkill` IPC，提供启用/禁用按钮 |
| **卸载** | 33% (1/3) | 100% | **新增**：`uninstallHtSkillHubSkill()` 删除 `skills/` + `skills-inactive/` 同名目录 |
| **更新检测** | 0% (0/1) | 100% | **新增**：`checkSkillUpdates()`，semver 比较本地 `installedVersion` vs 远端 `version`，只查已激活 Skill |
| **批量操作** | 0% (0/2) | 100% | **新增**：`batchInstall` / `batchUninstall`，并发上限 3 |
| **认证鉴权** | 0% (0/1) | 100% | **新增**：EIP 登录 → `POST /auth/token` 换取 accessToken |

---

## 二、认证鉴权模块

### 2.1 改造策略

**直接复用 fanxuande 分支的 EIP 登录模块**（`apps/electron/src/auth/`），不再自己写 `auth-service.ts`。

fanxuande 分支已打通完整链路：
- EIP 登录 → 获取长期 EIPGW-TOKEN（365天）→ `safeStorage` 加密存 `auth.json`
- `getToken()` 读回 EIPGW-TOKEN
- `buildAuthHeaders()` 自动构造 `Cookie: EIPGW-TOKEN=...`

SkillHub 换票直接用这个 EIPGW-TOKEN（长期 Token，不是短期 JWT），不再搞短期+长期双 Token 的复杂设计。

### 2.2 认证流程

```
① EIP 登录（fanxuande 已有）        ② SkillHub 换票（本设计新增）      ③ 调用 API
──────────────────────────         ────────────────────────         ──────────
POST /gateway/login                 POST /auth/token
  → EIPGW-TOKEN (365d)              Cookie: EIPGW-TOKEN={长期Token}
  → safeStorage → auth.json           │
                                      ▼
getToken() 读回 EIPGW-TOKEN         { accessToken, expiresIn }        所有 API 请求带:
                                      │                              Authorization: Bearer {accessToken}
                                      ▼
                                    safeStorage 加密
                                    → skillhub-auth.json：
                                    { accessToken, expiresAt }

accessToken 过期 → 重新调 /auth/token（EIPGW-TOKEN 365天有效，基本不会过期）
```

### 2.3 涉及文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `apps/electron/src/auth/` | 🔄 **已有** | fanxuande 分支已合入，无需改动 |
| `apps/electron/src/main/lib/skillhub-auth-service.ts` | 🆕 **新增** | `POST /auth/token` 换票 + 缓存 |
| `apps/electron/src/main/lib/skillhub-service.ts` | ✏️ **修改** | 旧 `.well-known` → 新 `/market/skills` 接口 |
| `apps/electron/src/main/ipc.ts` | ✏️ **修改** | 注册 1 个认证 handler |
| `apps/electron/src/preload/index.ts` | ✏️ **修改** | 暴露 `skillHubAuthenticate()` |

### 2.4 数据存储

**auth.json** — fanxuande 已有，不动（`~/.proma/auth.json`）

```json
{
  "encryptedToken": "<safeStorage base64>",
  "expiresAt": 1748950000000,
  "createdAt": 1717372000000,
  "jobId": "022480",
  "lastLoginAt": 1717372000000
}
```

**skillhub-auth.json** — 本设计新增（`~/.proma/skillhub-auth.json`）

```json
{
  "accessToken": "<safeStorage base64>",
  "expiresAt": 1717405200000
}
```

### 2.5 `skillhub-auth-service.ts` 核心接口

```typescript
import { getToken } from '../../../auth/auth-service'   // ← 复用 fanxuande 的 getToken()

const SKILLHUB_AUTH_URL = 'http://skillhub.uat.saas.htsc/ai_skillhub_bff/api/v1/auth/token?clientId=proma'

/** 用长期 EIPGW-TOKEN 换 SkillHub accessToken */
async function exchangeToken(): Promise<string>
// POST /auth/token?clientId=proma
// Cookie: EIPGW-TOKEN={getToken()}   ← 直接用长期 Token
// → { accessToken, expiresIn } → 写入 skillhub-auth.json

/** 获取有效的 SkillHub Token */
async function getValidSkillHubToken(): Promise<string>
// 缓存有效且未过期 → 直接返回
// 过期 → 重新调 exchangeToken()

/** 认证状态 */
function getSkillHubAuthStatus(): { authenticated: boolean; expiresAt?: number }
function clearSkillHubAuth(): void
```

### 2.6 SkillHub API 请求

所有 SkillHub API 请求通过 `skillHubFetch()` 统一入口，自动注入 `Authorization: Bearer`：

```typescript
const SKILLHUB_API_BASE = 'http://skillhub.uat.saas.htsc'

async function skillHubFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = await getValidSkillHubToken()
  return fetch(`${SKILLHUB_API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init?.headers as Record<string, string> | undefined),
      Authorization: `Bearer ${token}`,   // ← Bearer 头，不是 Cookie
    },
  })
}
```

**两种 Token 两种 Header**：

| 请求目标 | Token | Header |
|---------|-------|--------|
| EIP 网关 | EIPGW-TOKEN（长期 365d） | `Cookie: EIPGW-TOKEN=...` |
| SkillHub API | skillhub_token（换票得来） | `Authorization: Bearer ...` |

### 2.7 认证状态机

```
          ┌──────────┐   isLoggedIn()=false     ┌──────────────┐
          │not_      │──────────────────────────→│              │
    ┌────→│logged_in │                           │     EIP      │
    │     └────┬─────┘                           │  token 过期  │
    │          │ EIP 登录                          └──────┬───────┘
    │          │ (fanxuande LoginView)                    │ 重新登录
    │          ▼                                         │
    │     ┌──────────┐                                   │
    │     │authenti- │   exchangeToken()                  │
    │     │cating    │←──用 EIPGW-TOKEN 换票─────────────┘
    │     └────┬─────┘
    │          │ 换票成功
    │          ▼
    │     ┌──────────┐   accessToken 过期    ┌──────────────┐
    └────→│connected │──重新调 exchangeToken→│ unreachable  │
          └──────────┘                     └──────────────┘
```

> 环境：当前对接 **UAT**（`skillhub.uat.saas.htsc`），暂不改环境变量，先用一个 Token 打通。多环境（test/prod 双 Token）放到后续。

---

## 三、SkillHub API 对接

### 3.1 端点全览

基于 OpenAPI 规范（`skill hub对接接口集合.openapi.json`）：

| 端点 | 方法 | 用途 | 状态 | 认证 |
|------|------|------|------|------|
| `/ai_skillhub_bff/api/v1/auth/token` | POST | 签发 JWT Token（业务方换票） | 🆕 新增 | Cookie |
| `/ai_skillhub_service/api/v1/market/skills` | POST | **Skill 列表查询** | 🆕 新增 | Bearer |
| `/ai_skillhub_service/api/v1/market/skills/{name}` | GET | **Skill 详情**（含版本历史，readme 字段） | 🆕 新增 | Bearer |
| `/ai_skillhub_service/api/v1/skills/download/{name}/{version}` | POST | **按版本下载 Skill 包** | 🆕 新增 | Bearer |

> 旧的 `/.well-known/skills` 接口**直接删除**，不走渐进式迁移。


### 3.2 核心接口：Skill 列表查询 `POST /market/skills`

#### 3.2.1 请求参数 `SkillListRequest`

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `keyword` | `string` | 否 | — | **模糊搜索**：匹配 Skill 名称或描述 |
| `category` | `string` | 否 | — | **业务专区分类筛选**，文本输入，暂不拉取分类列表 |
| `env` | `string` | 否 | `"all"` | 环境筛选：`"test"` \| `"prod"` \| `"all"` |
| `page` | `integer` | 否 | `1` | 页码 |
| `pageSize` | `integer` | 否 | `20` | 每页数量，最大 `100` |
| `sort` | `string` | 否 | `"updated"` | 排序字段：`"updated"` \| `"downloads"` \| `"name"` |
| `order` | `string` | 否 | `"desc"` | 排序方向：`"asc"` \| `"desc"` |

请求示例：

```json
{
  "keyword": "天气",
  "category": "工具",
  "env": "all",
  "page": 1,
  "pageSize": 20,
  "sort": "updated",
  "order": "desc"
}
```

#### 3.2.2 入参与前端 UI 映射

> **前端只暴露 `keyword` 和 `category` 两个参数**，其余使用默认值。

| 入参 | UI 控件 | 默认值 | 说明 |
|------|---------|--------|------|
| `keyword` | 🔍 搜索输入框 | `""` | **模糊搜索**：按名称/描述匹配，用户输入后请求 |
| `category` | 📝 文本输入框 | `""`（全部） | **业务专区分类筛选**，暂做文本输入 |
| `env` | 隐藏 | `"all"` | 环境，固定默认值 |
| `page` | 隐藏 | `1` | 页码，固定默认值 |
| `pageSize` | 隐藏 | `20` | 每页数量，固定默认值 |
| `sort` | 隐藏 | `"updated"` | 排序字段，固定默认值 |
| `order` | 隐藏 | `"desc"` | 排序方向，固定默认值 |

#### 3.2.3 响应 `SkillListResponse`

```json
{
  "code": "200",
  "message": "操作成功",
  "success": true,
  "data": [ /* SkillMetadata[] */ ]
}
```

#### 3.2.4 `SkillMetadata` 完整字段

| 字段 | 类型 | 说明 | 前端展示 |
|------|------|------|---------|
| `skillName` | `string` | Skill 名称（含 scope，如 `@ht-skills/weather-skill`） | 列表主标题 |
| `displayName` | `string` | 显示名称（不含 scope） | 卡片副标题 |
| `description` | `string` | Skill 描述 | 列表描述区、详情页 |
| `category` | `string` | 分类 / 业务专区 | 标签/badge |
| `tags` | `string[]` | 标签列表 | 标签行 |
| `owner` | `string` | 所有人工号 | 详情页 |
| `ownerName` | `string` | 所有者姓名 | 详情页 |
| `version` | `string` | 当前环境版本（如 `"1.0.0"`） | 版本标识 |
| `author` | `string` | 作者邮箱 | 详情页 |
| `license` | `string` | 许可证类型 | 详情页 |
| `readme` | `string` | README 文档（Markdown） | **详情预览面板** |
| `dependencies` | `string` | 依赖包（JSON 对象字符串） | 详情页 |
| `envVars` | `string` | 环境变量配置（JSON 数组字符串） | 详情页 |
| `downloadCount` | `number` | 下载量 | 热度标识 |
| `lastUpdated` | `string` | 最后更新时间（ISO datetime） | 时间显示 |
| `versions` | `SkillVersionHistory[]` | 版本历史列表 | 更新检测对比 |
| `status` | `string` | 状态：`"published"` / `"draft"` / `"archived"` | 状态标识 |
| `permission` | `SkillPermission` | 权限信息 | 详情页 |
| `permissionApplicationStatus` | `number` | 权限申请状态：`0`-未申请，`1`-申请中 | 操作按钮切换 |
| `createdAt` | `string` | 创建时间 | 详情页 |
| `updatedAt` | `string` | 最后更新时间 | 详情页 |
| `businessOwnerId` | `string` | 业务负责人工号（可选） | 详情页 |
| `businessOwnerName` | `string` | 业务负责人姓名（可选） | 详情页 |

**子类型**：

```typescript
// 版本历史
interface SkillVersionHistory {
  version: string          // "1.0.0"
  description: string      // "初始版本"
  publishedAt: string      // "2026-04-20T10:30:00"
}

// 权限
interface SkillPermission {
  role: '0' | '1' | '2'   // 0-所有者, 1-使用者, 2-查看者
  grantedAt: string
  grantedBy: string        // 授权人工号
  grantedByName: string    // 授权人姓名
}
```

#### 3.2.5 分页策略

`POST /market/skills` 返回 `data: SkillMetadata[]` 数组。前端采用**滚动加载**方式：

- 初始加载 `page=1`，`pageSize=20`
- 用户滚动到底部时自动加载下一页（`page + 1`），追加到列表末尾
- 返回数据不足 `pageSize` 时表示已加载完毕，停止加载
- 下拉刷新时重置为 `page=1`

前端状态：`{ items: SkillMetadata[], page: number, hasMore: boolean, loading: boolean }`

### 3.3 旧接口删除清单

旧的 `/.well-known/skills` 接口**全部删除**，对应代码一并清理：

| 文件 | 删除/改造内容 |
|------|-------------|
| `main/lib/skillhub-service.ts` | 🗑️ `HT_SKILLHUB_BASE_URL` 常量 |
| 同上 | 🗑️ `buildSkillFileUrl()` 函数 |
| 同上 | 🗑️ `readHtSkillHubSkillContent()`（改为调 `GET /market/skills/{name}` 取 `readme` 字段） |
| 同上 | ✏️ `installHtSkillHubSkill()` 内部下载逻辑改造（改为 `POST /download/{name}/{version}`） |
| `preload/index.ts` | 🗑️ `readHtSkillHubSkill()`（改为从详情接口取 readme） |
| `renderer/.../AgentSettings.tsx` | 🗑️ 前端本地 SKILL.md 请求改为展示详情接口的 `readme` 字段 |
| `shared/types/agent.ts` | 🗑️ `HtSkillHubSkill` 旧类型（替换为新 `SkillMetadata`） |

---

## 四、Skill 管理模块

### 4.1 现有基础

| 能力 | 位置 | 状态 | 备注 |
|------|------|------|------|
| `fetchHtSkillHubIndex()` | `skillhub-service.ts` | ✏️ **改造** | 改为调用 `POST /market/skills`，入参增加 `keyword`/`category`，返回 `SkillMetadata[]` |
| `readHtSkillHubSkillContent()` | `skillhub-service.ts` | 🗑️ **删除** | 改为调用 `GET /market/skills/{name}` 取 `readme` 字段 |
| `installHtSkillHubSkill()` | `skillhub-service.ts` | ✏️ **改造** | 下载逻辑改为 `POST /download/{name}/{version}` 取 zip 包，安装后写入 `.proma-source.json` |
| `deleteWorkspaceSkill()` | `agent-workspace-manager.ts` | ✅ |
| `toggleWorkspaceSkill()` | `agent-workspace-manager.ts` | ✅ |
| `getAllWorkspaceSkills()` | `agent-workspace-manager.ts` | ✅ |

### 4.2 新增接口

```typescript
// ============ skillhub-service.ts 新增 ============

/** 卸载从 Hub 安装的 Skill */
export async function uninstallHtSkillHubSkill(
  workspaceSlug: string, skillName: string
): Promise<void>
// rm -rf skills/{name} + skills-inactive/{name}

/** 检查已安装 Skill 的更新 */
export async function checkSkillUpdates(
  workspaceSlug: string
): Promise<SkillUpdateInfo[]>
// 1. 调用 POST /market/skills 获取远端版本列表
// 2. 遍历本地已激活的 Skill（`skills/` 目录）
// 3. 读取 .proma-source.json 中的 installedVersion
// 4. 与远端版本对比 → 生成更新列表

/** 批量安装 Skill */
export async function batchInstallHtSkillHubSkills(
  workspaceSlug: string,
  skillNames: string[],
  overwrite?: boolean
): Promise<HtSkillHubInstallResult[]>
// 并发上限 3，逐个调用 installHtSkillHubSkill

/** 批量卸载 Skill */
export async function batchUninstallHtSkillHubSkills(
  workspaceSlug: string,
  skillNames: string[]
): Promise<void>

// ============ skillhub-service.ts 修改现有 ============

/** 安装时写入 .proma-source.json */
// installHtSkillHubSkill() 在安装完成后：
// 写入 {skillsDir}/{skillName}/.proma-source.json = {
//   type: 'skillhub',
//   skillName: skill.name,
//   installedAt: new Date().toISOString(),
//   installedVersion: skill.version
}
```

### 4.3 来源标记机制

```
skills/{name}/
├── SKILL.md
├── scripts/...
└── .proma-source.json        ← 安装完成后自动写入
    {
      "type": "skillhub",           // 来源类型
      "skillName": "code-review",   // Hub 上的原始名称
      "installedAt": "2026-06-03T10:00:00Z",
      "installedVersion": "1.2.0"   // 安装时的版本号
    }
```

这个标记的影响：

- **更新检测**：对比 `installedVersion` 与远端版本
- **前端区分**：列表中对 Hub 来源的显示卸载按钮，本地自建的隐藏

### 4.4 下载安装流程

`POST /skills/download/{name}/{version}` 返回一个 **zip 包**（`application/zip`）。

> **依赖**：Node.js 无内置 zip 解压。需引入 `adm-zip` 或 `unzipper`（需在 `package.json` 新增依赖并审批）。

安装流程：

```
POST /download/{name}/{version}
  ↓
Response: zip binary
  ↓
1. 写入临时文件： {tmpDir}/{name}.zip
2. 解压到临时目录：{tmpDir}/{name}/
3. 校验必要文件（SKILL.md 必须存在）
   ├─ 校验失败 → 删除临时目录 + Toast "安装包不完整，缺少 SKILL.md"
   ├─ zip 解压失败 → 删除临时文件 + Toast "安装包已损坏，请稍后重试"
   └─ 均保留已有旧版本不删除
4. 读取远端 SkillMetadata.version 作为 installedVersion
5. 若目标目录已存在（覆盖安装）→ rmSync(skillsDir/{name}, { recursive: true })
6. renameSync(tmpDir/{name}, skillsDir/{name}) 原子移动
7. 写入 skillsDir/{name}/.proma-source.json
8. 清理临时目录
```

跨文件系统时 `renameSync` 可能失败，需提供 fallback：

1. 优先 `renameSync(tmpPath, targetPath)`
2. 失败 → `cpSync(tmpPath, targetPath, { recursive: true })` → `rmSync(tmpPath, { recursive: true })`
3. 任一步失败 → 删除目标半成品目录，保留旧版本

### 4.5 更新检测流程

**思路**：直接从已有的 Skill 数据中取本地已安装的版本号，与 Hub 返回的远端版本号做对比。

```
checkSkillUpdates(workspaceSlug)
│
├─ 1. 调用 POST /market/skills（获取所有远端 Skill 及版本）
│     response: SkillMetadata[] → 每个有 .version 字段
│
├─ 2. 构建远端版本 Map:  { skillName → latestVersion }
│
├─ 3. 遍历本地已激活的 Skill（只查 `skills/` 目录）
│     ├─ 从 .proma-source.json 取 installedVersion
│     └─ 与远端版本做 semver 字符串比较
│
└─ 4. 返回 SkillUpdateInfo[]
      {
        skillName: "code-review",
        currentVersion: "1.2.0",
        latestVersion: "1.3.0",
        hasUpdate: true       // installedVersion < latestVersion
      }
```

**版本比较**：直接用 semver 字符串比较（如 `semver.lt("1.2.0", "1.3.0")`），版本号格式统一为 `x.y.z`。

---

## 五、IPC 通道设计

### 5.1 通道全览

```typescript
// 现有（参数扩展）
GET_HT_SKILLHUB_SKILLS       → fetchHtSkillHubIndex(workspaceSlug, keyword?, category?)
READ_HT_SKILLHUB_SKILL       → readHtSkillHubSkillContent(skillName)
INSTALL_HT_SKILLHUB_SKILL    → installHtSkillHubSkill(input)

// 已有但前端未用的（需前端接入）
DELETE_WORKSPACE_SKILL       → deleteWorkspaceSkill(workspaceSlug, skillSlug)  // 通用删除（任何来源）
TOGGLE_WORKSPACE_SKILL       → toggleWorkspaceSkill(workspaceSlug, skillSlug, enabled)

// 新增（SkillHub 专用）
SKILLHUB_AUTH_STATUS         → getSkillHubAuthStatus()
SKILLHUB_AUTHENTICATE        → exchangeToken()
UNINSTALL_HT_SKILLHUB_SKILL  → uninstallHtSkillHubSkill(workspaceSlug, skillName)  // 对 Hub Skill 的"卸载"语义，前端按钮文案用"卸载"
CHECK_SKILL_UPDATES          → checkSkillUpdates(workspaceSlug)
BATCH_INSTALL_HT_SKILLHUB    → batchInstallHtSkillHubSkills(input)
BATCH_UNINSTALL_HT_SKILLHUB  → batchUninstallHtSkillHubSkills(input)
```

### 5.2 IPC 注册（`ipc.ts`）

```typescript
// 新增 handler
ipcMain.handle(AGENT_IPC_CHANNELS.SKILLHUB_AUTH_STATUS, async () => {
  const { getSkillHubAuthStatus } = await import('./lib/skillhub-auth-service')
  return getSkillHubAuthStatus()
})

ipcMain.handle(AGENT_IPC_CHANNELS.SKILLHUB_AUTHENTICATE, async () => {
  const { exchangeToken } = await import('./lib/skillhub-auth-service')
  return exchangeToken()
})

ipcMain.handle(AGENT_IPC_CHANNELS.UNINSTALL_HT_SKILLHUB_SKILL, async (_event, workspaceSlug: string, skillName: string) => {
  const { uninstallHtSkillHubSkill } = await import('./lib/skillhub-service')
  return uninstallHtSkillHubSkill(workspaceSlug, skillName)
})

ipcMain.handle(AGENT_IPC_CHANNELS.CHECK_SKILL_UPDATES, async (_event, workspaceSlug: string) => {
  const { checkSkillUpdates } = await import('./lib/skillhub-service')
  return checkSkillUpdates(workspaceSlug)
})

ipcMain.handle(AGENT_IPC_CHANNELS.BATCH_INSTALL_HT_SKILLHUB, async (_event, input: BatchSkillOperationInput) => {
  const { batchInstallHtSkillHubSkills } = await import('./lib/skillhub-service')
  return batchInstallHtSkillHubSkills(input.workspaceSlug, input.skillNames, input.overwrite)
})

ipcMain.handle(AGENT_IPC_CHANNELS.BATCH_UNINSTALL_HT_SKILLHUB, async (_event, input: BatchSkillOperationInput) => {
  const { batchUninstallHtSkillHubSkills } = await import('./lib/skillhub-service')
  return batchUninstallHtSkillHubSkills(input.workspaceSlug, input.skillNames)
})
```

### 5.3 Preload 类型声明（`preload/index.ts`）

```typescript
// window.electronAPI 新增
getSkillHubAuthStatus(): Promise<{ authenticated: boolean; expiresAt?: number; remainingSeconds?: number }>
skillHubAuthenticate(): Promise<void>
uninstallHtSkillHubSkill(workspaceSlug: string, skillName: string): Promise<void>
checkSkillUpdates(workspaceSlug: string): Promise<SkillUpdateInfo[]>
batchInstallHtSkillHubSkills(workspaceSlug: string, skillNames: string[], overwrite?: boolean): Promise<HtSkillHubInstallResult[]>
batchUninstallHtSkillHubSkills(workspaceSlug: string, skillNames: string[]): Promise<void>
// 已有但前端未用的
toggleWorkspaceSkill(workspaceSlug: string, skillSlug: string, enabled: boolean): Promise<void>
deleteWorkspaceSkill(workspaceSlug: string, skillSlug: string): Promise<void>
```

---

## 六、前端 UI 设计

### 6.1 组件架构

```
AgentSettings.tsx
├── Tabs
│   ├── [Settings] tab
│   │   └── ...（现有设置）
│   └── [SkillHub] tab
│       └── SkillHubPanel.tsx                     ← 🆕 提取为独立文件
│           ├── AuthStatusBar.tsx                 ← 🆕 认证状态栏
│           ├── Toolbar.tsx                       ← 🆕 搜索/分类筛选/刷新
│           │   ├── 🔍 关键词模糊搜索输入框（keyword）
│           │   ├── 📝 分类文本输入框（category）
│           │   └── 刷新按钮
│           ├── SkillList.tsx                     ← 🆕 Skill 卡片列表
│           │   └── SkillCard.tsx                 ← 🆕 单个 Skill 卡片
│           │       ├── 名称/描述/版本/标签
│           │       ├── 操作按钮（安装/卸载/启用/禁用/更新/预览）
│           │       └── 状态标识
│           └── SkillPreviewPanel.tsx             ← 🆕 右侧预览面板
│               └── Markdown 渲染 SKILL.md 内容
```

### 6.2 Skill 卡片操作矩阵

```
状态              操作行
────────────────────────────────────────────────
❌ 未安装          [🔍 预览] [⬇️ 安装]
✅ 已安装·已启用    [🔍 预览] [🗑️ 卸载] [⏸ 禁用]
✅ 已安装·已禁用    [🔍 预览] [🗑️ 卸载] [▶️ 启用]
🔄 有更新          [🔍 预览] [⬆️ 更新] [🗑️ 卸载]
```

### 6.3 批量操作栏

```
┌──────────────────────────────────────────────────────────────┐
│ ☐ 全选 (3/10)     [⬇️ 批量安装] [🗑️ 批量卸载]               │
└──────────────────────────────────────────────────────────────┘
```

### 6.4 认证状态栏

```
┌──────────────────────────────────────────────────────────────┐
│ 🔒 未登录 · [前往登录]                                      │
│ ⏳ 正在连接 SkillHub...                                       │
│ ✅ 已连接 · Skill 列表可用                                    │
│ 🔄 EIP 凭证过期 · [重新登录]                                  │
│ ⚠️ SkillHub 不可用 · [重试]                                  │
└──────────────────────────────────────────────────────────────┘
```

**离线降级策略**：

SkillHub 不可用时（网络不通、换票失败、API 5xx），面板进入降级模式：

- **仍可用**：已安装 Skill 列表（从本地 `skills/` 目录读取）、启用/禁用开关、预览已安装 Skill 的 SKILL.md（从本地文件读取）
- **不可用**：搜索远端 Skill、安装、卸载、更新检测、批量操作——对应按钮置灰
- **状态栏**：显示"⚠️ SkillHub 不可用 · [重试]"；点击重试触发重新换票并拉取列表
- **首次进入无本地数据**：显示空状态 + "无法连接 SkillHub，请检查网络后重试"

### 6.5 关键交互流程

**安装 Skill**：

```
点击 [安装] → 检查认证状态
           ├─ 未登录 → 引导登录，不发起安装
           ├─ token 过期 → 自动换票，失败则提示
           └─ 已认证 → installHtSkillHubSkill()
                      → 下载 zip → 解压到临时目录
                      → 校验必要文件（SKILL.md 等）
                      → 原子移动到 skills/{name}/
                      → 写入 .proma-source.json 来源标记
                      → 默认启用（直接写入 skills/ 目录）
                      → Toast "安装成功" → 刷新列表状态
```

**卸载 Skill**：

```
点击 [卸载] → ConfirmDialog("确定要卸载 {name} 吗？")
           → uninstallHtSkillHubSkill()
           → rm -rf skills/{name}  +  skills-inactive/{name}
           → Toast "已卸载" → 刷新列表
```

**检查更新**：

```
认证完成后自动触发（首次进入面板时）
用户在已认证状态下也可手动点击 [🔄 检查更新]
→ checkSkillUpdates(workspaceSlug)
→ 对比 .proma-source.json installedVersion  vs  远端最新版本
→ 有更新的 Skill 显示 [⬆️ 更新] 按钮
→ 结果缓存到前端内存（SkillUpdateCache），切换面板/工作区后保留
→ 手动刷新或下次面板加载时重新检查
```

**更新 Skill**：

```
点击 [更新] → 等同于 installHtSkillHubSkill({ overwrite: true })
            → 先删旧目录 → 下载新版本解压到 skills/（保持 enabled 状态）
            → 更新 .proma-source.json 版本号
```

---

## 七、数据模型（`@proma/shared`）

### 7.1 新增类型

```typescript
// ===== agent.ts 新增 =====

/** Skill 更新信息 */
export interface SkillUpdateInfo {
  skillName: string
  currentVersion?: string
  latestVersion?: string
  hasUpdate: boolean
}

/** 批量操作输入 */
export interface BatchSkillOperationInput {
  workspaceSlug: string
  skillNames: string[]
  overwrite?: boolean
}

/** SkillHub 来源标记（存储在 .proma-source.json） */
export interface SkillHubSource {
  type: 'skillhub'
  skillName: string
  installedAt: string   // ISO 8601
  installedVersion?: string
}

/** Skill 安装结果 */
export interface HtSkillHubInstallResult {
  skillName: string
  status: 'installed' | 'overwritten'
  enabled: boolean
}

/** 更新检查缓存 */
export interface SkillUpdateCache {
  checkedAt: number           // 上次检查时间戳
  updates: SkillUpdateInfo[]  // 有更新的 Skill 列表
}
```

### 7.2 前端展示类型

前端 Skill 卡片使用的展示类型，从 `SkillMetadata`（服务端返回）派生：

```typescript
// 前端展示用（基于 SkillMetadata 裁剪）
export interface SkillDisplayItem {
  skillName: string       // 含 scope 的名称
  displayName?: string    // 显示名称
  description: string     // 描述
  version?: string        // 远端最新版本
  category?: string       // 分类
  tags?: string[]         // 标签
  downloadCount?: number  // 下载量
  lastUpdated?: string    // 更新时间
  installed: boolean      // 是否已安装到当前工作区
  enabled?: boolean       // 是否已启用
  hasUpdate?: boolean     // 是否有更新
  readme?: string         // README 内容（从列表接口直接获取，无需额外请求）
}
```

> 旧的 `HtSkillHubSkill` 类型（含 `files: string[]` 字段）废弃，改用 `SkillDisplayItem` 作为前端展示模型，`SkillMetadata` 作为 API 对接模型。

---

## 八、文件结构总览

```
apps/electron/src/
├── main/
│   ├── lib/
│   │   ├── auth/
│   │   │   ├── types.ts                      🆕 PersistedAuthData 等类型
│   │   │   └── auth-service.ts               🆕 EIP 登录、Token 管理
│   │   ├── skillhub-auth-service.ts           🆕 换票/刷新/Token 管理
│   │   ├── skillhub-service.ts               ✏️ API 调用 + Skill 列表查询
│   │   ├── skillhub-installer.ts              🆕 安装/卸载/更新检测/批量（从 skillhub-service 拆出）
│   │   └── agent-workspace-manager.ts         — 不变（但前端需接入 IPC）
│   └── ipc.ts                                 ✏️ 注册 6 个新 handler
│
├── renderer/
│   └── components/
│       └── SkillHubPanel/
│           ├── SkillHubPanel.tsx              🆕 主面板（提取自 AgentSettings）
│           ├── AuthStatusBar.tsx              🆕 认证状态栏
│           ├── SkillList.tsx                  🆕 列表 + 批量操作
│           ├── SkillCard.tsx                  🆕 单个 Skill 卡片
│           └── SkillPreviewPanel.tsx          🆕 预览面板（可能复用现有）
│
├── preload/
│   └── index.ts                               ✏️ 新增 API 暴露
│
└── shared/
    └── agent.ts                               ✏️ 新增类型
```

---

## 九、实施步骤

### 阶段一：认证基础设施（优先级：高）

| 步骤 | 文件 | 内容 |
|------|------|------|
| 1.1 | `shared/agent.ts` | 新增 `SkillUpdateInfo`、`BatchSkillOperationInput`、`SkillHubSource` 类型 |
| 1.2 | `main/lib/skillhub-auth-service.ts` | 新增：`exchangeToken()` 用 EIPGW-TOKEN 换 SkillHub accessToken，`getValidSkillHubToken()` 缓存管理 |
| 1.3 | `main/lib/skillhub-service.ts` | 改造：`fetch()` → `skillHubFetch()` 统一注入认证头（仅认证层封装，业务接口切换在阶段二） |
| 1.4 | `main/ipc.ts` | 注册 `SKILLHUB_AUTH_STATUS`、`SKILLHUB_AUTHENTICATE` handler |
| 1.5 | `preload/index.ts` | 暴露 `getSkillHubAuthStatus()`、`skillHubAuthenticate()` |
| 1.6 | `SkillHubPanel/LoginForm.tsx` | 🆕 EIP 登录表单（工号 + 密码） |
| 1.7 | `SkillHubPanel/AuthStatusBar.tsx` | 🆕 认证状态栏组件（5 种状态） |

> **阶段一验收标准**：
> - 运行 Proma → 触发 EIP 登录 → `auth.json` 出现在 `~/.proma/` 下
> - 打开 SkillHub 面板 → 自动换票 → `skillhub-auth.json` 出现在 `~/.proma/` 下
> - 调用 `getSkillHubAuthStatus()` → 返回 `{ authenticated: true }`
> - EIP 未登录时 → 返回 `{ authenticated: false }` → 面板显示"前往登录"

### 阶段二：SkillHub API 升级（优先级：高）

| 步骤 | 文件 | 内容 |
|------|------|------|
| 2.1 | `main/lib/skillhub-service.ts` | 新增 `fetchSkillHubSkills()` 调用 `POST /market/skills` |
| 2.2 | `main/lib/skillhub-service.ts` | 新增 `fetchSkillHubDetail()` 调用 `GET /market/skills/{name}` |
| 2.3 | `main/lib/skillhub-service.ts` | 修改下载逻辑以支持 `POST /skills/download/{name}/{version}` |

> **阶段二验收标准**：
> - 调用 `fetchSkillHubSkills()` → 返回 `SkillMetadata[]` 列表
> - 调用 `fetchSkillHubDetail(name)` → 返回完整 `SkillMetadata`（含 `readme`、`versions`）
> - 使用离线 fixture 数据可独立验证，不依赖 SkillHub 服务

### 阶段三：Skill 管理增强（优先级：高）

| 步骤 | 文件 | 内容 |
|------|------|------|
| 3.1 | `main/lib/skillhub-service.ts` | 修改 `installHtSkillHubSkill()`：安装完成后写入 `.proma-source.json` |
| 3.2 | `main/lib/skillhub-service.ts` | 新增 `uninstallHtSkillHubSkill()`（删除 `skills/` + `skills-inactive/` 同名目录） |
| 3.3 | `main/lib/skillhub-service.ts` | 新增 `checkSkillUpdates()` |
| 3.4 | `main/lib/skillhub-service.ts` | 新增 `batchInstallHtSkillHubSkills()`、`batchUninstallHtSkillHubSkills()` |
| 3.5 | `main/ipc.ts` | 注册 `UNINSTALL_HT_SKILLHUB_SKILL`、`CHECK_SKILL_UPDATES`、`BATCH_INSTALL_HT_SKILLHUB`、`BATCH_UNINSTALL_HT_SKILLHUB` |
| 3.6 | `preload/index.ts` | 暴露对应 API |

> **阶段三验收标准**：
> - 安装 Skill → `skills/{name}/.proma-source.json` 存在且字段正确
> - 卸载 Skill → `skills/{name}/` 和 `skills-inactive/{name}/` 均被删除
> - `checkSkillUpdates()` → 本地 `installedVersion=1.0.0` vs 远端 `version=2.0.0` → `hasUpdate: true`
> - 批量安装 5 个 Skill → 并发 ≤ 3，全部成功返回结果

### 阶段四：前端 UI（优先级：中）

| 步骤 | 文件 | 内容 |
|------|------|------|
| 4.1 | `SkillHubPanel/SkillCard.tsx` | Skill 卡片组件（状态标识 + 操作按钮矩阵） |
| 4.2 | `SkillHubPanel/SkillList.tsx` | 列表组件（搜索/筛选/滚动加载/批量操作栏） |
| 4.3 | `SkillHubPanel/SkillPreviewPanel.tsx` | 预览面板（从列表缓存中取 readme，无需额外请求） |
| 4.4 | `SkillHubPanel/SkillHubPanel.tsx` | 主面板（组装所有子组件） |
| 4.5 | `AgentSettings.tsx` | 替换内嵌 `HtSkillHubPanel` 为 `SkillHubPanel` |

> **阶段四验收标准**：
> - 面板加载 → 认证状态栏正确显示 → 列表展示 Skill 卡片
> - 搜索 keyword → 列表过滤；输入 category → 列表过滤
> - 滚动到底部 → 自动加载下一页
> - 未登录时安装按钮置灰；已登录后可安装
> - 预览面板显示 Markdown 内容（从列表缓存读取，不额外请求）

### 阶段五：联调测试（优先级：中）

| 步骤 | 内容 |
|------|------|
| 5.1 | EIP 登录 → EIPGW-TOKEN 获取 → 存储验证 |
| 5.2 | SkillHub 换票 → Token 缓存与自动刷新 |
| 5.3 | 安装/卸载/启用/禁用 完整流程 |
| 5.4 | 更新检测 + 更新安装 |
| 5.5 | 批量操作（安装/卸载） |
| 5.6 | 来源标记读写 + 安装后版本号回读验证 |
| 5.7 | 错误状态 UI 覆盖（网络不通/401/Token 过期/离线降级） |

> **阶段五验收标准**：
> - 端到端走通：登录 → 换票 → 浏览列表 → 预览 → 安装 → 启用 → 禁用 → 卸载 → 更新检测 → 更新安装
> - SkillHub 不可用时面板降级可用（本地已安装 Skill 仍可管理）
> - Token 过期自动换票对用户透明
> - 批量操作并发 ≤ 3，任一失败不影响其他

> **离线开发策略**：各阶段应提供 mock fixture 数据以支持无 SkillHub 环境验证。
> - `fixtures/skills-list.json`：`SkillMetadata[]` 示例数据（≥ 3 条 Skill，覆盖不同状态）
> - `fixtures/skill-detail.json`：单条 Skill 详情（含 `readme`、`versions`）
> - `fixtures/test-skill.zip`：最小合法 Skill zip 包（含 `SKILL.md` + 一个测试文件）
> - 前端开发时先用 fixture 数据填充列表，后端 mock handler 返回 fixture

---

## 十、关键注意事项

### 10.1 Token 过期处理

- skillhub_token 过期后自动用 EIPGW-TOKEN 重新换票，对用户透明
- 换票失败（网络不通等）→ 前端提示"SkillHub 不可用，请稍后重试"
- EIPGW-TOKEN 过期（365天后极少见）→ 前端提示"EIP 凭证已过期，请重新登录"

### 10.2 来源标记 `.proma-source.json`

- **仅在安装成功后才写入**，失败的安装不留痕迹
- 写入时机：`renameSync(tmpPath, targetPath)` 之后
- 读取容错：文件不存在/JSON 解析失败 → 视为非 Hub 来源

### 10.3 旧接口全部删除

- `.well-known/skills` 三个旧端点全部删除，不保留兼容
- `HT_SKILLHUB_BASE_URL`、`buildSkillFileUrl()` 等关联代码一并清理
- 前端不再单独请求 `SKILL.md`，统一从列表接口 `readme` 字段获取（列表接口已包含此字段，无需额外请求详情接口）

### 10.4 安全

- 所有 Token 使用 `safeStorage` 加密存储
- EIPGW-TOKEN 通过 `Cookie` 传递，仅用于 EIP 网关和 SkillHub 认证通信
- skillhub_token 通过 `Authorization: Bearer` 头传递
- `safeStorage.isEncryptionAvailable()` 为 false 时降级明文（需记录警告）

### 10.5 并发控制

- 批量安装：并发上限 3 个
- Token 刷新：加锁避免并发刷新导致多次请求
- **401 单次重试**：API 返回 401 时，invalidate 当前 token 缓存 → 重新换票 → 重试原请求（仅重试一次，避免死循环）

Token 刷新锁实现：

```typescript
let refreshPromise: Promise<string> | null = null

async function getValidSkillHubToken(): Promise<string> {
  // 已有有效的 token 直接返回（不走锁）
  const cached = getCachedValidToken()
  if (cached) return cached

  // 需要刷新时加锁，避免并发重复请求
  if (!refreshPromise) {
    refreshPromise = exchangeToken().finally(() => {
      refreshPromise = null
    })
  }
  return refreshPromise
}
```

### 10.6 本地目录状态漂移

用户可能手动删除 `skills/{name}/` 目录，导致实际状态与 `.proma-source.json` 不一致。

- 面板加载时不依赖 `.proma-source.json` 判断安装状态，以目录实际存在性为准
- `checkSkillUpdates()` 遍历 `skills/` 前先校验目录是否存在，不存在则跳过
- 避免无声状态漂移：若上次检查更新时有该 Skill，本次目录消失 → 静默跳过，不报错

---

## 十一、遗留问题

| # | 问题 | 影响 | 跟进 |
|---|------|------|------|
| 1 | `GET /market/skills/{name}` 详情接口返回字段可能不完整，部分字段待 Hub 后端补充 | 详情页展示内容受限，如 `readme`、`envVars`、`dependencies` 等可能为空 | 待与 SkillHub 团队确认接口字段完备性 |
| 2 | Skill 详情/下载的 Token 选择策略未定，Skill 自身可能携带环境属性；test 和 prod 的下载接口 URL 路径可能不同 | 无法确定下载时该用哪个环境的 Token | 待 SkillHub 明确：① Skill 是否有 env 属性 ② test/prod 下载路径区分 |
| 3 | OpenAPI 中 `servers` 为空，但域名相同，仅 URL 路径可能不同 | 需确认各环境的完整接口路径 | 待确认 test/prod 对应的具体路径 |

---

*本文档基于三份参考文档综合分析整理，待评审后按阶段实施。*
