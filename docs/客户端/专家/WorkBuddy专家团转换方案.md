# WorkBuddy 专家团 → WorkMate 专家团 转换方案

> 编辑时间：2026年6月15日（LLM 驱动版）

***

## 一、概述

### 1.1 目标

在 WorkMate 客户端的 **设置 → 专家团** 页面，新增"导入 WorkBuddy"功能，允许用户自助上传 WorkBuddy 的专家团（Zip 或目录），由 LLM 驱动转换为 WorkMate 格式并安装。

### 1.2 核心思路

**LLM 驱动转换**——将转换规则配置为一个 Skill（提示词），LLM 作为转换引擎：

- 输入：WorkBuddy 专家团目录（或解压后的 Zip）
- 引擎：LLM + 转换 Skill 提示词
- 输出：WorkMate 专家团目录（可直接安装）

相比纯脚本方案的优势：

| 维度              | 纯脚本          | LLM 驱动            |
| --------------- | ------------ | ----------------- |
| SubAgent 拆分     | 无法处理         | **自动识别并拆分**       |
| builtinTools 推断 | 无法处理         | **从 prompt 语义推断** |
| MCP 依赖识别        | 无法处理         | **从内容识别外部服务**     |
| 非标准格式容错         | 硬编码 fallback | **理解语义灵活处理**      |
| rules 合并        | 固定模板拼接       | **理解上下文智能融入**     |
| prompt 质量       | 原文照搬         | **可优化措辞和结构**      |

### 1.3 适用范围

WorkBuddy 全部 39 个专家团均可转换，包括 38 个单 Agent 模式和 1 个团队模式（`software-company`）。LLM 能理解任何格式的 WorkBuddy 专家，天然容错。

***

## 二、格式对比

### 2.1 WorkBuddy 源格式

```
{expert-name}/
├── .codebuddy-plugin/
│   └── plugin.json           # 插件清单
├── agents/
│   └── {agent-name}.md       # 唯一的 Agent（主角色 prompt）
├── avatars/
│   └── expert.png            # 头像（WorkMate 不使用）
├── skills/                   # Skill 文件
│   └── {skill-name}/
│       ├── SKILL.md
│       ├── references/
│       └── scripts/
├── rules/                    # 规则文件（部分专家有）
│   └── {rule-name}.md
└── README.md                 # 可选
```

plugin.json 关键字段：

| 字段                   | 类型                | 说明           |
| -------------------- | ----------------- | ------------ |
| `name`               | string            | 英文标识         |
| `version`            | string            | 版本号          |
| `expertType`         | string            | 始为 `"agent"` |
| `agentName`          | string            | 主 agent 文件名  |
| `displayName`        | { en, zh }        | 显示名          |
| `profession`         | { en, zh }        | 职业           |
| `displayDescription` | { en, zh }        | 显示描述         |
| `defaultInitPrompt`  | { zh, en }        | 默认入口提示       |
| `tags`               | Array<{ zh, en }> | 标签           |
| `quickPrompts`       | Array<{ zh, en }> | 快捷提示         |
| `skills`             | string\[]         | Skills 路径    |

Agent .md 格式：frontmatter（name/description/color/emoji/vibe）+ 正文（完整 system prompt）。

### 2.2 WorkMate 目标格式

```
{plugin-name}/
├── .claude-plugin/
│   └── plugin.json           # 插件清单（必须含 expertGroup 字段）
├── expert-groups/
│   └── {groupId}.json        # 专家团配置
├── agents/                   # SubAgent 定义（LLM 可拆分生成）
│   └── {agent-name}.md
├── skills/                   # Skills（从源复制）
│   └── {skill-name}/
│       └── SKILL.md
└── .mcp.json                 # MCP 配置（如有）
```

***

## 三、转换 Skill 提示词

提示词已独立输出到 \[/apps/electron/default-skills/transfer-buddy-experts/SKILL.md)]。

该提示词基于 39 个真实 WorkBuddy 专家团的格式差异完善，覆盖：

- 两种源格式（单 Agent 模式 + 团队模式）
- Agent .md frontmatter 格式差异
- 字段映射规则（类型 A / 类型 B）
- mainRole.prompt 构建五步法
- SubAgent 拆分判断（拆分信号 + 不拆分信号）
- 特殊场景处理（无 agents 目录、Skills 嵌套、大型 Rules、SKILL.md 特殊 frontmatter）
- 输出质量检查清单

***

## 四、转换流程

### 4.1 整体架构

