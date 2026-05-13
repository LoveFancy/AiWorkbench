# 独立工具：story-create（CSV 生成 + DPMP 批量创建 Story）

**触发词：** `story-create` 或"创建story"或"创建Story"或"批量创建story"

**说明：** 此步骤**不在主流程中**，可在任意时刻单独触发。负责从 Story 清单生成 CSV，然后调用 DPMP API 批量创建 Story，并回写真实 ID。

---

### 阶段 A：确定输入来源

按优先级判断（文件前缀仅作参考，以内容特征为准）：

1. 用户指定了 CSV 文件 → **跳到阶段 E**（已有 CSV）
2. 当前目录下存在 `[STORY_PLAN]*.csv` → **跳到阶段 E**
3. 文件含 `[PROD_FORMAT]` 前缀 **或** 内容含 `<!-- STORY_KEY:` 锚点 → 进入阶段 B（结构化 PRD）
4. 其余 `.md` 文件（有无 `[PROD_ORI]` 前缀均算）→ 进入阶段 C（确认分析 + 生成 CSV）
5. 都不存在 → 提示用户提供文档或 CSV 文件

---

### 阶段 B：从 [PROD_FORMAT] 提取 Story 清单

`[PROD_FORMAT]` 是已结构化的 PRD，Story 以 `<!-- STORY_KEY: S-xx -->` 锚点标记在章节标题中。

**B1. 扫描文档**：搜索 `<!-- STORY_KEY: S-` 锚点，提取每个 Story：

```markdown
### 3.1 S-01：客户全景
<!-- STORY_KEY: S-01 -->
```

从中提取 `story_key`（S-01）和 Story 标题（"客户全景"）。

**B2. 概括描述**：阅读该 Story 章节下的功能说明，用一句话概括 `story描述`。

**B3. 生成 CSV**：按阶段 D 的格式写入 `[STORY_PLAN]{标题}.csv`（取 `[PROD_FORMAT]` 文件名去前缀后的标题），进入阶段 E。

---

### 阶段 C：确保 [PROD_ORI] 含三层结构分析

检查 `[PROD_ORI]` 末尾是否包含"附录：Story 结构分析"：

- **已包含** → 进入阶段 D
- **不包含** → 自动执行 story-analyze（加载 `${CLAUDE_PLUGIN_ROOT}/skills/po-skills/steps/story-analyze.md`），完成后进入阶段 D

---

### 阶段 D：从分析表生成 [STORY_PLAN].csv

从三层结构分析表中提取每个去重后的 Story，生成 CSV。

**CSV 格式：**

```csv
story_key,story名称,story描述,所属完整迭代名,所属需求编号,所属需求名称,经办人工号,经办人姓名,创建人工号,计划开发完成日期,计划测试完成日期,计划完成日期,story_id
S-01,<Story 标题>,<AI 从需求点内容概括的一句话描述>,← 请填写,← 请填写,← 请填写,← 请填写,← 请填写,← 请填写,← 请填写,← 请填写,← 请填写,
S-02,<Story 标题>,<描述>,← 请填写,← 请填写,← 请填写,← 请填写,← 请填写,← 请填写,← 请填写,← 请填写,← 请填写,
```

**填写规则：**
- `story_key`、`story名称`、`story描述`：AI 提取和概括，直接填入
- 其余字段：填入 `← 请填写`（`story_id` 留空，由 DPMP 创建后回写）

用 `write` 工具写入为 `[STORY_PLAN]{标题}.csv`，与源文件同目录。

输出提示：
```
📋 Story 规划表已生成：<CSV 路径>（共 N 个 Story）
表中迭代、经办人、日期等字段需人工补充。是否继续创建 DPMP Story？
```

---

### 阶段 E：检查 .env 配置

检查 `.env` 中 `DPMP_COOKIE` 是否配置。未配置 → 提示用户配置后重试。

---

### 阶段 F：执行 DPMP 创建

```bash
python3 ${CLAUDE_PLUGIN_ROOT}/skills/po-skills/run.py story-create \
    --story-plan "<STORY_PLAN文件路径>"
```

**⚠️ 禁止通过 CLI 参数传递 Cookie**，所有 DPMP 配置由 `.env` 自动加载。

**幂等性说明**：已是真实 DPMP ID 的行自动跳过，中断后可安全重试。

---

### 阶段 G：全文件回写真实 ID

脚本自动从 CSV 提取 `story_key → 真实DPMP_ID` 映射，回写所有文件：

1. **[PROD_ORI].md**：替换末尾附录中 story_key 列的值
2. **[STORY_PLAN].csv**：写入 story_id 列
3. **[PROD_FORMAT].md**：替换 `<!-- STORY_KEY: S-01 -->` 锚点和章节标题
4. **[STORY_FORMAT] 文件重命名**：`[STORY_FORMAT][S-01]*.md` → `[STORY_FORMAT][真实ID]*.md`

---

### 阶段 H：完成汇总

```
🎉 Story 创建完成！
- 成功创建：N 个
- 跳过（已存在）：M 个
- 失败：K 个

回写完成：
- [PROD_ORI]：✅
- [STORY_PLAN]：✅
- [PROD_FORMAT]：✅
- [STORY_FORMAT] 文件重命名：N 个 ✅

如有失败，检查错误信息后重新执行（已成功的自动跳过）。
```
