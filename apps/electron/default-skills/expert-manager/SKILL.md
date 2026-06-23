---
name: expert-manager
description: 将各种格式的专家团转换为 WorkMate 专家团，或根据用户提示生成专家团。当用户想要导入、转换、迁移 WorkBuddy 的专家团到 WorkMate，或从外部格式（SKILL.md、通用 Markdown）导入转换，或根据用户提示生成全新的专家团时使用。也适用于说"把 WorkBuddy 专家转过来"、"导入 WorkBuddy 专家团"、"转换专家团格式"、"迁移专家"、"帮我生成一个专家团"、"创建一个XX专家"、"我想有一个XX领域的专家团"、"从 SKILL.md 导入"、"把这篇文档转成专家团"等场景。支持单 Agent 和团队两种模式，三种工作方式：格式转换、外部导入、提示词生成。
version: "2.0.0"
---

# expert-manager - 专家团转换与生成工具

将各种格式的专家团转换为 WorkMate 格式的专家团，或根据用户提示引导生成专家团。支持单 Agent 和团队两种模式。

## 三种工作模式

本 Skill 支持以下三种模式，根据用户输入自动判断使用哪种：

| 模式 | 输入特征 | 典型用户说法 |
|------|---------|-------------|
| **模式一：WorkBuddy 转换** | 提供 WorkBuddy 专家团目录路径（含 `.codebuddy-plugin/`） | "把这个 WorkBuddy 专家转过来"、"转换这个专家团" |
| **模式二：外部格式导入** | 提供 SKILL.md 文件路径、Markdown 文档、或 Skill 目录 | "把这个 SKILL.md 转成专家团"、"导入这篇文档" |
| **模式三：提示词引导生成** | 用户用自然语言描述想要什么专家 | "帮我创建一个数据分析专家"、"我需要一个XX领域的团队" |

---

## 模式一：WorkBuddy 专家团转换

将 WorkBuddy 格式（`.codebuddy-plugin/` 目录）的专家团转换为 WorkMate 格式。

### 使用方式

用户需要提供 WorkBuddy 专家团的源目录路径（或 Zip 包解压后的路径），读取源文件并输出 WorkMate 格式的专家团。

### 输入

接收一个 WorkBuddy 专家团目录，包含：

- `.codebuddy-plugin/plugin.json`：插件清单
- `agents/`：Agent 定义目录（1 个或多个 .md 文件）
- `rules/*.md`：规则文件（可能没有）
- `skills/`：技能目录（可能没有）

### 两种源格式

先判断再转换：

#### 类型 A：单 Agent 模式（`expertType: "agent"`）

最常见的模式。`agents/` 下只有 1 个 .md 文件，`plugin.json` 包含 `displayName`、`profession`、`tags`、`quickPrompts` 等字段。

**示例**：`ai-engineer`、`backend-architect`、`data-analysis`、`equity-research` 等

#### 类型 B：团队模式（`expertType: "team"`）

多 Agent 协作模式。`agents/` 下有多个 .md 文件，`plugin.json` 包含 `teamInfo`（leadAgent + memberAgents）和 `members` 数组。

**示例**：`software-company`（1 个 team-lead + 4 个 member）

#### 团队模式的转换策略

- `teamInfo.leadAgent` 对应的 agent → 转为 WorkMate 的 `mainRole`
- `teamInfo.memberAgents` 对应的 agents → 转为 WorkMate 的 `subagents`
- `members[].name.zh` → `subagentLabels` 的中文标签
- `members[].id` → subagents 数组中的英文 ID

### 字段映射规则

#### 类型 A（单 Agent）字段映射

| 源字段 | 目标字段 | 规则 |
| --- | --- | --- |
| `name` | `expertGroup` + `id` | 直接使用 |
| `displayName.zh` | `name` | 优先取，回退 profession.zh → agent .md body 中 `# 中文名` 提取 → plugin.json 的 `name` |
| `displayDescription.zh` | `description` | 优先取中文，回退 `description_zh`（扁平字段变体）→ `description` |
| `defaultInitPrompt.zh` | `introduction` | 中文版，如无则留空 |
| `profession.zh` | `mainRole.name` | 职业名 |
| `tags[].zh` | `tags` | 转为 string[]；如无 tags，从 profession.zh + skills 名称 + agent .md body 关键词提取 |
| `quickPrompts[].zh` | `samplePrompts` | 转为 string[] |
| `skills[]` 路径 | `skills` | 提取最外层目录名（如 `./skills/ima-skills` → `ima-skills`） |
| `version` | `version` | 直接使用，默认 1.0.0 |
| agent .md 正文 | `mainRole.prompt` | 见 prompt 构建规则 |
| `rules/*.md` | 融入 `mainRole.prompt` | 见 prompt 构建规则 |