```
┌─────────────────────────────────────────────────────┐
│                    主进程 (Main)                      │
│                                                      │
│  ┌──────────┐   ┌──────────────┐   ┌─────────────┐ │
│  │ 文件预处理 │──→│ LLM 转换调用  │──→│ 文件写入安装  │ │
│  └──────────┘   └──────────────┘   └─────────────┘ │
│                                                      │
│  ① 读取源目录    ② 调用 LLM API     ③ 解析 LLM 输出  │
│    收集文件内容     附带 Skill 提示词    写入目标目录    │
│    构建输入 prompt   + 源文件内容       复制 skills    │
│                                        安装插件       │
└─────────────────────────────────────────────────────┘
```

### 4.2 详细流程

```
importWorkBuddyExpert(sourceDir) → AgentPluginInfo
  │
  ├─ 1. 预处理：读取源文件
  │     ├─ .codebuddy-plugin/plugin.json
  │     ├─ agents/{agentName}.md
  │     ├─ rules/*.md（如有）
  │     └─ skills/*/SKILL.md 摘要
  │
  ├─ 2. 构建 LLM 请求
  │     ├─ System Prompt = 转换 Skill 提示词（第三章）
  │     └─ User Message = 源文件内容（结构化输入）
  │
  ├─ 3. 调用 LLM
  │     └─ 使用当前配置的模型（与聊天同一模型）
  │
  ├─ 4. 解析 LLM 输出
  │     ├─ 提取 files 中的各文件内容
  │     ├─ 提取 copySkills 标志
  │     └─ 提取 summary（记录日志）
  │
  ├─ 5. 写入目标目录
  │     ├─ 创建临时目录
  │     ├─ 写入 .claude-plugin/plugin.json
  │     ├─ 写入 expert-groups/{id}.json
  │     ├─ 写入 agents/*.md（如有 SubAgent）
  │     └─ 复制 skills/ 目录
  │
  ├─ 6. 安装
  │     └─ installUserPluginZip() → ~/.proma/plugins/
  │
  └─ 返回 AgentPluginInfo
```

### 4.3 LLM 输入构建

将源文件内容结构化后作为 User Message：

```typescript
function buildConversionInput(sourceDir: string): string {
  const pluginJson = readFile(`${sourceDir}/.codebuddy-plugin/plugin.json`)
  const agentMd = readFile(`${sourceDir}/agents/${pluginJson.agentName}.md`)
  const rules = readAllRules(`${sourceDir}/rules/`)
  const skillSummaries = readSkillSummaries(`${sourceDir}/skills/`)

  return `
# 待转换的 WorkBuddy 专家团

## plugin.json
\`\`\`json
${pluginJson}
\`\`\`

## Agent 定义
\`\`\`markdown
${agentMd}
\`\`\`

${rules ? `## Rules\n\`\`\`markdown\n${rules}\n\`\`\`` : ''}

${skillSummaries ? `## Skills 摘要\n${skillSummaries}` : ''}
`
}
```

### 4.4 LLM 输出解析

```typescript
function parseConversionOutput(llmOutput: string): ConversionResult {
  // LLM 输出为 JSON，包含 files 字段
  const parsed = JSON.parse(extractJsonFromMarkdown(llmOutput))

  return {
    pluginJson: JSON.parse(parsed.files['.claude-plugin/plugin.json']),
    expertGroupJson: JSON.parse(parsed.files[`expert-groups/${id}.json`]),
    subagents: Object.entries(parsed.files)
      .filter(([path]) => path.startsWith('agents/'))
      .map(([path, content]) => ({ path, content })),
    copySkills: parsed.copySkills ?? true,
    summary: parsed.summary ?? ''
  }
}
```

### 4.5 批量导入

目录模式下逐个调用 LLM 转换：

```
importWorkBuddyExpertsBatch(sourceDir)
  │
  ├─ 扫描 sourceDir 下所有子目录
  ├─ 对每个有效子目录：
  │     ├─ 构建输入 → 调用 LLM → 解析输出 → 写入安装
  │     └─ 可串行（节省 token）或并行（更快）
  └─ 返回 { installed[], skipped[], failed[] }
```

***

## 五、用户自助导入设计

### 5.1 UI 入口

在 **设置 → 专家团** 页面（`ExpertGroupSettings.tsx`）操作区新增按钮。

现有布局：

```
[上传专家团Zip] [刷新]
```

新增后：

```
[导入WorkBuddy] [上传专家团Zip] [刷新]
```

按钮属性：`variant="outline" size="sm"`，图标用 `Download`（lucide-react），转换中显示"导入中..."并 disabled。

### 5.2 交互流程

点击按钮弹出 DropdownMenu，两种方式：

