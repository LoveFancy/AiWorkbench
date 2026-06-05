# WorkMate Server — 灰度升级管理

编辑时间：2026年6月3日

> **关联文档**：[API与数据库设计](./服务端-API与数据库设计.md) | [管理台前端设计](./服务端-管理台前端设计.md) | [开发与部署](./服务端-开发与部署.md)

本文档描述 WorkMate 的升级管理核心机制：白名单匹配引擎、多阶段灰度升级策略、升级检测接口。

---

## 概览：三张表的关系

```
┌─────────────────────────────────────┐
│   upgrade_strategies（升级策略）     │  ← "剧本"：定义灰度发布的阶段计划
│   - name / targetVersion / platform │
│   - releaseType: UPGRADE (默认)     │
│   - status: DRAFT→ACTIVE→FINISHED  │
│   - 多阶段(stages) + 白名单规则     │
└───────────┬───────────┬────────────┘
            │ 激活/推进/ │ 回撤时
            │ 回撤时同步 │ 同步
            ▼           ▼
┌──────────────────┐ ┌──────────────────────┐
│ upgrade_releases │ │  upgrade_whitelist   │
│ （发布版本库）    │ │  （升级白名单）        │
│ - version        │ │  - sourceStrategyId  │
│ - downloadUrl    │ │  - ruleType/value    │
│ - isActive       │ │  - targetVersion     │
└──────────────────┘ └──────────────────────┘
```

- **版本管理**只录入升级包（releaseType 固定为 UPGRADE），不区分回退
- **升级策略**从版本管理中选目标版本，配置灰度阶段（白名单规则）
- 策略激活/推进/回撤时自动同步白名单到 `upgrade_whitelist` 表，`sourceStrategyId` 指向策略
- **同一平台同一时间只能有一个 ACTIVE 策略**（互斥约束）
- **策略完成必须指定下一个草稿策略**，在同一个事务中完成当前并激活下一个，保证升级服务不中断
- 白名单规则的 CRUD 由策略内部管理，前端不再暴露独立的白名单管理页面

---

## 客户端升级检测流程（策略优先）

```
GET /workmate/upgrade/check?currentVersion=X&platform=Y
    ↓
1. 查 ACTIVE 策略 → 无 → hasUpdate=false
                  → 有 → 进入步骤 2
    ↓
2. 白名单校验（基于策略已执行阶段的规则）：
   - 当前阶段为全量阶段（rules 为空）→ 全员可用，跳过白名单匹配
   - 非全量阶段 → 合并所有已执行阶段（stageOrder ≤ currentStage）的规则
     → 用户工号匹配 → 进入步骤 3
     → 不匹配 → hasUpdate=false
    ↓
3. 版本比较（服务端 + 端侧双重校验）：
   - UPGRADE: currentVersion < targetVersion 才提示
   - ROLLBACK: currentVersion > targetVersion 才提示
    ↓
4. 返回 { hasUpdate, releaseType, latestVersion, downloadUrl, ... }
```

### 回退策略的升级检测

当策略 `releaseType = ROLLBACK` 时，检测逻辑如下：

1. 查找 ACTIVE 的回退策略
2. 合并所有已执行阶段的白名单规则，匹配用户工号
   - 只有在之前升级阶段中**被覆盖过的用户**（工号在已执行阶段白名单中）才需要回退
   - 不在白名单中的用户不需要回退（他们没有升级到问题版本）
3. 版本比较：当前版本 > 回退目标版本才返回回退参数
4. 返回 `releaseType: 'ROLLBACK'` + 回退版本号 + 下载地址

### 端侧版本对比逻辑

端侧收到 `hasUpdate=true` 的响应后，需根据 `releaseType` 做版本判断：

| releaseType | 端侧判断条件 | 动作 |
|-------------|------------|------|
| `UPGRADE` | `currentVersion < latestVersion` | 执行升级 |
| `ROLLBACK` | `currentVersion > latestVersion` | 执行回退 |

> 端侧版本对比是必要的二次校验：服务端返回基于策略白名单和版本比较，但端侧最了解当前实际版本号，可防止版本号不一致等异常情况。

---

## 一、白名单匹配引擎

### 1.1 规则类型

| 类型 | rule_value 示例 | 匹配逻辑 | 匹配的工号示例 |
|------|----------------|----------|---------------|
| `list` | `022480,021220,012333` | `ruleValue.split(',').includes(jobId)` | `022480,021220,012333` |
| `range` | `022480-023480` | `+jobId >= rangeStart && +jobId <= rangeEnd` | `022480`, `022500`, `023480` |
| `prefix` | `022*` | `jobId.startsWith(prefix)` | `022123`, `022999`, `022000` |
| `suffix` | `*022` | `jobId.endsWith(suffix)` | `123022`, `456022` |

