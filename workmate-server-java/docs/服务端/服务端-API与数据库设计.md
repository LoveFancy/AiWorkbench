# WorkMate Server — 项目概览与数据字典

编辑时间：2026年6月3日

> 本文档是 WorkMate Server 的入口文档，包含项目总览、身份传递约定和数据库完整 Schema。各模块的 API 接口、业务逻辑和优化方案已拆分到独立文档。

## 关联文档

| 文档 | 内容 |
|------|------|
| [服务端-模型平台代理.md](./服务端-模型平台代理.md) | 是什么/为什么/怎么做 + API + 模型平台服务 |
| [服务端-workmate灰度升级管理.md](./服务端-workmate灰度升级管理.md) | 白名单引擎 + 灰度策略 + 升级/回退/策略 API + 升级相关数据表 |
| [服务端-观测数据与异常上报.md](./服务端-观测数据与异常上报.md) | 错误指纹/面包屑/采样限流/去重 + 上报/查询 API + 观测数据表 |
| [服务端-管理台前端设计.md](./服务端-管理台前端设计.md) | 设计决策 + 页面设计 + 权限校验 API + admin 白名单表 |
| [服务端-开发与部署.md](./服务端-开发与部署.md) | 技术选型 + 本地开发 + Docker/PM2/虚拟机部署 + 目录结构 + Express 装配 |
| [服务端-后续迭代计划.md](./服务端-后续迭代计划.md) | 各阶段完成状态与规划 |

---

## 一、项目概述

WorkMate 伴行后端服务，为 AiWorkbench 客户端提供模型权限查询、升级检测、观测数据接收和管理后台。独立于 Electron 桌面客户端，采用 Node.js + MySQL 架构。

### 核心功能

| 序号 | 功能 | 说明 |
|------|------|------|
| 1 | 模型列表查询 | 代理查询大模型平台，返回用户可用的模型列表 |
| 2 | 升级检测 | 客户端查询是否有新版本可升级，支持白名单灰度发布 |
| 3 | 观测数据接收 | 接收客户端上报的用户提问观测数据和异常数据 |
| 4 | 管理后台 | Web 管理台，配置升级白名单、查看观测数据 |

### 关键设计决策

| 决策 | 原因 |
|------|------|
| **不存储用户表** | 用户身份通过 EIP 网关注入的 `X-EIPGW-USERID` Header（AES-128-GCM 加密）确定 |
| **不存储模型表** | 模型列表由大模型平台统一管理，本服务仅做代理转发，不做本地缓存 |
| **白名单用规则匹配** | 支持逗号分隔列表、范围区间、前缀/后缀通配符，灵活覆盖组织架构场景 |
| **管理台访问控制** | 管理台不设独立登录，通过 EIP 网关注入的工号 + `admin_whitelist` 表规则匹配控制 |

### 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 运行时 | Node.js 20+ | 服务端运行时 |
| 语言 | TypeScript | 类型安全 |
| Web 框架 | Express.js | HTTP 服务 + RESTful API |
| 数据库 | MySQL 8.0 | 关系型数据库 |
| ORM | Prisma | 类型安全的数据库访问 |
| 前端框架 | React 18 + Vite | 管理台 SPA |
| UI 组件 | Ant Design 5 | 企业级 UI 组件库 |
| 部署 | Docker + PM2 | 容器化 + 进程管理 |

---

## 二、身份传递约定

### 2.1 整体流程

客户端请求经过 EIP 网关后，网关自动在 Header 中注入 AES-128-GCM 加密的工号：

```
客户端 ──→ EIP 网关（校验 Cookie + 网关鉴权）──→ WorkMate Server
                                                  │
                                   Header: X-EIPGW-USERID: <AES-128-GCM 密文 (Base64)>
```

服务端解密该 Header 即可获取工号，客户端无需自行处理加密逻辑。

### 2.2 加解密方案

| 参数 | 值 | 说明 |
|------|-----|------|
| 算法 | AES-128-GCM | 128 位密钥（16 字节） |
| IV 长度 | 12 字节 | |
| 密钥 | 16 字节 | EIP 网关与后端共享，通过环境变量 `USER_ID_ENCRYPTION_KEY` 配置 |
| 编码 | Base64 | 密文（含 IV + AuthTag）经 Base64 编码放入 Header |

#### 数据流

```
EIP 网关侧：
  1. 生成 12 字节随机 IV
  2. cipher = AES-128-GCM.encrypt(plainJobId, key, iv)
  3. combined = iv(12B) + cipher(N bytes) + authTag(16B)
  4. Header: X-EIPGW-USERID: <base64(combined)>

WorkMate Server 侧（extract-user-id 中间件）：
  1. combined = Buffer.from(header, 'base64')
  2. iv = combined.subarray(0, 12)
  3. authTag = combined.subarray(combined.length - 16)
  4. ciphertext = combined.subarray(12, combined.length - 16)
  5. plainJobId = AES-128-GCM.decrypt(ciphertext, key, iv, authTag)
  6. req.jobId = plainJobId
```

### 2.3 extract-user-id 中间件