#### 类型 B（团队）字段映射

| 源字段 | 目标字段 | 规则 |
| --- | --- | --- |
| `name` | `expertGroup` + `id` | 直接使用 |
| `displayName.zh` | `name` | 优先取，回退同类型 A |
| `displayDescription.zh` | `description` | 优先取中文 |
| `defaultInitPrompt.zh` | `introduction` | 中文版，如无则留空 |
| `version` | `version` | 直接使用，默认 1.0.0 |
| `teamInfo.leadAgent` 对应 agent | `mainRole` | lead 的 .md 正文 → mainRole.prompt + members[].profession.zh → mainRole.name |
| `teamInfo.memberAgents` 对应 agents | `subagents` | 每个 member 生成 agents/{id}.md |
| `members[].name.zh` | `subagentLabels[id]` | 中文标签 |
| `members[].id` | subagents 数组元素 | 英文 ID |
| `members[].profession.zh` | agents/{id}.md 的 frontmatter description | 职业 |
| `tags[]` | `tags` | 如无 tags，从 members 的 profession 中提取 |
| `quickPrompts[]` | `samplePrompts` | 如无，从 lead agent 的典型场景中提取 |
| `skills[]` 路径 | `skills` | 提取最外层目录名 |

> **plugin.json 字段处理原则**：转换时只读取上述映射表中列出的字段，其余字段（如 `homepage`、`author`、`avatar`、`_note_*`、`connector*`、`operatingContract` 等 WorkBuddy 平台元数据）一律忽略。

---

## 模式二：外部格式导入转换

接收外部非 WorkBuddy 格式的输入，转换为 WorkMate 专家团。支持以下外部格式。

### 格式 A：Claude Code SKILL.md 导入

输入一个或多个 SKILL.md 文件（或包含 SKILL.md 的目录）。

#### SKILL.md 格式识别

标准的 WorkMate/Claude Code SKILL.md 文件具有以下结构：

```markdown
---
name: skill-name
description: skill description
version: "1.0.0"
---

# Skill Title

[skill body content...]
```

#### 字段映射

| SKILL.md 字段 | WorkMate 目标字段 | 规则 |
| --- | --- | --- |
| frontmatter `name` | `id` + `expertGroup` | 直接使用作为英文标识 |
| frontmatter `description` | `description` | 作为专家团描述 |
| 正文（frontmatter 之后） | `mainRole.prompt` | 整个正文作为 prompt 基础 |
| 无（由 AI 推断） | `name`（中文显示名） | 根据 description 和正文推断合适的中文名 |
| 无（由 AI 推断） | `categories` | 根据内容按分类推断规则确定 |
| 无（由 AI 推断） | `tags` | 根据内容提取 3-5 个中文标签 |
| 无（由 AI 推断） | `mainRole.name` | 根据角色推断中文角色名 |
| 无（由 AI 推断） | `introduction` | 根据 description 撰写一句入口提示 |
| 无（由 AI 推断） | `samplePrompts` | 根据典型场景生成 3-5 个 |

#### 单文件 vs 多文件判断

- **单个 SKILL.md** → 生成单 Agent 专家团
- **目录下多个 SKILL.md** → 生成团队模式专家团，每个 SKILL.md 作为一个 subagent
  - 目录名或第一个文件作为 mainRole
  - 其余 SKILL.md 分别作为 subagent
  - 每个 subagent 生成 `agents/{id}.md`

#### Prompt 构建

对于 SKILL.md 正文，按以下规则处理：
- 保留所有核心指令、工作流程、能力清单
- 追加角色定义头部（"你是 XX 专家..."），因为 SKILL.md 通常缺少角色人格设定
- 删除 WorkMate 特有但不需要的引用（如工具调用示例）
- 参考 mainRole.prompt 构建规则进行精炼

### 格式 B：通用 Markdown 专家定义

输入用户提供的自由格式 Markdown 文档，描述一个专家角色或团队。

#### 格式识别

