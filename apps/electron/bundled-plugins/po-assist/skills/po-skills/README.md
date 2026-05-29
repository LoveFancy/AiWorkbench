# PO Skill 使用说明

如果你是产品经理，建议优先阅读面向日常使用的完整手册：

- [Poskill 用户使用手册](../../docs/po-skill-usage-manual.md)

PO Skill 当前着重解决的是 PRD 文档写好之后的整理、拆分、结构化和交付工作。它不替代产品经理写需求，而是把已经存在的 Wiki、Word、PDF 或原始 PRD 文档，进一步加工成更清晰、更标准、更适合后续研发使用的交付物。

它的核心目标有两个：

- 减少产品经理在日常工作里大量重复、繁杂的整理动作，比如转 Markdown、补图片内容、拆分 Story、整理结构化 PRD、回写 Story 信息等。
- 让产品输出更适合研发阶段继续使用，比如统一转成 Markdown、按固定结构拆解需求、生成更清晰的 Story 边界和结构化 PRD，方便研发、测试和协作团队继续消费。

可以把它理解成一个”PRD 后处理工具集”：重点解决的是文档落地、结构整理和交付标准化，而不是从 0 开始帮你写需求。

> **平台适配**：本 Skill 支持 Claude Code 和 Codex。
> - Claude Code: skill 安装路径为 `.claude/skills/po-skills/`，pmconfig 为 `.claude/pmconfig.md`
> - Codex: 通过 Codex 插件包安装，skill 位于插件的 `skills/po-skills/` 目录
> - 下文示例以 Claude Code 路径为例，Codex 插件环境下请使用插件内对应路径

## 1. 使用前准备

### 环境

- Python 3.10+
- Claude Code + VSCode 插件
- 公司内网权限（访问 Wiki / DPMP）

### 安装依赖

```bash
pip install -r src/po-skills/requirements.txt
```

### 初始化配置文件

先复制环境变量模板：

```bash
cp .claude/skills/po-skills/.env.example .claude/skills/po-skills/.env
```

然后按下面说明补充配置。推荐优先级：

1. 会话环境变量
2. `${CLAUDE_PROJECT_DIR}/.env`
3. 当前工作目录 `.env`
4. `.claude/skills/po-skills/.env` 或插件 skill 目录 `.env` 作为兜底

如果你希望配置跟随某个项目工作区，优先把 Token/Cookie 放在项目目录 `.env`。

## 2. 配置获取与填写说明

### 2.1 `.env` 中有哪些参数

| 参数 | 是否必填 | 用途 | 如何获取 |
|------|----------|------|----------|
| `DPMP_COOKIE` | 按需 | 用于 `story-create`、`quick-story` 调用 DPMP 接口 | 登录 DPMP 后从浏览器开发者工具复制 Cookie |
| `DPMP_PROJECT_ID` | 一般必填 | 指定 Story 创建到哪个 DPMP 项目 | 从 DPMP 项目页面 URL 或项目配置中获取 |
| `DPMP_TASK_TYPE_ID` | 一般必填 | 指定创建任务的类型，默认 `13` 表示标准 Story | 通常直接用默认值，特殊项目再向团队确认 |
| `DPMP_BASE_URL` | 必填 | DPMP API 地址 | 一般使用默认值 |
| `DPMP_REQUEST_DELAY` | 选填 | 每次创建 Story 的请求间隔，防止限流 | 一般使用默认值 `3` |
| `HTSC_WIKI_TOKEN` | 按需 | 用于 `doc-convert --url` 访问 Confluence Wiki | 在 Wiki 的个人设置中创建 Personal Access Token |

建议理解：

- 只做 Wiki 转 Markdown、PRD 结构化时，重点是 `HTSC_WIKI_TOKEN`
- 只做 Story 创建时，重点是 `DPMP_COOKIE` 和 DPMP 相关参数
- 两类能力都要用时，两边都需要配置

### 2.2 如何获取 Wiki Token

`HTSC_WIKI_TOKEN` 需要的是 **Confluence Wiki 的 Personal Access Token**，不是浏览器 Cookie。

操作步骤：

1. 打开 Confluence Wiki 并登录
2. 点击右上角头像
3. 进入“个人设置”
4. 找到“个人访问令牌”或 `Personal Access Tokens`
5. 创建一个新的 Token
6. 复制 Token，写入 `.claude/skills/po-skills/.env`

填写示例：

```dotenv
HTSC_WIKI_TOKEN=your_personal_access_token
```

截图占位：