### 1.2 核心匹配算法

```typescript
// utils/whitelist-matcher.ts

export type WhitelistRuleType = 'list' | 'range' | 'prefix' | 'suffix'

export interface WhitelistRule {
  id: number
  ruleType: WhitelistRuleType
  ruleValue: string
}

export function matchJobId(jobId: string, rules: WhitelistRule[]): boolean {
  for (const rule of rules) {
    if (matchSingleRule(jobId, rule)) {
      return true
    }
  }
  return false
}

function matchSingleRule(jobId: string, rule: WhitelistRule): boolean {
  switch (rule.ruleType) {
    case 'list':
      return rule.ruleValue.split(',').includes(jobId)
    case 'range': {
      const [start, end] = rule.ruleValue.split('-')
      if (!start || !end) return false
      const jobIdNum = parseInt(jobId, 10)
      const startNum = parseInt(start, 10)
      const endNum = parseInt(end, 10)
      return jobIdNum >= startNum && jobIdNum <= endNum
    }
    case 'prefix': {
      const prefix = rule.ruleValue.slice(0, -1)
      return jobId.startsWith(prefix)
    }
    case 'suffix': {
      const suffix = rule.ruleValue.slice(1)
      return jobId.endsWith(suffix)
    }
    default:
      return false
  }
}
```

### 1.3 白名单规则来源

> 白名单规则通过策略内部阶段管理（创建/编辑/推进/回撤），不再有独立的前端白名单 CRUD 页面。`sourceStrategyId` 区分策略同步规则（非 NULL）和手动规则（NULL）。

前端规则输入框根据规则类型显示不同的 placeholder：

| 规则类型 | placeholder |
|---------|------------|
| list | 工号列表，逗号分隔，如 022480,021220 |
| range | 工号区间，如 022480-023480 |
| prefix | 前缀匹配，如 022* |
| suffix | 后缀匹配，如 *022 |

---

## 二、灰度升级策略设计

### 2.1 策略生命周期

```
DRAFT → [激活] → ACTIVE → [推进/回撤阶段] → ... → [完成(需指定下一策略)] → FINISHED
                 ↓  ↕                ↑
                [暂停]/[恢复] → PAUSED  |
                     ↑                 |
                     └──── 回撤 ───────┘
```

| 状态 | 含义 | 可用操作 |
|------|------|----------|
| DRAFT | 草稿 | 激活（同平台互斥） |
| ACTIVE | 进行中，客户端可检测到更新 | 推进¹ / 回撤² / 暂停 / 完成³ / 编辑阶段 |
| PAUSED | 已暂停，白名单已清理，客户端检测不到 | 恢复 / 完成³ / 编辑阶段 |
| FINISHED | 已完成，白名单已清理 | 仅查看 |

> ¹ 推进：仅在 `currentStage < totalStages` 时可用（全量阶段不可推进）
> 
> ² 回撤：仅在 `currentStage > 1` 时可用（第一阶段不可回撤）
> 
> ³ 完成：仅在 `currentStage === totalStages` 时可用（必须推进到全量阶段才可完成），且必须指定下一个草稿策略

### 2.2 策略创建

管理员在版本管理中录入升级包后，创建升级策略：

1. 选择目标版本（从版本管理下拉），自动填入 `v{version} 灰度升级` 名称
2. 配置灰度阶段（至少 1 个），每阶段含白名单规则
3. 系统自动追加一个 **全量放开** 阶段（`rules: []`），无需额外配置
4. 策略固定为 UPGRADE 类型，`releaseType` 字段在 DB 中默认 `UPGRADE`

**全量阶段含义**：当策略推进到全量阶段时，白名单规则为空（`rules.length === 0`），所有客户端均可升级。全量阶段不可再推进，只可回撤或完成。

### 2.3 策略激活

`activateStrategy` 逻辑：

1. **互斥校验**：同一平台同一时间只能有一个 ACTIVE 策略。若已有激活策略，拒绝激活并提示先完成/暂停当前策略
2. 状态设为 ACTIVE，`currentStage` 设为 1
3. 记录 Stage 1 的 `advancedAt` 时间
4. 自动将 Stage 1 的规则同步到 `upgrade_whitelist`（`sourceStrategyId` = 策略 ID）