通用 Markdown 没有固定结构，可能包含：
- 标题（`#` / `##`）表示角色或章节
- 段落描述角色职责、能力
- 列表、表格等结构化信息
- 代码块、流程图等

#### 字段映射

| 源内容特征 | WorkMate 目标字段 | 提取规则 |
| --- | --- | --- |
| 首个 `#` 标题 | `name`（中文显示名） | 取第一个标题作为中文名 |
| 无标题时的内容开头 | `name` | 由 AI 根据首段推断 |
| 英文标题或标签 | `id` + `expertGroup` | 取标题或描述中的英文词转为 kebab-case |
| 整体描述段落 | `description` + `introduction` | 提取概括性描述 |
| 正文全部内容 | `mainRole.prompt` | 整个正文作为 prompt，按 prompt 构建规则精炼 |
| 无（由 AI 推断） | `categories`、`tags`、`samplePrompts` | 根据全文推断 |

#### 处理规则

1. **分析结构**：AI 分析文档的标题层级和段落结构
2. **识别角色**：如果文档提到多个角色的不同职责，判断是否应拆分为团队模式
3. **提取核心**：从文档中提取角色定义、工作流程、专业能力、约束条件、交付标准
4. **补全缺失**：补全角色人格设定、沟通风格等 SKILL.md 通常缺少的内容
5. **Prompt 整理**：参照 mainRole.prompt 构建规则（步骤一至五）整理 prompt
6. **输出**：写入标准 WorkMate 目录结构

### 格式 C：多 Skill 目录导入

输入一个包含多个 SKILL.md 子目录的 skills/ 目录，创建一个团队模式专家团。

#### 使用场景

用户有一个现成的 skills 目录，每个子目录是一个独立 Skill：
```
skills/
├── data-analysis/SKILL.md
├── visualization/SKILL.md
└── reporting/SKILL.md
```

#### 转换策略

- 创建团队模式专家团，以"XX技能团队"为中文名
- 整个 skills 目录原样复制到输出目录的 `skills/` 下
- 每个 SKILL.md 作为一个 subagent
- mainRole 作为协调者/主理人角色，prompt 由 AI 根据所有技能综合生成
- subagents 数组列出所有 skill 名
- subagentLabels 根据 SKILL.md 的 name 或 description 推断

---

## 模式三：提示词引导生成专家团

用户提供一段自然语言描述，AI 引导生成完整的专家团。

### 生成流程

```
用户描述 → 需求分析 → 结构设计 → Prompt生成 → 分类标签 → 输出文件
```

#### Step 1：需求分析

先确认用户的意图：

1. **读取用户描述**：理解用户想要的专家领域、目标用户、主要能力
2. **提问澄清**（必要时）：如果描述不够明确，通过提问补充信息，一次只问一个问题：
   - "这个专家主要解决什么问题？"
   - "服务的目标用户是谁？"
   - "需要单 Agent 还是多角色团队协作？"
   - "有没有特定的输出格式要求？"
3. **确定 Agent 类型**：
   - **单 Agent**：一个独立的专家角色，覆盖单一领域
   - **团队模式**：多个角色协作，适合复杂工作流

#### Step 2：结构设计

根据需求设计专家团结构：

**单 Agent 结构设计：**
```
- id: {英文 kebab-case}
- name: {中文显示名}
- mainRole.name: {角色名}
- description: {一句话描述}
- introduction: {入口提示语}
```

**团队模式结构设计：**
```
- id: {英文 kebab-case}
- name: {团队中文名}
- mainRole: {主理人角色定义}
- subagents: [{成员1-id}, {成员2-id}, ...]
- subagentLabels: {成员1-id: "成员1中文名", ...}
- description: {团队描述}
- introduction: {入口提示语}
```

#### Step 3：Prompt 生成

生成 `mainRole.prompt` 时，遵循以下质量标准：

**单 Agent prompt 结构：**
```
# {角色中文名}（{英文名}）

你是 {角色中文名}，一位{角色定位描述}。

## 🎯 核心职责
{3-5 个核心职责领域}

## 🧰 专业能力
{能力清单}

## 🔄 工作流程
{典型工作流程}

## 📋 输出规范
{交付物标准}

## ⚠️ 边界与原则
{约束条件、禁忌}

## 💭 沟通风格
{沟通方式描述}
```

**团队模式 prompt 结构：**