- [截图占位 1：Wiki 右上角头像入口]
- [截图占位 2：个人设置页面]
- [截图占位 3：Personal Access Tokens 页面]
- [截图占位 4：Token 创建完成后的复制位置]

注意：

- 这里填写的是 Token，不是浏览器请求头里的 Cookie
- Token 通常只在创建时完整展示一次，建议立即保存
- 如果后续提示无权限或认证失败，优先检查 Token 是否过期或复制不完整

### 2.3 如何获取 DPMP Cookie

`DPMP_COOKIE` 用于调用 DPMP 接口创建 Story。这里需要的是浏览器当前登录态对应的完整 Cookie 字符串。

操作步骤：

1. 打开 `http://pt.htsc` 并登录
2. 登录后按 `F12` 打开开发者工具
3. 切换到 `Network` 标签
4. 刷新页面，或点击任意会发起请求的操作
5. 在请求列表里点开任意一个发往 `pt.htsc` 的请求
6. 在 `Headers` 中找到 `Cookie`
7. 复制完整的 Cookie 值，写到 `.claude/skills/po-skills/.env` 一行中

填写示例：

```dotenv
DPMP_COOKIE=menuversion=2; token=...; accessToken=...; refreshToken=...
```

截图占位：

- [截图占位 5：DPMP 登录后的页面]
- [截图占位 6：浏览器开发者工具 Network 标签]
- [截图占位 7：任意请求详情页 Headers 位置]
- [截图占位 8：Cookie 字段示例]

注意：

- 要复制的是 `Cookie:` 后面的完整值，不要只复制其中一个字段
- Cookie 一般会过期，失效后需要重新登录并重新复制
- 建议直接粘贴成一整行，不要手动换行或删字段

### 2.4 `.env` 每个参数的详细解释

#### `DPMP_COOKIE`

- 作用：调用 DPMP 接口时的登录凭证
- 什么时候需要：执行 `story-create`、`quick-story`
- 如何获取：按上面的“获取 DPMP Cookie”步骤操作
- 常见问题：Cookie 失效后会出现认证失败、创建失败等报错

#### `DPMP_PROJECT_ID`

- 作用：指定 Story 要创建到哪个 DPMP 项目
- 什么时候需要：执行 `story-create`、`quick-story`
- 如何获取：
  1. 打开目标 DPMP 项目页面
  2. 查看浏览器地址栏或项目详情
  3. 找到项目 ID
- 默认值说明：示例中的 `2232` 是当前默认项目，若你们团队有自己的项目，需要替换成对应值

截图占位：

- [截图占位 9：DPMP 项目页面中 project id 的位置]

#### `DPMP_TASK_TYPE_ID`

- 作用：指定创建出的任务类型
- 默认值：`13`
- 常见用法：大多数情况下保持默认即可，表示标准 Story
- 什么时候需要改：只有你们团队的 DPMP 配置不是标准 Story 类型时才需要调整
- 如何确认：向熟悉 DPMP 配置的同事确认，或查看已有 Story 的类型配置

#### `DPMP_BASE_URL`

- 作用：DPMP 接口基础地址
- 默认值：`http://pt.htsc/paas/dc/api`
- 是否建议修改：通常不要改，除非后端接口域名发生变化

#### `DPMP_REQUEST_DELAY`

- 作用：批量创建 Story 时的请求间隔秒数
- 默认值：`3`
- 为什么有这个参数：避免请求太快触发限流，或者导致接口不稳定
- 是否建议修改：通常不需要；如果批量创建过程中被限流，可以适当调大

#### `HTSC_WIKI_TOKEN`

- 作用：访问 Confluence Wiki 页面内容
- 什么时候需要：执行 `doc-convert --url`
- 如何获取：按上面的“获取 Wiki Token”步骤操作
- 常见问题：这里不是 Cookie，必须使用 Wiki 个人访问令牌

### 2.5 `.pmconfig.md` 里通常要补什么

`.claude/pmconfig.md` 主要放团队级默认配置，常见包括：

- 默认迭代名
- 默认经办人工号
- 默认经办人姓名
- 默认创建人工号
- Story 名称前缀

这部分不是鉴权信息，可以按团队规范长期维护。

## 3. 主流程

### 五步工作流

```text
步骤一：确认需求编号（REQID）
步骤二：doc-convert      Wiki/JSON → [PROD_ORI] 原始文档 + 图片分析
步骤三：story-analyze    [PROD_ORI] → 三层结构分析 + [STORY_PLAN]
步骤四：prd-convert      [PROD_ORI] → [PROD_FORMAT] PRD + 独立 Story 文档
步骤五：req-review       [PROD_FORMAT] → 质量审查报告
```