```typescript
await prisma.upgradeStrategy.update({
  data: { status: 'ACTIVE', currentStage: 1 },
})
await prisma.upgradeStrategyStage.update({
  where: { id: firstStage.id },
  data: { advancedAt: now },
})
await prisma.upgradeWhitelist.createMany({
  data: firstStage.rules.map(rule => ({
    sourceStrategyId, ruleType, ruleValue, targetVersion, platform, isActive: true,
  })),
})
```

### 2.4 阶段推进

`advanceStrategyStage` — 推进前检查：
- 浸泡时间：`now() - advancedAt >= soakTimeMinutes * 60s`
- 错误率：`autoPauseEnabled` 时检查是否超过阈值
- **仅在 `currentStage < totalStages` 时可推进**（全量阶段不可推进）

推进后：
- 删除旧白名单，重新计算累积规则（Stage 1 到当前 Stage）写入 `upgrade_whitelist`

### 2.5 阶段回撤

`retreatStrategyStage` — 将策略回撤到上一阶段（`currentStage - 1`）：

- **仅在 `currentStage > 1` 时可回撤**（第一阶段不可回撤）
- 只有 ACTIVE 状态的策略可以回撤
- 清理当前白名单，重新写入上一阶段的累积规则
- 如果上一阶段为全量阶段（`rules.length === 0`），则不写规则（全员可用）

回撤的效果：
- 不在上一阶段白名单中的用户将**不再收到升级提示**
- 已升级的用户不受影响（不会强制回退）
- 适用于灰度放量范围扩大后发现问题的场景：回撤缩量，让新用户不再升级

### 2.6 阶段编辑（ACTIVE/PAUSED 状态下）

`PUT /strategies/:id/edit-stages` — `editStrategyStages()`

- 允许在 ACTIVE 和 PAUSED 状态下编辑阶段配置
- 删除旧阶段，插入新阶段，**保留已有阶段的 `advancedAt`**（按 `stageOrder` 匹配）
- 编辑后自动重新同步当前活跃阶段的白名单

### 2.7 策略完成（必须指定下一策略）

`finishStrategy(strategyId, nextStrategyId)` — 完成策略必须指定下一个要激活的草稿策略：

**为什么必须指定下一策略？** 策略完成后白名单会被清理，如果不立即激活下一个策略，长时间未开机的客户端将无法检测到升级。因此在同一个事务中完成当前策略并激活下一个，保证升级服务不中断。

校验规则：
- 当前策略必须是 ACTIVE 或 PAUSED 状态
- 必须传入 `nextStrategyId`
- 下一策略必须存在、同平台、草稿状态

事务内的操作：
1. 完成当前策略：清理白名单，状态设为 FINISHED
2. 激活下一策略：状态设为 ACTIVE，`currentStage = 1`，记录 `advancedAt`，同步第一阶段白名单

前端交互：
- 点击「完成」弹出对话框，选择同平台的草稿策略
- 没有草稿策略时显示红色提示："请先创建下一个版本的升级策略"
- 仅在 `currentStage === totalStages`（全量阶段）时才显示「完成」按钮

### 2.8 浸泡时间（Soak Time）

| 字段 | 表 | 说明 |
|------|-----|------|
| `soak_time_minutes` | `upgrade_strategies` | 阶段间最小浸泡时间（分钟），0 或不填=不限 |
| `advanced_at` | `upgrade_strategy_stages` | 该阶段激活时间，用于浸泡时间计算 |

推进前校验：`now() - currentStage.advancedAt >= strategy.soakTimeMinutes * 60s`

### 2.9 健康度检查与自动暂停

| 指标 | 来源 | 说明 |
|------|------|------|
| 已升级用户错误率 | `observability_events` 表 | 按 `client_version` 和 `event_type='error'` 统计 |
| 已升级用户活跃率 | `observability_events` 表 | 有上报事件的已升级用户比例 |
| 平均响应时长 | `observability_events` 表 | 新版本用户的平均 `response_duration_ms` |

自动暂停：定时任务（每 10 分钟）检查 ACTIVE 策略，错误率 >= `autoPauseErrorRate` → PAUSED

### 2.10 阶段推进前置条件汇总

| 检查项 | 条件 | 不通过时 |
|--------|------|----------|
| 浸泡时间 | `now() - advancedAt >= soakTimeMinutes * 60s` | 返回剩余时间 |
| 错误率 | 当前阶段错误率 < `autoPauseErrorRate` | 返回警告，允许强制推进 |
| 上一阶段用户数 | >= N 名用户成功升级 | 返回已升级人数，允许强制推进 |
| 阶段限制 | `currentStage < totalStages` | 已到达最终阶段，不可推进 |