```
┌──────────────────────────────────┐
│  📦 上传 WorkBuddy 专家团 Zip     │
│  📁 选择 WorkBuddy 专家团目录     │
└──────────────────────────────────┘
```

**方式一：上传 Zip** — 弹出文件选择（filter: .zip）→ 解压 → 校验 → LLM 转换 → 安装

**方式二：选择目录** — 弹出目录选择 → 扫描子目录 → 逐个 LLM 转换 → 安装

### 5.3 端到端时序

```
用户                    渲染进程                     主进程                        LLM
 │                        │                           │                           │
 │ 点击"导入WorkBuddy"    │                           │                           │
 │───────────────────────→│                           │                           │
 │ 选择文件/目录          │                           │                           │
 │───────────────────────→│ ipc:import-workbuddy-*    │                           │
 │                        │──────────────────────────→│                           │
 │                        │                           │ 读取源文件                 │
 │                        │                           │ 构建 LLM 请求             │
 │                        │                           │──────────────────────────→│
 │                        │                           │                           │
 │                        │                           │←── 转换结果 JSON ─────────│
 │                        │                           │                           │
 │                        │                           │ 解析输出→写入文件          │
 │                        │                           │ 复制 skills→安装插件      │
 │                        │←── AgentPluginInfo ───────│                           │
 │                        │ toast.success() + 刷新    │                           │
 │←── 列表更新 ───────────│                           │                           │
```

### 5.4 状态机

```
IDLE ──→ PREPARING ──→ CONVERTING(LLM) ──→ INSTALLING ──┬──→ SUCCESS
                                                          ├──→ VALIDATION_ERR
                                                          ├──→ LLM_ERR
                                                          └──→ INSTALL_ERR
```

所有失败路径自动恢复 IDLE，toast 提示错误信息。

### 5.5 进度反馈

| 阶段         | UI 表现            | 说明               |
| ---------- | ---------------- | ---------------- |
| PREPARING  | "读取源文件..."       | 读取 WorkBuddy 目录  |
| CONVERTING | "LLM 转换中..."     | 调用 LLM（耗时 5-15s） |
| INSTALLING | "安装中..."         | 写入文件+安装          |
| 批量时        | "正在转换 N/M：{专家名}" | 显示当前进度           |

### 5.6 Toast 反馈

| 场景     | 类型      | 消息                       |
| ------ | ------- | ------------------------ |
| 转换成功   | success | "已导入 WorkBuddy 专家团：{名称}" |
| 批量成功   | success | "已导入 N 个 WorkBuddy 专家团"  |
| 校验失败   | error   | "不是有效的 WorkBuddy 专家团"    |
| LLM 失败 | error   | "转换失败：LLM 返回格式异常"        |
| 同名跳过   | warning | "专家团"{名称}"已存在，已跳过"       |

***

## 六、代码变更清单

### 6.1 新建文件

| 文件                                                       | 职责                       |
| -------------------------------------------------------- | ------------------------ |
| `apps/electron/src/main/lib/workbuddy-import-service.ts` | 预处理 + LLM 调用 + 输出解析 + 安装 |
| `skills/workbuddy-converter/SKILL.md`                    | 转换 Skill 提示词             |

### 6.2 修改文件

| 文件                                                                       | 修改内容                          |
| ------------------------------------------------------------------------ | ----------------------------- |
| `packages/shared/src/types/agent.ts`                                     | `AGENT_IPC_CHANNELS` 新增 2 个通道 |
| `apps/electron/src/main/ipc.ts`                                          | 新增 2 个 handler                |
| `apps/electron/src/preload/index.ts`                                     | `ElectronAPI` 接口新增 2 个方法      |
| `apps/electron/src/renderer/components/settings/ExpertGroupSettings.tsx` | 新增按钮 + DropdownMenu + 交互逻辑    |

### 6.3 新增 IPC 通道

```typescript
IMPORT_WORKBUDDY_EXPERT_ZIP: 'agent:import-workbuddy-expert-zip',
IMPORT_WORKBUDDY_EXPERT_DIR: 'agent:import-workbuddy-expert-dir',
```

### 6.4 workbuddy-import-service.ts 函数签名