### 推荐用法

- 从 Wiki 开始：`doc-convert` → `story-analyze` → `prd-convert` → `req-review`
- 从本地文档开始：`doc-convert` → `story-analyze` → `prd-convert` → `req-review`
- `story-create` 是可选步骤，通常在 `story-analyze` 之后按需执行

## 4. 在 Claude Code 中怎么用

直接输入自然语言或命令即可触发：

| 场景 | 触发词示例 | 作用 |
|------|-----------|------|
| Wiki 转原始文档 | `doc-convert`、`wiki转md` | 拉取 Wiki，生成 `[PROD_ORI]` |
| 本地文档转 Markdown | `doc-convert`、`pdf转md`、`docx转md` | 把 `doc/docx/pdf` 转成 `[PROD_ORI]` |
| 需求结构分析 | `story-analyze`、`需求分析` | 生成三层结构分析，追加到 `[PROD_ORI]` 末尾 |
| 生成建单表 | `story-plan`、`story规划` | 从 PRD 提取 Story 生成 `[STORY_PLAN].csv` |
| 生成 PRD | `prd-convert`、`生成PRD` | 输出 `[PROD_FORMAT]` 和独立 Story 文档 |
| 质量审查 | `req-review`、`需求审查` | 检查 PRD 完整性和待澄清项 |
| 批量创建 Story | `story-create`、`批量创建story` | 调用 DPMP 创建 Story 并回写真实 ID |
| 图片增强 | `enhance-content`、`图片分析` | 补充图片语义信息并更新引用 |
| 快速建单条 Story | `quick-story`、`快速创建Story` | 直接创建单条 DPMP Story |

说明：

- 触发词不要求完全一致，自然语言也可以
- URL 场景下直接给 Wiki 链接即可，不需要先手动整理页面内容
- `req-review` 可跳过，但推荐在最终交付前执行一次

## 5. 两个常见起手式

### 从 Wiki 开始

```text
请把 http://wiki.../pages/viewpage.action?pageId=123456 转成结构化 PRD
```

典型后续流程：

```text
确认 REQID
→ doc-convert
→ story-analyze
→ prd-convert
→ req-review
```

### 从本地 PDF / Word 开始

```text
doc-convert ./docs/需求文档.pdf
```

典型后续流程：

```text
story-analyze
→ prd-convert
→ req-review
```

## 6. 输出目录

所有结果默认放在：

```text
<REQID>/PRODUCT_DESIGN/
```

常见文件如下：

| 文件 | 含义 |
|------|------|
| `[PROD_ORI]xxx.md` | 原始需求文档 |
| `[STORY_PLAN]xxx.csv` | Story 规划表 |
| `[PROD_FORMAT]xxx.md` | 结构化 PRD |
| `[STORY_FORMAT][S-xx]xxx.md` | 独立 Story 文档 |
| `images/` | 文档图片目录 |

## 7. 常见问题

### Cookie 失效

`DPMP_COOKIE` 一般会过期，重新登录 `http://pt.htsc` 后，从浏览器开发者工具里复制最新 Cookie 更新到 `.env` 即可。

### Wiki Token 未配置

`doc-convert --url` 依赖 `HTSC_WIKI_TOKEN`，这里需要的是 **Confluence Wiki 的 Personal Access Token**，不是浏览器里的 Cookie。

### 网络不通，无法创建 Story

先跳过 `story-create`，继续完成 `prd-convert` 和 `req-review`。网络恢复后再补建 Story。

## 8. 配置文件速查

| 文件 | 用途 |
|------|------|
| `.env` | Cookie、Token、DPMP 连接配置 |
| `../../pmconfig.md` | 团队默认业务配置 |
| `SKILL.md` | Skill 路由器（决策树路由 + 按需加载） |
| `common/` | 公共模块（全局规则、输出规范、路径契约等） |
| `steps/` | 步骤指令（各步骤独立加载执行） |
| `references/` | AI 提示词模板（PRD、EARS、审查等） |

> 上表路径均相对于当前 SKILL.md 所在目录解析。

> **v7.0.0 架构说明**：原 ~967 行的巨石 SKILL.md 已拆分为 Router（~170 行）+ common/（5 个公共模块）+ steps/（9 个步骤文件）。Router 通过 4 步决策树按需加载，典型场景上下文减少 40-60%。详见 `docs/2026-05-04-skill-split-decision-tree-design.md`。