---

## 三、API 接口设计

### 3.1 客户端升级检测

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/workmate/upgrade/check?currentVersion=X&platform=Y` | 检查是否有可用更新 |

**请求参数**：`currentVersion`（当前版本号）、`platform`（win32/darwin/linux）

**响应字段**：`hasUpdate`, `forceUpdate`, `releaseType`, `latestVersion`, `downloadUrl`, `releaseNotes`, `minVersion`, `hint`

核心逻辑（`upgrade.service.ts`）：

```
1. 查 ACTIVE 策略 → 无 → hasUpdate=false
                 → 有 → 进入步骤 2
2. 白名单校验（基于策略已执行阶段规则）：
   - 全量阶段（rules 为空）→ 全员可用
   - 非全量阶段 → 合并已执行阶段规则，matchAnyRule(userId, rules)
     → 不匹配 → hasUpdate=false
3. 版本比较: UPGRADE → target > current 才提示; ROLLBACK → target < current 才提示
4. 返回 { hasUpdate, releaseType, latestVersion, downloadUrl, ... }
```

### 3.2 版本管理接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/workmate/console/releases` | 获取发布版本列表 |
| POST | `/workmate/console/releases` | 新建发布版本（releaseType 固定 UPGRADE）|

### 3.3 升级策略接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/workmate/console/strategies` | 获取策略列表 |
| POST | `/workmate/console/strategies` | 创建策略（自动追加全量阶段） |
| GET | `/workmate/console/strategies/:id` | 获取策略详情（含阶段和规则） |
| POST | `/workmate/console/strategies/:id/activate` | 激活策略（互斥校验 + currentStage=1 + 同步规则 + 记录时间） |
| POST | `/workmate/console/strategies/:id/advance-stage` | 推进到下一阶段（currentStage < totalStages 时可用） |
| POST | `/workmate/console/strategies/:id/retreat-stage` | 回撤到上一阶段（currentStage > 1 时可用） |
| POST | `/workmate/console/strategies/:id/pause` | 暂停策略（清理白名单） |
| POST | `/workmate/console/strategies/:id/resume` | 恢复策略（重新同步白名单） |
| POST | `/workmate/console/strategies/:id/finish` | 完成策略（需 body: { nextStrategyId }，事务完成当前+激活下一） |
| PUT | `/workmate/console/strategies/:id/edit-stages` | 编辑阶段配置（ACTIVE/PAUSED 可用） |

### 3.4 升级白名单接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/workmate/console/upgrade-whitelist` | 查询升级白名单（仅查询，CRUD 由策略内部管理） |

---

## 四、数据库变更

### 4.1 最新 DDL

```sql
-- 2026-06-03: upgrade_strategies 表增加 release_type 字段
ALTER TABLE `upgrade_strategies`
  ADD COLUMN `release_type` ENUM('UPGRADE', 'ROLLBACK') NOT NULL DEFAULT 'UPGRADE'
  AFTER `name`;
```

### 4.2 完整建表语句

`upgrade_strategies` 表的完整字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT PK | 自增主键 |
| name | VARCHAR(128) | 策略名称，前端自动拼接 `v{version} 灰度升级` |
| release_type | ENUM('UPGRADE','ROLLBACK') | 策略类型，默认 UPGRADE |
| target_version | VARCHAR(32) | 目标版本号 |
| download_url | VARCHAR(512) | 下载地址 |
| release_notes | TEXT | 发布说明 |
| platform | VARCHAR(32) | 平台 (win32/darwin/linux) |
| min_version | VARCHAR(32) | 最低升级版本 |
| total_stages | INT | 总阶段数（含全量阶段） |
| current_stage | INT | 当前阶段，0=未启动 |
| soak_time_minutes | INT | 阶段间最小浸泡时间 |
| auto_pause_error_rate | DECIMAL(5,4) | 自动暂停错误率阈值 |
| auto_pause_enabled | BOOLEAN | 是否启用自动暂停 |
| status | ENUM('DRAFT','ACTIVE','PAUSED','FINISHED') | 状态 |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |

完整 Prisma Schema 见 [服务端-API与数据库设计.md](./服务端-API与数据库设计.md)。

---

*如有任何疑问，请联系信息技术部运营管理室AI研发效能管理团队*
