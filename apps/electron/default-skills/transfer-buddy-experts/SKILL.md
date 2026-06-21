---
## name: transfer-buddy-experts description: 将 WorkBuddy 专家团转换为 WorkMate 专家团。当用户想要导入、转换、迁移 WorkBuddy 的专家团到 WorkMate 时使用。也适用于用户说"把 WorkBuddy 专家转过来"、"导入 WorkBuddy 专家团"、"转换专家团格式"、"迁移专家"等场景。支持单 Agent 和团队模式，自动处理 SubAgent 拆分、Rules 融入、Skills 映射等。 version: "1.4.0"
---

# Transfer Buddy Experts

将 WorkBuddy 格式的专家团转换为 WorkMate 格式。支持单 Agent 和团队两种模式，自动处理字段映射、SubAgent 拆分、Rules 融入、Skills 复制。

## 使用方式

用户需要提供 WorkBuddy 专家团的源目录路径（或 Zip 包解压后的路径），本 Skill 会读取源文件并输出 WorkMate 格式的专家团。

## 输入

接收一个 WorkBuddy 专家团目录，包含：

- `.codebuddy-plugin/plugin.json`：插件清单
- `agents/`：Agent 定义目录（1 个或多个 .md 文件）
- `rules/*.md`：规则文件（可能没有）
- `skills/`：技能目录（可能没有）

## 两种源格式

先判断再转换：

### 类型 A：单 Agent 模式（`expertType: "agent"`）

最常见的模式。`agents/` 下只有 1 个 .md 文件，`plugin.json` 包含 `displayName`、`profession`、`tags`、`quickPrompts` 等字段。

**示例**：`ai-engineer`、`backend-architect`、`data-analysis`、`equity-research` 等

### 类型 B：团队模式（`expertType: "team"`）

多 Agent 协作模式。`agents/` 下有多个 .md 文件，`plugin.json` 包含 `teamInfo`（leadAgent + memberAgents）和 `members` 数组，每个 member 有独立的 `id`、`name`、`profession`、`role`。

**示例**：`software-company`（1 个 team-lead + 4 个 member）

**团队模式的转换策略**：

- `teamInfo.leadAgent` 对应的 agent → 转为 WorkMate 的 `mainRole`
- `teamInfo.memberAgents` 对应的 agents → 转为 WorkMate 的 `subagents`
- `members[].name.zh` → `subagentLabels` 的中文标签
- `members[].id` → subagents 数组中的英文 ID

## Agent .md 文件格式差异

不同专家的 agent .md 文件的 frontmatter 字段不一致，需要灵活处理：