mainRole.prompt（主理人）包含：
```
# {团队名} - 主理人

你是 {主理人角色名}，{团队名} 的负责人。

## 团队成员
{表格列出所有成员：ID、中文名、职责}

## 团队协作机制
{调度规则、信息中转规则}

## 工作流路由
{根据需求类型选择工作流的规则}
```

每个 subagent 生成 `agents/{id}.md`，包含：
```markdown
---
name: {subagent-id}
description: {角色描述}
---

# {角色中文名}

你是 {角色名}，{角色定位}。

## 核心职责
...

## 专业能力
...

## 工作方式
...

## 输出规范
...
```

#### Step 4：分类与标签

按共享的"分类推断规则"确定 categories 和 tags：
- 分析 prompt 内容，匹配分类体系中的关键词
- 一个专家归属 1-2 个分类
- 生成 3-5 个中文标签

#### Step 5：样本提示语

根据典型场景生成 `samplePrompts`（3-5 个）：
- 覆盖该专家最常见的用户请求
- 使用中文，描述具体的任务场景
- 示例："帮我分析一下XX数据"、"写一份关于XX的报告"

### 生成后的 Prompt 精炼

无论单 Agent 还是团队模式，生成的 prompt 都应遵循 mainRole.prompt 构建规则进行精炼，确保：
- 不含模板占位符或示例代码（如 `{变量名}` 未经替换）
- 角色定义清晰，有明确的人格设定
- 工作流程可执行，有具体的步骤说明
- 包含明确的约束条件和边界
- 沟通风格与角色定位一致

---

## 共享规范

以下规范适用于所有三种模式。

### 输出要求

#### 1. `.claude-plugin/plugin.json`

> ⚠️ **必须按下方格式生成**，精简格式只含以下字段。

```json
{
  "name": "{中文显示名}",
  "version": "{版本号，默认 1.0.0}",
  "description": "{中文描述}",
  "author": { "name": "WorkBuddy Import" },
  "license": "MIT",
  "keywords": ["expert-group", ...{中文标签}],
  "expertGroup": "{英文name}"
}
```

#### 2. `expert-groups/{id}.json`

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

#### 3. `agents/{subagent-name}.md`（仅 SubAgent 时输出）

```markdown
---
name: {subagent-id}
description: {角色描述}
---

{角色 prompt 正文}
```

### 分类推断规则

#### 分类体系

> ⚠️ **严格限制**：`categories` 的值**必须**从下方 17 类中选取**纯中文分类名**（如 `"内容创作"`），禁止使用任何编号前缀。非纯中文名的分类会导致专家市场筛选失效。

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

#### 推断优先级

1. **categoryId 优先**（仅模式一）：WorkBuddy 源文件的 categoryId 映射
2. **tags 补充**：遍历 tags 字段，命中分类体系关键词即追加分类
3. **description 语义**：分析 description 做语义匹配
4. **profession 辅助**（仅模式一）：取 profession 字段的关键词做补充
5. **prompt 内容语义**（模式二/三）：分析 prompt 全文做分类推断
6. **兜底**：留空数组，人工补充

#### categoryId 映射（仅模式一）

| 源 categoryId | 新分类 |
| --- | --- |
| `01-ProductDesign` | 产品设计 |
| `02-Engineering` | 技术研发 |
| `03-GameSpatial` | 产品设计 |
| `04-DataAI` | AI与数据智能 |
| `05-MarketingGrowth` | 营销增长 |
| `06-ContentCreative` | 内容创作 |
| `07-SalesCommerce` | 销售商务 |
| `08-FinanceInvestment` | 拆分为：投行与资本市场 / 交易与量化投资 / 研究分析 / 财富管理 / 财务与会计（根据 tags 判断）|
| `09-OperationsHR` | 运营与人力 |
| `10-ProjectQuality` | 项目管理与质量 |
| `11-SecurityCompliance` | 合规与法务 |
| `12-IndustryConsultant` | 拆分为：战略与咨询 / 生活服务（根据 tags 判断）|

#### 跨类原则

- 一个专家可归属 **1-2 个分类**，主分类在前，次要分类在后
- 跨类条件：prompt 内容真正覆盖多个领域的能力（不只是涉及）
- 例如：AI图像工程师 → `["内容创作", "AI与数据智能"]`
- 例如：技术文档工程师 → `["内容创作", "技术研发"]`

### mainRole.prompt 构建规则

#### 步骤一：提取正文

