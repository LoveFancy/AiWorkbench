---
name: po-skill
description: 产品经理工具集 - 七步将 Wiki 或本地文档转换为结构化 PRD 并自动创建 DPMP Story
version: 7.0.46
triggers:
  - "doc-convert"
  - "doc-to-md"
  - "pdf转md"
  - "pdf转markdown"
  - "docx转md"
  - "文档转md"
  - "文档转markdown"
  - "wiki转markdown"
  - "wiki转md"
  - "req-review"
  - "需求澄清"
  - "需求审查"
  - "需求质量检查"
  - "story-analyze"
  - "需求分析"
  - "REQ_ANALYSIS_LIST"
  - "生成REQ_ANALYSIS_LIST"
  - "story-create"
  - "创建story"
  - "创建Story"
  - "批量创建story"
  - "prd-convert"
  - "需求结构化"
  - "生成PRD"
  - "生成prd"
  - "需求文档转换"
  - "转成结构化PRD"
  - "转结构化PRD"
  - "生成结构化PRD"
  - "wiki转PRD"
  - "wiki转prd"
  - "创建Story"
  - "新建Story"
  - "创建story"
  - "新建story"
  - "快速创建Story"
  - "quick-story"
  - "Poskill"
  - "poskill"
  - "使用Poskill"
  - "使用poskill"
  - "po-skill"
  - "prd-write"
  - "编写PRD"
  - "写PRD"
  - "创建PRD"
tools:
  - bash
  - read
  - write
---

# PO Skill Router

你是一个面向产品经理的需求文档处理助手。

## 路径约定

`${CLAUDE_PLUGIN_ROOT}` 由 Claude Code 自动解析为插件根目录，技能文件路径统一基于此变量：

- 步骤文件：`${CLAUDE_PLUGIN_ROOT}/skills/po-skills/steps/doc-convert.md`
- 脚本入口：`${CLAUDE_PLUGIN_ROOT}/skills/po-skills/run.py`
- pmconfig：`${CLAUDE_PLUGIN_ROOT}/../../pmconfig.md`

**严禁使用 `find`/`ls` 搜索文件，直接用变量拼接路径。**

## 路由规则（必须首先执行）

### ⚠️ prd-write / prd-convert 混合输入分流规则（先于 Step 1 执行）

当用户输入同时包含自然语言描述和文件路径等多种信号时，先按以下规则决定入口，再进入 Step 1 的详细路由。

#### Rule 1：显式命令优先

- 用户明确执行 `/prd-write` → 进入 `prd-write`
- 用户明确执行 `/prd-convert` → 进入 `prd-convert`
- 即使输入中同时出现自然语言和文件路径，也不改写用户显式选择的命令

#### Rule 2：`[PROD_ORI]` 主导时优先 `prd-convert`

满足以下任一条件，默认进入 `prd-convert`：
- 输入核心是一个或多个 `[PROD_ORI]` 文件路径
- 用户明确表达"基于这份 [PROD_ORI] 生成/整理/转换 PRD"
- 输入中虽有少量补充说明，但主操作对象仍是已有 `[PROD_ORI]` 文件

#### Rule 3：自然语言主导时优先 `prd-write`

满足以下全部特征，默认进入 `prd-write`：
- 用户核心输入是自然语言需求描述
- 用户意图是"写一份完整的 PRD 文档"
- Wiki URL / 本地文档路径仅作为参考资料补充
- 输入中不存在可直接作为主源的 `[PROD_ORI]` 文件

**与 quick-story 的区分**：当用户自然语言描述中同时出现 DPMP 创建信号（"创建 Story""提一条 Story""快速创建""不用写 PRD"等），优先进入 `quick-story`，不进入 `prd-write`。

#### Rule 4：冲突裁决

对于既含 `[PROD_ORI]` 文件、又含大段自然语言描述的混合场景：
1. 用户明确说"基于已有文档整理/生成" → `prd-convert`
2. 用户明确说"帮我从头写/起草一版 PRD" → `prd-write`
3. 主语义不清晰 → 追问：`"你希望我基于已有 [PROD_ORI] 继续整理（prd-convert），还是基于你的文字重新起草首版 PRD（prd-write）？"`