- **文件**：`middleware/extract-user-id.ts`
- **触发条件**：读取 `req.headers['x-eipgw-userid']`
- **行为**：AES-128-GCM 解密 → 写入 `req.jobId`
- **异常处理**：
  - `REQUIRE_USER_ID=true`（生产环境）→ 返回 403
  - `REQUIRE_USER_ID=false`（开发/测试环境）→ 使用默认用户 `test_user` 放行

> 完整实现代码见 `src/middleware/extract-user-id.ts`。

---

## 三、API 通用规范

**Base URL**: `http://{host}:{port}/workmate`

**通用请求头**:

```
Content-Type: application/json
X-EIPGW-USERID: <AES-128-GCM 密文 (Base64)>   ← EIP 网关自动注入
Cookie: EIPGW-TOKEN=<jwt>                       ← 浏览器/EIP 网关自动携带
```

**统一响应格式**:

```typescript
interface ApiResponse<T = unknown> {
  code: number        // 0 = 成功，非 0 = 错误
  message: string     // 提示信息
  data?: T            // 响应数据
  timestamp: number   // 响应时间戳
}
```

**错误码定义**:

| code | 含义 |
|------|------|
| 0 | 成功 |
| 400 | 请求参数错误 |
| 403 | 用户身份缺失 / 认证失败 / 无访问权限 |
| 404 | 资源不存在 |
| 429 | 请求频率超限 |
| 500 | 服务器内部错误 |

**分页格式**:

```typescript
interface PaginatedData<T> {
  list: T[]
  total: number
  page: number
  pageSize: number
}
```

---

## 四、数据库设计（完整 Prisma Schema）

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

// ===== 发布版本表 =====

model UpgradeRelease {
  id           Int         @id @default(autoincrement())
  version      String      @db.VarChar(32)
  releaseType  ReleaseType @default(UPGRADE) @map("release_type")
  releaseNotes String      @map("release_notes") @db.Text
  downloadUrl  String      @map("download_url") @db.VarChar(512)
  platform     String      @db.VarChar(32)
  minVersion   String?     @map("min_version") @db.VarChar(32)
  isActive     Boolean     @default(true) @map("is_active")
  publishedAt  DateTime    @default(now()) @map("published_at")
  @@map("upgrade_releases")
}

enum ReleaseType {
  UPGRADE
  ROLLBACK
}

// ===== 升级白名单表 =====

model UpgradeWhitelist {
  id               Int      @id @default(autoincrement())
  sourceStrategyId Int?     @map("source_strategy_id")
  ruleType         String   @map("rule_type") @db.VarChar(16)
  ruleValue        String   @map("rule_value") @db.VarChar(256)
  targetVersion    String?  @map("target_version") @db.VarChar(32)
  platform         String?  @db.VarChar(32)
  isActive         Boolean  @default(true) @map("is_active")
  createdAt        DateTime @default(now()) @map("created_at")
  strategy         UpgradeStrategy? @relation(fields: [sourceStrategyId], references: [id], onDelete: SetNull)
  @@index([isActive])
  @@index([sourceStrategyId])
  @@map("upgrade_whitelist")
}

// ===== 升级策略表 =====

model UpgradeStrategy {
  id                 Int            @id @default(autoincrement())
  name               String         @db.VarChar(128)
  targetVersion      String         @map("target_version") @db.VarChar(32)
  downloadUrl        String         @map("download_url") @db.VarChar(512)
  releaseNotes       String?        @map("release_notes") @db.Text
  platform           String         @db.VarChar(32)
  minVersion         String?        @map("min_version") @db.VarChar(32)
  totalStages        Int            @default(0) @map("total_stages")
  currentStage       Int            @default(0) @map("current_stage")
  soakTimeMinutes    Int?           @map("soak_time_minutes")
  autoPauseErrorRate Decimal?       @map("auto_pause_error_rate") @db.Decimal(5, 4)
  autoPauseEnabled   Boolean        @default(false) @map("auto_pause_enabled")
  status             StrategyStatus @default(DRAFT)
  createdAt          DateTime       @default(now()) @map("created_at")
  updatedAt          DateTime       @updatedAt @map("updated_at")
  stages             UpgradeStrategyStage[]
  whitelistRules     UpgradeWhitelist[]
  @@map("upgrade_strategies")
}

enum StrategyStatus {
  DRAFT
  ACTIVE
  PAUSED
  FINISHED
}

model UpgradeStrategyStage {
  id           Int                          @id @default(autoincrement())
  strategyId   Int                          @map("strategy_id")
  stageOrder   Int                          @map("stage_order")
  name         String                       @db.VarChar(64)
  releaseNotes String?                      @map("release_notes") @db.Text
  advancedAt   DateTime?                    @map("advanced_at")
  createdAt    DateTime                     @default(now()) @map("created_at")
  strategy     UpgradeStrategy              @relation(fields: [strategyId], references: [id], onDelete: Cascade)
  rules        UpgradeStrategyStageRule[]
  @@map("upgrade_strategy_stages")
}