```typescript
// 校验 WorkBuddy 目录合法性
function isValidWorkBuddyExpert(dirPath: string): boolean

// 预处理：读取源文件，构建 LLM 输入
function buildConversionInput(sourceDir: string): string

// 调用 LLM 执行转换
function callLLMConversion(input: string): Promise<ConversionResult>

// 解析 LLM 输出
function parseConversionOutput(llmOutput: string): ConversionResult

// 写入目标目录 + 安装
function writeAndInstall(result: ConversionResult, sourceDir: string): AgentPluginInfo

// 从 zip 导入（入口）
function importWorkBuddyExpertZip(zipPath: string, options: ImportOptions): Promise<AgentPluginInfo>

// 从目录导入（入口，支持批量）
function importWorkBuddyExpertDir(dirPath: string, options: ImportOptions): Promise<BatchImportResult>
```

***

## 七、边界情况

### 7.1 LLM 输出不稳定

LLM 可能返回格式不合规的 JSON。处理策略：

| 场景                | 处理                          |
| ----------------- | --------------------------- |
| JSON 解析失败         | 重试一次（相同输入），仍失败则标记为 LLM\_ERR |
| 缺少必要字段            | 用字段映射的默认值补全                 |
| SubAgent 文件格式错误   | 降级为单 Agent 模式               |
| builtinTools 值不合法 | 清空 builtinTools             |

### 7.2 同名专家团

已存在同 `expertGroup` ID 的插件时，默认**跳过**，toast warning。

### 7.3 Skills 复制

Skills 目录由脚本直接复制，不经过 LLM（格式兼容，无需转换）。

### 7.4 非标准格式容错

LLM 天然具备语义理解能力，以下场景均可自动处理：

| 场景                 | 纯脚本处理         | LLM 处理     |
| ------------------ | ------------- | ---------- |
| 中文名缺失              | 需硬编码 fallback | 自动选择最佳替代   |
| expertType 非 agent | 需特判           | 忽略，按实际内容转换 |
| rules 格式异常         | 解析失败          | 理解语义后融入    |
| prompt 内容模糊        | 照搬            | 可优化措辞      |

### 7.5 安装位置

写入 `~/.proma/plugins/`，与 WorkMate 用户插件路径一致，`plugin-registry-service.ts` 自动发现。

***

## 八、转换示例

### 输入：WorkBuddy `backend-architect`

**`.codebuddy-plugin/plugin.json`**：

```json
{
  "name": "backend-architect",
  "version": "1.0.0",
  "expertType": "agent",
  "agentName": "backend-architect",
  "displayName": { "zh": "磐石石", "en": "Joy" },
  "profession": { "zh": "后端架构师", "en": "Backend Architect" },
  "displayDescription": {
    "zh": "深耕分布式系统和高并发架构，擅长将复杂业务转化为优雅技术方案"
  },
  "defaultInitPrompt": {
    "zh": "我们的后端系统架构需要重构,需要更好的扩展性和稳定性,请后端架构师帮我们设计可靠的后端架构方案。"
  },
  "tags": [
    { "zh": "后端架构" }, { "zh": "微服务" }, { "zh": "高可用设计" }
  ],
  "quickPrompts": [
    { "zh": "我们的后端系统架构需要重构..." },
    { "zh": "优化数据库架构和查询性能" },
    { "zh": "制定微服务拆分和服务治理方案" }
  ],
  "skills": ["./skills/frontend-dev", "./skills/fullstack-dev"]
}
```

### LLM 输出：WorkMate 插件

**`.claude-plugin/plugin.json`**：

```json
{
  "name": "后端架构师",
  "version": "1.0.0",
  "description": "深耕分布式系统和高并发架构，擅长将复杂业务转化为优雅技术方案",
  "author": { "name": "WorkBuddy Import" },
  "license": "MIT",
  "keywords": ["expert-group", "后端架构", "微服务", "高可用设计"],
  "expertGroup": "backend-architect"
}
```

**`expert-groups/backend-architect.json`**（LLM 可能识别出 SubAgent 并拆分）：

```json
{
  "id": "backend-architect",
  "name": "后端架构师",
  "description": "深耕分布式系统和高并发架构，擅长将复杂业务转化为优雅技术方案",
  "introduction": "我们的后端系统架构需要重构,需要更好的扩展性和稳定性,请后端架构师帮我们设计可靠的后端架构方案。",
  "mainRole": {
    "name": "后端架构师",
    "prompt": "你是后端架构师，负责统筹架构设计...\n\n可用 Skills：\n- fullstack-dev：全栈应用架构与开发指南\n- frontend-dev：前端开发与 AI 媒体生成\n\n当需要数据库专项设计时，调用数据库架构师子角色；当需要微服务拆分时，调用微服务架构师子角色。"
  },
  "subagents": ["db-architect", "microservice-architect"],
  "subagentLabels": {
    "db-architect": "数据库架构师",
    "microservice-architect": "微服务架构师"
  },
  "builtinTools": [],
  "skills": ["fullstack-dev", "frontend-dev"],
  "mcpServers": [],
  "tags": ["后端架构", "微服务", "高可用设计"],
  "samplePrompts": [
    "我们的后端系统架构需要重构...",
    "优化数据库架构和查询性能",
    "制定微服务拆分和服务治理方案"
  ],
  "toolsPolicy": {
    "mode": "inherit",
    "allowedTools": [],
    "disallowedTools": []
  }
}
```

