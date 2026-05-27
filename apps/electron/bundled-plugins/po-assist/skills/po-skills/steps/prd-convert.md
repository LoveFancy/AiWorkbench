# 步骤四：prd-convert（NL + [PROD_ORI] 附录结构 → 结构化 PRD）

**触发词：** `prd-convert` 或"需求结构化"或"生成PRD"

**职责：** AI 核心步骤。读取 `[PROD_ORI]` 文件（含末尾三层结构分析和 story_key），生成以 Story 和 Feature 为正文主结构的结构化 PRD。PRD 正文隐藏 `story_key / feature_key / muc_key`，仅在文末保留 Story-Feature-MUC 三层分析附录。

**输入文件确定规则（按优先级）：**
1. 用户明确指定了文件路径 → 直接使用
2. 同目录下已有 `[PROD_ORI]` 文件 → 自动匹配
3. 用户提到了文档名称但未给路径 → 在项目根目录下各子目录中查找匹配的 `[PROD_ORI]*.md` 文件

**输出路径规则（强制）：** `[PROD_FORMAT]` 文件必须与输入的 `[PROD_ORI]` 文件在同一目录下（即 `1.产品设计/`）。

**图片路径规则（强制）：** 生成 `[PROD_FORMAT]` 和 `[STORY_FORMAT]` 时，所有图片引用必须使用相对于当前 Markdown 文件所在目录的相对路径；禁止使用绝对路径、项目根路径、`file://` 路径或 Windows 盘符路径。目标文档同级 `images/` 下图片写成 `./images/<文件名>`；引用参考资料图片时写成 `../references/images/<文件名>`，或复制到目标文档同级 `images/` 后使用 `./images/<文件名>`。不得照抄来源文档中的图片路径，必须按目标文档位置重新计算。

**AI 执行流程：**

### 阶段 A：读取文件

用 `read` 工具依次读取（**不要执行任何 bash 命令**）：
1. 输入的 `[PROD_ORI]` Markdown 文件（包含末尾的"附录：Story 结构分析"节，获取三层结构和 key 映射）
2. `<技能根目录>/references/prd-convert-prompt.md`
3. `<技能根目录>/references/prd-template.md`

> pmconfig 已在启动时加载，无需重复读取。

### 阶段 B：生成合并 PRD（[PROD_FORMAT]）

由于三层结构已在步骤二确认，此步骤不再需要用户确认结构，直接按 `[PROD_ORI]` 末尾附录的结构生成 PRD。

- 每步开始：`⏳ [X/N] 正在生成：<步骤名>...`
- 每步完成：`✅ [X/N] 完成，已写入文件`
- 每完成一步就用 `write` 工具将**当前全部已生成内容**写入输出文件

**正文标题要求**：Story 和需求点标题只保留业务标题，不展示 `story_key / feature_key`。

**附录要求**：`story_key / feature_key / muc_key` 不参与正文展示，仅在文末附录中输出 Story-Feature-MUC 三层分析表，作为后续 `story-create`、回写和追踪的唯一 key 来源。

合并 PRD 模板结构见 `references/prd-template.md`，输出现有内容后**不要停顿**，直接进入阶段 C。

### 阶段 C：拆分独立 Story 文档（[STORY_FORMAT]）

> 基于已生成的 `[PROD_FORMAT]` 和 `[PROD_ORI]` 末尾的三层结构分析表，为每个 Story 拆分出独立文档。

对三层结构分析表中的**每个去重后的 Story**，执行：

**C1. 读取模板**：`<技能根目录>/references/story-template.md`

**C2. 提取并生成**（一次 `write` 一个文件，不要分步写）：

从 `[PROD_FORMAT]` 正文中提取该 Story 对应的章节内容，按 `story-template.md` 结构映射：

| 模板章节 | 内容来源 |
|----------|----------|
| 基本信息 | Story 标题（文件名使用 story_key 占位）+ 关联 PRD 章节引用 + 变更类型/端侧（从分析表） |
| 菜单路径 | PRD 中该 Story 章节的菜单/导航描述 |
| 核心逻辑 | PRD 中该 Story 的功能说明 + 规则说明 |
| 流程 | 按需提取。仅当该 Story 涉及多步骤流转、审批/工作流、跨页面跳转、状态变化或异常分支时保留；否则删除此章节 |
| 交互设计 | 按需提取。仅当 PRD 中存在有实际信息的交互说明、表格或图片时保留；否则删除此章节 |

简单 Story 不要为了套模板强制补流程图、时序图、架构图或占位原型图。只要“核心逻辑 + 验收标准/关联 PRD”能说明清楚，就应保持文档轻量。

**C3. 写入文件**：

```markdown
[STORY_FORMAT][{story_key}]{Story标题}.md
```

文件与 `[PROD_FORMAT]` 在同一目录下。

### 阶段 D：完成

```
🎉 PRD 生成完成！
- 合并 PRD：<[PROD_FORMAT] 路径>（共 N 个 Story）
- 独立 Story 文档：N 个
  · [STORY_FORMAT][S-01]{标题}.md
  · [STORY_FORMAT][S-02]{标题}.md
  · ...

⚡ 进入 req-review（PRD 质量审查）...
```