取 agent .md 或 SKILL.md 的正文部分（frontmatter `---` 分隔符之后的所有内容）。模式三中直接使用 AI 生成的 prompt。

#### 步骤二：融入 Rules

如果源目录存在 `rules/*.md` 文件（仅模式一）：

- **剥离 frontmatter**：剥离 YAML frontmatter 再处理正文
- **清理 WorkBuddy 标记**：删除 rules 正文中的 `<system_reminder>` XML 标签块
- **理解**每条规则的语义
- **自然融入**到 prompt 中最合适的位置（不是简单追加到末尾）
- 如果规则内容与 prompt 已有内容重复，**合并去重**

#### 步骤三：附加 Skills 说明

在 prompt 末尾添加可用 Skills 列表（如果存在关联 Skills）：

```
## 可用 Skills

本专家已集成以下专业技能，将在对应场景下自动调用：

{遍历 skills 目录，每个生成：}
- **{skillName}**：{从 SKILL.md 第一段提取的一句摘要}
```

#### 步骤四：清理 WorkBuddy 特有内容（仅模式一）

删除以下 WorkBuddy 特有、WorkMate 不需要的内容：

- `avatars/` 引用（如 `![](...)` 形式的头像链接）
- `.downloaded_at` 相关内容
- `categoryId` 分类引用
- agent .md 中引用其他 agent 文件的相对路径（如 `` `software-product-manager.md` ``），替换为 SubAgent 调用说明

#### 步骤五：保留核心内容

以下内容**必须保留**，不得删减：

- 角色定义和人格设定
- 工作流程和协作机制
- 专业能力清单
- 边界与原则
- 交付物规范
- 典型场景
- Skill 调用触发规则
- 沟通风格

#### 步骤六：去除模板占位符（适用于所有模式）

检查最终 prompt 中是否残留了模板占位符（如 `{变量名}`、`{{变量}}`、`[待补充]`、`TODO`）：

- 将所有未替换的占位符替换为实际内容
- 如果无法确定合适的内容，删除该段或写成通用的指导说明
- 确保 prompt 是一份可直接使用的完整指令

### SubAgent 拆分规则

#### 单 Agent 的拆分判断

分析 prompt，判断是否隐含多个可独立调度的子角色：

**拆分信号**：
- prompt 中出现了明确的不同角色定义（如"你同时是A和B"）
- 存在独立的工作流程阶段，每个阶段有独立的人格和工具集
- prompt 中有"当你需要X时，调用/切换到Y角色"这样的调度逻辑
- 不同专业领域混合在一个 prompt 中（如"数据分析 + 微信搜索"两个完全独立的职能）

**不拆分信号**：
- 角色只是同一专业的不同方面（如"后端架构师的微服务和数据库能力"）
- 没有独立的触发条件或调度逻辑
- prompt 作为一个连贯的整体运作

#### 团队模式直接映射

团队模式的 SubAgent 结构已由源格式定义，直接映射即可：
- lead → mainRole
- members → subagents

#### 模式三的拆分判断

在提示词生成模式下，如果用户描述的专家涉及多个领域或角色：
1. 在需求分析阶段确定是否需要团队模式
2. 如需要，先设计主理人角色，再为每个成员设计独立角色
3. 确保 subagents 之间职责清晰、不重叠

### builtinTools 推断

分析 prompt 内容，如果出现以下语义，添加对应内置工具：

| 语义特征 | 内置工具 | 典型触发词 |
| --- | --- | --- |
| 需要搜索互联网获取实时信息 | `web-search` | 搜索、调研、查一下、行业数据、最新信息、检索、实时查询、资讯速递 |

### 中文优先原则

- 所有面向用户的字段（name、description、tags、samplePrompts、subagentLabels）优先取中文版本
- 中文字段缺失时的回退链：`zh` → `en` → 源 `name` 字段 → 合理推断
- prompt 正文保持原文语言（大多数中文专家团用中文写 prompt，英文专家团保留英文）

### 特殊场景处理

#### 无 agents/ 目录的专家（模式一）

少数专家（如 `embedded-firmware-engineer`）可能没有 `agents/` 目录。此时：

- 从 `plugin.json` 的 `agentName` 推断应有的 agent 名称
- 用 `profession.zh` + `displayDescription.zh` 构建最小化 mainRole.prompt
- 标记 summary 中说明"源缺 agents 目录，已生成最小化 prompt"