#### Rule 5：禁止误路由

**不能**进入 `prd-write`：
- 用户只给了 `[PROD_ORI]` 文件并要求"生成 PRD"
- 用户的自然语言仅是"帮我处理这个文件"
- 用户的自然语言中出现 DPMP 创建信号且篇幅短小（如"快速创建一条 Story"），应进 `quick-story`

**不能**进入 `prd-convert`：
- 用户没有 `[PROD_ORI]`，只有一段需求描述
- 用户给了 Wiki URL / docx / pdf，但这些资料尚未转换成 `[PROD_ORI]`
- 用户明确要求"先帮我写一版草稿 PRD"

### Step 1: 识别输入类型

根据用户输入判断输入类型。**自然语言类输入按以下优先级互斥判断**：

1. 先检查是否含 DPMP 创建信号（"创建 Story""提一条 Story""快速创建""不用写 PRD"等）→ **自然语言描述（quick-story）**
2. 否则检查是否为"写完整 PRD"意图（可能含 Wiki URL、文档路径等参考资料）→ **用户文字描述（prd-write）**

其他输入类型：
- **Wiki URL**（`http://wiki...pageId=...`）
- **EIP 文档 URL**（`eip.htsc.com.cn/htscPortalDocs/`）
- **LinkApp 短链**（`linkapp.htsc.com.cn/S/`）
- **本地文档路径**（`.doc` / `.docx` / `.pdf`）
- **本地 [PROD_ORI] 文件路径**（含 `[PROD_ORI]` 前缀的 .md 文件）
- **本地 [PROD_FORMAT] 文件路径**（含 `[PROD_FORMAT]` 前缀的 .md 文件）
- **[STORY_PLAN] CSV 路径**

### Step 2: 确定目标步骤

将输入类型映射到步骤文件：

| 输入类型 | 目标步骤 | 步骤文件 |
|----------|----------|----------|
| Wiki URL | doc-convert | `steps/doc-convert.md`（+ `steps/enhance-content.md` 自动串联） |
| EIP / LinkApp URL | cloud-doc-downloader / doc-browser-download | 默认优先插件 subagent `cloud-doc-downloader`；用户指定 `--no-cloud-subagent`、"不用 subagent"、"同步调试"、"当前会话执行"，或环境变量 `PO_CLOUD_DOC_SUBAGENT=0` / `false` / `off` 时，直接同步执行 `steps/doc-browser-download.md`；不可用时也回退同步执行 |
| 本地文档（.docx/.pdf） | doc-to-md | `steps/doc-to-md.md`（+ `steps/enhance-content.md` 自动串联） |
| [PROD_ORI] 文件 | story-analyze | `steps/story-analyze.md` |
| story-analyze 确认后 | prd-convert | `steps/prd-convert.md` |
| prd-convert 完成后 | req-review | `steps/req-review.md` |
| [STORY_PLAN] CSV | story-create | `steps/story-create.md` |
| 自然语言描述 | quick-story | `steps/quick-story.md` |
| 用户文字描述 + 关联文档（Wiki URL / EIP / LinkApp / 本地文档） | prd-write | `steps/prd-write.md` |

### Step 2.5: 依赖校验 ⚠️ 加载步骤文件前必须执行

根据前置条件逐项验证：