| 字段 | 出现情况 | 说明 |
| --- | --- | --- |
| `name` | 几乎都有 | Agent 英文标识 |
| `description` | 几乎都有 | 英文描述 |
| `color` | 部分有 | 主题色（忽略，WorkMate 不使用） |
| `emoji` | 部分有 | 图标（忽略） |
| `vibe` | 部分有 | 一句话风格描述（忽略） |
| `maxTurns` | 部分有 | 最大轮次（忽略） |
| `displayName` | 少数有（如 chuangye-manor） | 双语显示名 |
| `profession` | 少数有（如 chuangye-manor） | 双语职业名 |
| `alwaysApply` | [SKILL.md](http://SKILL.md) 可能有 | 是否始终应用（忽略） |

> **处理原则**：只提取 frontmatter 中的 `name` 和 `description`，其他字段忽略。正文（frontmatter 之后的部分）作为 prompt 内容。

## 输出要求

### 1. `.claude-plugin/plugin.json`

> ⚠️ **必须按下方格式重新生成**，不得将源 WorkBuddy 的 `plugin.json` 原样复制。WorkMate 的 `.claude-plugin/plugin.json` 是精简格式，只含以下 7 个字段。

```json
{
  "name": "{中文显示名}",
  "version": "{沿用源版本号，默认 1.0.0}",
  "description": "{中文描述}",
  "author": { "name": "WorkBuddy Import" },
  "license": "MIT",
  "keywords": ["expert-group", ...{中文标签}],
  "expertGroup": "{英文name}"
}
```

### 2. `expert-groups/{id}.json`

```json
{
  "id": "{英文name}",
  "name": "{中文显示名}",
  "categories": ["{分类1}", "{分类2}"],
  "description": "{中文描述}",
  "introduction": "{默认入口提示}",
  "mainRole": {
    "name": "{主角色中文名}",
    "prompt": "{主角色 prompt}"
  },
  "subagents": ["{subagent-id-1}", "{subagent-id-2}"],
  "subagentLabels": {
    "{subagent-id-1}": "{中文标签1}",
    "{subagent-id-2}": "{中文标签2}"
  },
  "builtinTools": [],
  "skills": ["{skills 目录名列表}"],
  "mcpServers": [],
  "tags": ["{中文标签列表}"],
  "samplePrompts": ["{中文快捷提示列表}"],
  "toolsPolicy": {
    "mode": "inherit",
    "allowedTools": [],
    "disallowedTools": []
  }
}
```

### 3. `agents/{subagent-name}.md`（仅 SubAgent 时输出）

每个 SubAgent 生成一个独立的 .md 文件，格式：

```markdown
---
name: {subagent-id}
description: {角色描述}
---

{角色 prompt 正文}
```

## 字段映射规则

### 类型 A（单 Agent）字段映射

| 源字段 | 目标字段 | 规则 |
| --- | --- | --- |
| `name` | `expertGroup` + `id` | 直接使用 |
| `displayName.zh` | `name` | 优先取，回退 profession.zh → agent .md body 中 `# 中文名` 提取 → plugin.json 的 `name` |
| `displayDescription.zh` | `description` | 优先取中文，回退 `description_zh`（扁平字段变体）→ `description` |
| `defaultInitPrompt.zh` | `introduction` | 中文版，如无则留空 |
| `profession.zh` | `mainRole.name` | 职业名 |
| `tags[].zh` | `tags` | 转为 string\[\]；如无 tags，从 profession.zh + skills 名称 + agent .md body 关键词提取 |
| `quickPrompts[].zh` | `samplePrompts` | 转为 string\[\] |
| `skills[]` 路径 | `skills` | 提取最外层目录名（如 `./skills/ima-skills` → `ima-skills`） |
| `version` | `version` | 直接使用，默认 1.0.0 |
| agent .md 正文 | `mainRole.prompt` | 见 prompt 构建规则 |
| `rules/*.md` | 融入 `mainRole.prompt` | 见 prompt 构建规则 |

### 类型 B（团队）字段映射

| 源字段 | 目标字段 | 规则 |
| --- | --- | --- |
| `name` | `expertGroup` + `id` | 直接使用 |
| `displayName.zh` | `name` | 优先取，回退同类型 A（profession.zh → body `# 中文名` → `name`） |
| `displayDescription.zh` | `description` | 优先取中文，回退 `description_zh` → `description`（同类型 A） |
| `defaultInitPrompt.zh` | `introduction` | 中文版，如无则留空 |
| `version` | `version` | 直接使用，默认 1.0.0 |
| `teamInfo.leadAgent` 对应 agent | `mainRole` | lead 的 .md 正文 → mainRole.prompt；lead 的 `profession.zh`（或 `members[]` 中 lead 的 profession.zh）→ [mainRole.name](http://mainRole.name) |
| `teamInfo.memberAgents` 对应 agents | `subagents` | 每个 member 生成 agents/{id}.md |
| `members[].name.zh` | `subagentLabels[id]` | 中文标签 |
| `members[].id` | subagents 数组元素 | 英文 ID |
| `members[].profession.zh` | agents/{id}.md 的 frontmatter description | 职业 |
| `tags[]` | `tags` | 如无 tags，从 members 的 profession 中提取 |
| `quickPrompts[]` | `samplePrompts` | 如无，从 lead agent 的典型场景中提取 |
| `skills[]` 路径 | `skills` | 提取最外层目录名（同类型 A） |
| `rules/*.md` | 融入 `mainRole.prompt` | 同类型 A |

> **plugin.json 字段处理原则**：转换时只读取上述映射表中列出的字段，其余字段（如 `homepage`、`author`、`avatar`、`_note_*`、`connector*`、`operatingContract` 等 WorkBuddy 平台元数据）一律忽略。`agents[]` 字段可用于校验——验证 `teamInfo` 中引用的 agent 是否在 `agents/` 目录下确有对应文件。

## 分类推断规则

转换完成后，根据内容推断 `categories`（字符串数组），专家可归属多个分类。

> ⚠️ **严格限制**：`categories` 的值**必须**从下方 17 类中选取**纯中文分类名**（如 `"内容创作"`），禁止使用任何编号前缀（如 `"11.内容创作"`、`"7.合规与法务"` 或纯数字 `"07"`）。非纯中文名的分类会导致专家市场筛选失效。

### 分类体系

| 分类 | 说明 | 典型标签/关键词 |
| --- | --- | --- |
| 投行与资本市场 | 投资银行、并购、债券承销、IPO | 投行、并购、IPO、债券、承销 |
| 交易与量化投资 | 自营交易、量化策略、算法交易 | 交易、量化、做市、算法、回测、选股 |
| 研究分析 | 行业/宏观/股票/固收研究 | 研究、分析、研报、行业分析、宏观 |
| 财富管理 | 理财规划、资产配置、家族办公室 | 财富管理、理财、资产配置、私人银行 |
| 财务与会计 | 核算、对账、结账、报表、AP | 财务、会计、核算、对账、AP、GL、结账 |
| 风险管理 | 市场/信用/操作风险 | 风控、风险、压力测试 |
| 合规与法务 | 监管合规、法律事务、反洗钱 | 合规、法务、法律、监管、KYC、AML |
| AI与数据智能 | ML、NLP、大模型、数据分析、知识管理 | AI、机器学习、数据分析、知识库、资讯、大模型 |
| 技术研发 | 开发、架构、DevOps、安全、SRE、基础设施 | 开发、架构、前端、后端、移动、DevOps、嵌入式、安全、SRE |
| 产品设计 | 产品管理、UI/UX、交互设计、游戏设计 | 产品、设计、UI、UX、游戏、原型 |
| 内容创作 | 新媒体、视频、文案、文档、AI图像 | 内容、文案、视频、剪映、新媒体、公众号、小红书、技术文档 |
| 营销增长 | 广告投放、SEO、电商、品牌、增长 | 营销、增长、广告、SEO、电商、品牌、私域 |
| 销售商务 | 销售、商务拓展、提案 | 销售、商务、提案、招投标、预销售 |
| 项目管理与质量 | 项目管理、测试、QA、文档、流程优化 | 项目管理、测试、QA、文档、流程、敏捷 |
| 运营与人力 | HR、招聘、培训、客服、供应链 | 招聘、HR、培训、客服、运营、供应链 |
| 战略与咨询 | 行业咨询、战略规划、创业辅导 | 战略、咨询、创业、行业场景、合伙人 |
| 生活服务 | 出行、教育、日常生活 | 旅行、高考、留学、出行 |

### categoryId 映射（优先信号）

源 `plugin.json` 中的 `categoryId` 是最强的分类信号，**在清理之前先读取并映射**：

| 源 categoryId | 新分类 |
| --- | --- |
| `01-ProductDesign` | 产品设计 |
| `02-Engineering` | 技术研发 |
| `03-GameSpatial` | 产品设计 |
| `04-DataAI` | AI与数据智能 |
| `05-MarketingGrowth` | 营销增长 |
| `06-ContentCreative` | 内容创作 |
| `07-SalesCommerce` | 销售商务 |
| `08-FinanceInvestment` | 拆分为：投行与资本市场 / 交易与量化投资 / 研究分析 / 财富管理 / 财务与会计 (根据 tags 进一步判断) |
| `09-OperationsHR` | 运营与人力 |
| `10-ProjectQuality` | 项目管理与质量 |
| `11-SecurityCompliance` | 合规与法务 |
| `12-IndustryConsultant` | 拆分为：战略与咨询 / 生活服务 (根据 tags 进一步判断) |

> 映射完成后，再将 `categoryId` 从 prompt 中清理（见 prompt 构建步骤四）。

### 推断优先级

1. **categoryId 优先**：先按上表映射，得到基础分类
2. **tags 补充**：遍历 tags 字段，命中分类体系关键词即追加分类（如跨类则作为第二分类）
3. **description 语义**：上述均未覆盖时，分析 description 做语义匹配
4. **profession 辅助**：取 profession 字段的关键词做最后补充
5. **兜底**：以上均未匹配时，留空数组，人工补充

### 跨类原则

- 一个专家可归属 **1-2 个分类**，主分类在前，次要分类在后
- 跨类条件：prompt 内容真正覆盖多个领域的能力（不只是涉及）
- 例如：AI图像工程师 → `["内容创作", "AI与数据智能"]`
- 例如：技术文档工程师 → `["内容创作", "技术研发"]`

### 分类字段在后续使用中的作用

`categories` 用于：

- 专家市场的分类筛选与浏览
- 与用户意图的匹配召回
- 跨类专家的多入口曝光

## mainRole.prompt 构建规则

### 步骤一：提取 Agent 正文

取 agent .md 的正文部分（frontmatter `---` 分隔符之后的所有内容）。

### 步骤二：融入 Rules

如果源目录存在 `rules/*.md` 文件：

- **剥离 frontmatter**：部分 rules 文件包含 YAML frontmatter（含 `alwaysApply`、`enabled`、`updatedAt`、`provider` 等字段），先剥离 frontmatter 再处理正文
- **清理 WorkBuddy 标记**：删除 rules 正文中的 `<system_reminder>` XML 标签块及其内容（WorkBuddy 平台特有，对 WorkMate 无意义）
- **理解**每条规则的语义
- **自然融入**到 prompt 中最合适的位置（不是简单追加到末尾）
- 例如：如果规则是"交付物格式标准"，融入 prompt 中"输出规范"部分；如果是"PM 判断框架"，融入"分析原则"部分
- 如果规则内容与 prompt 已有内容重复，**合并去重**

### 步骤三：附加 Skills 说明

在 prompt 末尾添加可用 Skills 列表：

```
## 可用 Skills

本专家已集成以下专业技能，将在对应场景下自动调用：

{遍历 skills 目录，每个生成：}
- **{skillName}**：{从 SKILL.md 第一段提取的一句摘要}
```

### 步骤四：清理 WorkBuddy 特有内容

删除以下 WorkBuddy 特有、WorkMate 不需要的内容：

- `avatars/` 引用（如 `![](...)` 形式的头像链接）
- `.downloaded_at` 相关内容
- `categoryId` 分类引用
- agent .md 中引用其他 agent 文件的相对路径（如 `` `software-product-manager.md` ``、`./agents/xxx.md`），替换为 SubAgent 调用说明

### 步骤五：保留核心内容

以下内容**必须保留**，不得删减：

- 角色定义和人格设定
- 工作流程和协作机制
- 专业能力清单
- 边界与原则
- 交付物规范
- 典型场景
- Skill 调用触发规则
- 沟通风格

## SubAgent 拆分规则

### 类型 A 的拆分判断

分析单 Agent 的 prompt，判断是否隐含**多个可独立调度的子角色**：

**拆分信号**：

- prompt 中出现了明确的不同角色定义（如"你同时是A和B"）
- 存在独立的工作流程阶段，每个阶段有独立的人格和工具集
- prompt 中有"当你需要X时，调用/切换到Y角色"这样的调度逻辑
- 不同专业领域混合在一个 prompt 中（如"数据分析 + 微信搜索"两个完全独立的职能）

**不拆分信号**：

- 角色只是同一专业的不同方面（如"后端架构师的微服务和数据库能力"）
- 没有独立的触发条件或调度逻辑
- prompt 作为一个连贯的整体运作

### 类型 B 直接映射

团队模式的 SubAgent 结构已由源格式定义，直接映射即可：

- lead → mainRole
- members → subagents

### SubAgent .md 文件规范

每个拆分出的 SubAgent 生成 `agents/{id}.md`：

```markdown
---
name: {subagent-id}
description: {角色描述，中文}
---

{角色 prompt 正文，包含：}
- 角色定义
- 专业能力
- 工作方式
- 输出规范
```

## builtinTools 推断

分析 prompt 和 skills 内容，如果出现以下语义，添加对应内置工具：

| 语义特征 | 内置工具 | 典型触发词 |
| --- | --- | --- |
| 需要搜索互联网获取实时信息 | `web-search` | 搜索、调研、查一下、行业数据、最新信息、检索、实时查询、资讯速递 |

## 中文优先原则

- 所有面向用户的字段（name、description、tags、samplePrompts、subagentLabels）优先取中文版本
- 中文字段缺失时的回退链：`zh` → `en` → 源 `name` 字段 → 合理推断
- prompt 正文保持原文语言（大多数中文专家团用中文写 prompt，英文专家团保留英文）

## 特殊场景处理

### 无 agents/ 目录的专家

少数专家（如 `embedded-firmware-engineer`）可能没有 `agents/` 目录。此时：

- 从 `plugin.json` 的 `agentName` 推断应有的 agent 名称
- 用 `profession.zh` + `displayDescription.zh` 构建最小化 mainRole.prompt
- 标记 summary 中说明"源缺 agents 目录，已生成最小化 prompt"

### Skills 目录嵌套

部分专家的 skills 有嵌套结构（如 `ima-skills/knowledge-base/`、`ima-skills/notes/`）。

- `skills` 字段只取**最外层目录名**（如 `ima-skills`）
- 子目录结构由 [SKILL.md](http://SKILL.md) 内部管理，无需在 expert-group.json 中体现

### [SKILL.md](http://SKILL.md) 特殊 frontmatter

部分 [SKILL.md](http://SKILL.md) 有 `alwaysApply`、`provider`、`enabled`、`updatedAt` 等字段。这些是 WorkBuddy 特有的，**忽略**，只提取 [SKILL.md](http://SKILL.md) 的正文摘要。

### 大型 Rules 文件

如 `equity-research` 有 4 个 rules 文件共 300+ 行。处理方式：

- 不全文复制到 prompt 中
- **提取核心规则要点**，精简融入 prompt 对应章节
- 保留规则的约束力和可操作性，去掉冗余格式说明

## Skills 复制

WorkBuddy 专家的 `skills/` 目录中的每个 skill 需要做以下处理：

### 复制到输出目录

将 `skills/{skill-name}/` 目录完整复制到输出目录的 `skills/{skill-name}/` 下，保持目录结构不变（含 [SKILL.md](http://SKILL.md)、prompts/、examples/ 等子目录）。

### 更新 mainRole.prompt

在 prompt 末尾添加可用 Skills 列表（见 mainRole.prompt 构建规则中的步骤三），让专家知道如何调用这些技能。

### 在 expert-group.json 中引用

`expert-groups/{id}.json` 的 `skills` 字段写入提取的 skill 名称列表：

```json
"skills": ["{skill-name-1}", "{skill-name-2}"]
```

## 输出格式

转换完成后，将结果文件写入目标目录。输出结构：

```
{output-dir}/{expert-name}/
├── .claude-plugin/
│   └── plugin.json
├── expert-groups/
│   └── {id}.json
├── agents/                # 仅 SubAgent 时有
│   └── {subagent-name}.md
└── skills/                # 从源目录复制（专家自带）
    └── {skill-name}/
        └── SKILL.md
```

同时在对话中输出转换摘要：

```
转换完成：
- 类型：单Agent / 团队
- 分类：{分类1} / {分类2}
- SubAgent 拆分：是/否（原因）
- builtinTools：无 / web-search
- Rules 处理：无 / 已融入（方式）
- Skills：{skill-name-1}, {skill-name-2}...
- 特殊情况：（如有）
```

## 质量检查清单

输出前请自检：

- [ ] `categories` 已赋值（至少 1 个，跨类不超过 2 个），值为**纯中文分类名**（无编号前缀如 `"11.内容创作"`，无纯数字如 `"07"`）

- [ ] `expertGroup` 字段与 `id` 一致，均为英文

- [ ] `name` 字段为中文，不是英文

- [ ] `introduction` 字段已赋值，非空

- [ ] `mainRole.name` 为中文

- [ ] `subagents` 与 `subagentLabels` 键名一致

- [ ] 每个 subagent 在 `agents/` 下有对应的 .md 文件

- [ ] mainRole.prompt 中不含 WorkBuddy 特有内容（avatars、.downloaded_at 等）

- [ ] Skills 目录名提取正确（最外层目录名）

- [ ] 如有 rules，已融入 prompt 且不重复

- [ ] `builtinTools` 值合法（目前仅支持 `web-search`）

- [ ] `toolsPolicy.mode` 为 `"inherit"`

- [ ] 输出目录结构完整（`.claude-plugin/plugin.json` + `expert-groups/{id}.json` 均存在）