> 上例展示 LLM 可能将一个 WorkBuddy 单 Agent 拆分为"主调度 + 2 个 SubAgent"的模式——这是纯脚本无法做到的。

***

## 九、可转换的专家列表（39个）

所有 WorkBuddy 专家均可转换，LLM 自动处理各类边界情况。其中 `software-company` 为团队模式（`expertType: "team"`），其余为单 Agent 模式：

| #  | 插件名                              | 含 Skills | 含 Rules | 备注      |
| -- | -------------------------------- | :------: | :-----: | ------- |
| 1  | ai-engineer                      |     是    |    否    | <br />  |
| 2  | ai-image-prompt-engineer         |     是    |    否    | <br />  |
| 3  | aihot                            |     是    |    否    | <br />  |
| 4  | backend-architect                |     是    |    否    | <br />  |
| 5  | chuangye-manor                   |     是    |    否    | <br />  |
| 6  | code-review-expert               |     是    |    否    | <br />  |
| 7  | content-creator                  |     是    |    否    | <br />  |
| 8  | cross-border-ecommerce-expert    |     是    |    否    | <br />  |
| 9  | data-analysis                    |     是    |  **是**  | <br />  |
| 10 | data-analytics-reporter          |     是    |    否    | <br />  |
| 11 | dev-ops-automation-engineer      |     是    |    否    | <br />  |
| 12 | document-generation-expert       |     是    |    否    | <br />  |
| 13 | douyin-strategist                |     是    |    否    | <br />  |
| 14 | embedded-firmware-engineer       |     否    |    否    | 无agents |
| 15 | equity-research                  |     是    |  **是**  | <br />  |
| 16 | fbsir-industry-scene-researcher  |     是    |    否    | <br />  |
| 17 | frontend-developer               |     是    |    否    | <br />  |
| 18 | game-designer                    |     是    |    否    | <br />  |
| 19 | gaokao-advisor                   |     是    |    否    | <br />  |
| 20 | legal-compliance-reviewer        |     是    |    否    | <br />  |
| 21 | llm-wiki                         |     是    |    否    | <br />  |
| 22 | lsp-index-engineer               |     是    |    否    | <br />  |
| 23 | mobile-application-developer     |     是    |    否    | <br />  |
| 24 | ppt-implement                    |     是    |    否    | <br />  |
| 25 | product-management               |     是    |    否    | <br />  |
| 26 | proposal-strategist              |     是    |    否    | <br />  |
| 27 | recruitment-expert               |     是    |    否    | <br />  |
| 28 | sales-coach                      |     是    |    否    | <br />  |
| 29 | senior-developer                 |     是    |    否    | <br />  |
| 30 | senior-project-manager           |     是    |    否    | <br />  |
| 31 | short-video-editing-coach        |     是    |    否    | <br />  |
| 32 | software-architect               |     是    |    否    | <br />  |
| 33 | software-company                 |     否    |    否    | **团队**  |
| 34 | technical-documentation-engineer |     是    |    否    | <br />  |
| 35 | trend-researcher                 |     是    |    否    | <br />  |
| 36 | tripstar-agent                   |     是    |    否    | <br />  |
| 37 | ui-designer                      |     是    |    否    | <br />  |
| 38 | wechat-official-account-expert   |     是    |    否    | <br />  |
| 39 | xiaohongshu-operations-expert    |     是    |    否    | <br />  |

***

## 十、与现有"上传专家团 Zip"的关系

| <br /> | 上传专家团 Zip           | 导入 WorkBuddy         |
| ------ | ------------------- | -------------------- |
| 输入格式   | WorkMate 原生插件 zip   | WorkBuddy 专家团 zip/目录 |
| 转换方式   | 不需要                 | LLM + Skill 提示词      |
| 安装路径   | `~/.proma/plugins/` | 同上（转换后安装）            |
| 按钮位置   | "上传专家团 Zip"         | 在其左侧新增               |
| 耗时     | 即时                  | 5-15s（LLM 调用）        |

两个功能独立互补——WorkMate 原生插件直接上传，WorkBuddy 专家团由 LLM 转换后安装。