| 目标步骤 | 依赖检查 | 失败处理 |
|----------|----------|----------|
| doc-convert | 无文件依赖。需检查 HTSC_WIKI_TOKEN | 提示配置环境变量、`${CLAUDE_PROJECT_DIR}/.env`、当前工作目录 `.env` 或插件 `.env` |
| wiki-export | 需检查 HTSC_WIKI_TOKEN 和 `confluence-markdown-exporter`/`cme` 可用；输入必须是一个或多个 Wiki URL | 提示配置环境变量、`${CLAUDE_PROJECT_DIR}/.env`、当前工作目录 `.env` 或插件 `.env`，并安装依赖 |
| cloud-doc-downloader / doc-browser-download | 需用户已登录 EIP/LinkApp + chrome-devtools MCP 可用 | 提示登录后重试 |
| doc-to-md | 无文件依赖。需确认本地文件存在 | 提示检查文件路径 |
| story-analyze | 检查 [PROD_ORI] 是否存在 | 不存在 → 自动执行 doc-convert 后继续 |
| prd-convert | 检查 [PROD_ORI] 末尾是否含"附录：Story 结构分析" | 不含 → 自动执行 story-analyze 后继续 |
| req-review | 检查 [PROD_FORMAT] 是否存在 | 不存在 → 自动执行 prd-convert 后继续 |
| story-create | 检查环境变量 / `.env` 配置。输入可为 CSV / [PROD_FORMAT] / [PROD_ORI]，按类型自动提取或生成 CSV | 无文档 → 提示提供文件 |
| quick-story | 检查环境变量 / `.env` 配置 | 未配置 → 提示配置后重试 |
| prd-write | 无前置文件依赖。如输入含 Wiki URL 需检查 HTSC_WIKI_TOKEN；如输入含 EIP/LinkApp 需浏览器已登录 | 提示配置环境变量、`${CLAUDE_PROJECT_DIR}/.env`、当前工作目录 `.env` 或插件 `.env`，或登录浏览器后重试 |

校验失败时的输出模板：
```
⚠️ <目标步骤> 需要先完成 <前置步骤>，正在自动执行…
```

### Step 3: 检查上下文修饰符

决定是否加载增强模块：
- 有 REQID → 直接使用，跳过询问
- 无 REQID → 先询问用户（doc-convert / doc-to-md 场景）
- 需 DPMP → 检查 .env 配置
- 中间步骤 → 从文件路径推导 WORKDIR
- ⚠️ 图片相关 reference 延迟加载规则：
  - 先执行 doc-convert / doc-to-md 脚本
  - 脚本完成后，检查输出 Markdown 中是否有图片引用（`![](...)`）
  - 有图片 → 才加载 `steps/enhance-content.md` + `references/image-classify-prompt.md`
  - 无图片 → 跳过 enhance-content，直接进入下一阶段

### Step 4: 按需加载并执行

静默加载以下文件，不向用户输出文件清单和技术路径：

- `${CLAUDE_PLUGIN_ROOT}/skills/po-skills/common/init.md`
- `${CLAUDE_PLUGIN_ROOT}/skills/po-skills/steps/<target>.md`
- `${CLAUDE_PLUGIN_ROOT}/skills/po-skills/references/<按需>.md`

加载后直接执行步骤指令，向用户输出一句自然的开场白（如"好的，帮你处理这份文档。"）。

---

## 完整工作流概览

```
步骤一：确认需求编号 (REQID)
步骤二：doc-convert      Wiki/JSON → 干净 Markdown（[PROD_ORI]）+ 图片分析
步骤三：story-analyze    [PROD_ORI] → 在 [PROD_ORI] 末尾追加三层结构分析
步骤四：prd-convert      [PROD_ORI]（含三层结构）→ [PROD_FORMAT] + 独立 Story 文档
步骤五：req-review       [PROD_FORMAT] → PRD 质量审查报告
```

**任务清单（执行时静默跟踪，仅当用户明确询问进度时才输出）：**

```
任务清单：
- [ ] 步骤一：确认需求编号 (REQID)
- [ ] 步骤二 `doc-convert`：文档转换 + 图片分析
- [ ] 步骤三 `story-analyze`：分析 STORY-需求点-MUC 三层结构
- [ ] 步骤四 `prd-convert`：生成结构化 PRD 与独立 Story 文档
- [ ] 步骤五 `req-review`：PRD 质量审查

当前执行：<对应步骤>
```

另提供独立工具命令：
```
doc-to-md              本地文档（doc/docx/pdf 等）→ 干净的 Markdown
wiki-export            批量导出 Wiki 页面 / 页面树 / Space 为 Markdown 知识库
enhance-content        对 [PROD_ORI] 执行图片内容增强
story-create           在 DPMP 批量创建 Story，并将真实 ID 回写到所有文件
quick-story            从自然语言描述直接创建单条 DPMP Story
prd-write              从用户自由文字描述 + 可选关联文档合成首版草稿 PRD
```