model UpgradeStrategyStageRule {
  id        Int                  @id @default(autoincrement())
  stageId   Int                  @map("stage_id")
  ruleType  String               @map("rule_type") @db.VarChar(16)
  ruleValue String               @map("rule_value") @db.VarChar(256)
  stage     UpgradeStrategyStage @relation(fields: [stageId], references: [id], onDelete: Cascade)
  @@map("upgrade_strategy_stage_rules")
}

// ===== 管理台白名单表 =====

model AdminWhitelist {
  id        Int      @id @default(autoincrement())
  ruleType  String   @map("rule_type") @db.VarChar(16)
  ruleValue String   @map("rule_value") @db.VarChar(256)
  remark    String?  @db.VarChar(255)
  isActive  Boolean  @default(true) @map("is_active")
  createdAt DateTime @default(now()) @map("created_at")
  @@map("admin_whitelist")
}

// ===== 业务事件表（按年分区，永久保留） =====

model ObservabilityEvent {
  id                 BigInt   @id @default(autoincrement())
  eventId            String   @map("event_id") @db.VarChar(36) @unique
  userId             String   @map("user_id") @db.VarChar(64)
  eventType          String   @map("event_type") @db.VarChar(32)  // user_login|user_logout|chat_question|agent_question|upgrade_check
  questionLength     Int?     @map("question_length")
  modelId            String?  @map("model_id") @db.VarChar(128)
  channelId          String?  @map("channel_id") @db.VarChar(128)
  sessionId          String?  @map("session_id") @db.VarChar(64)
  workspaceId        String?  @map("workspace_id") @db.VarChar(64)
  result             String?  @db.VarChar(16)
  responseDurationMs Int?     @map("response_duration_ms")
  clientVersion      String   @map("client_version") @db.VarChar(32)
  clientPlatform     String   @map("client_platform") @db.VarChar(32)
  clientOsVersion    String?  @map("client_os_version") @db.VarChar(64)
  createdAt          DateTime @default(now()) @map("created_at")

  @@index([eventType, createdAt])
  @@index([userId, createdAt])
  @@index([createdAt])
  @@index([clientVersion])
  @@map("observability_events")
}

// ===== 异常事件表（按月分区，保留 6 个月） =====

model ObservabilityError {
  id                 BigInt   @id @default(autoincrement())
  eventId            String   @map("event_id") @db.VarChar(36) @unique
  userId             String   @map("user_id") @db.VarChar(64)
  sessionId          String?  @map("session_id") @db.VarChar(64)
  workspaceId        String?  @map("workspace_id") @db.VarChar(64)
  errorType          String?  @map("error_type") @db.VarChar(64)
  errorMessage       String?  @map("error_message") @db.Text
  errorStack         String?  @map("error_stack") @db.VarChar(1000)
  errorFingerprint   String?  @map("error_fingerprint") @db.VarChar(64)
  errorStatusCode    Int?     @map("error_status_code")
  breadcrumbs        String?  @db.Text
  tags               String?  @db.Text
  clientVersion      String   @map("client_version") @db.VarChar(32)
  clientPlatform     String   @map("client_platform") @db.VarChar(32)
  clientOsVersion    String?  @map("client_os_version") @db.VarChar(64)
  createdAt          DateTime @default(now()) @map("created_at")

  @@index([errorFingerprint, createdAt])
  @@index([userId, createdAt])
  @@index([createdAt])
  @@index([clientVersion])
  @@map("observability_errors")
}
```

> **分区说明**：Prisma 原生不支持分区表 DDL，分区与 `ROW_FORMAT=COMPRESSED` 通过自定义 SQL 迁移管理。
> - `observability_events`：按年 RANGE 分区（`YEAR(created_at)`），永久保留
> - `observability_errors`：按月 RANGE 分区（`TO_DAYS(created_at)`），保留 6 个月，每月 1 日定时删除过期分区
> - 完整 DDL 与分区维护脚本见 [服务端-观测数据与异常上报.md §5](./服务端-观测数据与异常上报.md#五数据模型最终版)

---

## 五、与客户端对接说明

> 客户端侧方案参见各独立文档：[登录](./客户端-登录.md) | [上报（观测与异常）](./客户端-上报（观测与异常）.md) | [升级检测](./客户端-升级检测.md) | [模型列表](./客户端-模型列表.md)。

接口汇总：

```
模型查询：  GET  /workmate/models
升级检测：  GET  /workmate/upgrade/check?currentVersion=X&platform=Y
观测上报：  POST /workmate/observability/events   Body: { events: [...] }  → 服务端按 type 分流到业务表/异常表
管理台 - 业务事件：  GET  /workmate/console/observability/events?year=YYYY
管理台 - 异常事件：  GET  /workmate/console/observability/errors?year=YYYY
管理台 - 统计概览：  GET  /workmate/console/observability/stats?year=YYYY
```

**注意**：客户端无需自行加密工号。请求经 EIP 网关后，网关会自动在 Header 中注入 `X-EIPGW-USERID`（AES-128-GCM 加密密文）。

---

*如有任何疑问，请联系信息技术部运营管理室AI研发效能管理团队*