#### 无 frontmatter 的 SKILL.md（模式二）

部分 SKILL.md 可能没有 YAML frontmatter：

- 从文件第一个 `#` 标题提取名称
- 从首段提取描述
- 标记 summary 中说明"源无 frontmatter，已从标题推断"

#### Skills 目录嵌套

部分专家的 skills 有嵌套结构。

- `skills` 字段只取**最外层目录名**（如 `ima-skills`）
- 子目录结构由 SKILL.md 内部管理，无需在 expert-group.json 中体现

#### SKILL.md 特殊 frontmatter

部分 SKILL.md 有 `alwaysApply`、`provider`、`enabled`、`updatedAt` 等字段。这些是特定平台特有的，**忽略**，只提取 SKILL.md 的正文摘要。

#### 大型 Rules 文件（模式一）

如 `equity-research` 有 4 个 rules 文件共 300+ 行。处理方式：

- 不全文复制到 prompt 中
- **提取核心规则要点**，精简融入 prompt 对应章节
- 保留规则的约束力和可操作性，去掉冗余格式说明

### Skills 复制

当源目录包含 `skills/` 子目录时：

#### 复制到输出目录

将 `skills/{skill-name}/` 目录完整复制到输出目录的 `skills/{skill-name}/` 下，保持目录结构不变。

#### 更新 mainRole.prompt

在 prompt 末尾添加可用 Skills 列表（见 mainRole.prompt 构建规则中的步骤三）。

#### 在 expert-group.json 中引用

`expert-groups/{id}.json` 的 `skills` 字段写入提取的 skill 名称列表：

```json
"skills": ["{skill-name-1}", "{skill-name-2}"]
```

### 输出格式

转换/生成完成后，将结果文件写入目标目录。输出结构：

```
{output-dir}/{expert-name}/
├── .claude-plugin/
│   └── plugin.json
├── expert-groups/
│   └── {id}.json
├── agents/                # 仅 SubAgent 时有
│   └── {subagent-name}.md
└── skills/                # 从源目录复制（如有）
    └── {skill-name}/
        └── SKILL.md
```

同时在对话中输出摘要：

```
转换/生成完成：
- 工作模式：WorkBuddy转换 / 外部格式导入 / 提示词生成
- 类型：单Agent / 团队
- 分类：{分类1} / {分类2}
- SubAgent：无 / {数量} 个
- builtinTools：无 / web-search
- Skills：{skill-name-1}, {skill-name-2}...
- 特殊情况：（如有）
```

### 质量检查清单

输出前请自检：

#### 通用检查（所有模式）

- [ ] `categories` 已赋值（至少 1 个，跨类不超过 2 个），值为**纯中文分类名**（无编号前缀）
- [ ] `expertGroup` 字段与 `id` 一致，均为英文
- [ ] `name` 字段为中文，不是英文
- [ ] `introduction` 字段已赋值，非空
- [ ] `mainRole.name` 为中文
- [ ] `subagents` 与 `subagentLabels` 键名一致
- [ ] 每个 subagent 在 `agents/` 下有对应的 .md 文件
- [ ] mainRole.prompt 中不含模板占位符（如 `{变量名}`、`[待补充]`）
- [ ] `builtinTools` 值合法（目前仅支持 `web-search`）
- [ ] `toolsPolicy.mode` 为 `"inherit"`
- [ ] 输出目录结构完整（`.claude-plugin/plugin.json` + `expert-groups/{id}.json` 均存在）

#### 模式一专项检查

- [ ] mainRole.prompt 中不含 WorkBuddy 特有内容（avatars、.downloaded_at 等）
- [ ] Skills 目录名提取正确（最外层目录名）
- [ ] 如有 rules，已融入 prompt 且不重复

#### 模式二专项检查

- [ ] 来源格式已正确识别（SKILL.md / 通用 Markdown / 多 Skill 目录）
- [ ] 无 frontmatter 的文件已从标题推断必要字段
- [ ] 多文件导入时已正确判断单 Agent 或团队模式

#### 模式三专项检查

- [ ] 生成的 prompt 角色定义清晰、有完整的人格设定
- [ ] 工作流程具体可执行（包含步骤说明而非泛泛而谈）
- [ ] 包含明确的约束条件和边界
- [ ] samplePrompts 已生成且覆盖典型场景
- [ ] 中文名、id、描述前后一致
