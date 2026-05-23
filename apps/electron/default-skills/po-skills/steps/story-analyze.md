# 步骤三：story-analyze（NL → [PROD_ORI] 末尾追加 Story 分析 + Story 规划）

**触发词：** `story-analyze` 或"需求分析"或"REQ_ANALYSIS_LIST"或"story规划"或"生成story规划"

**职责：** AI 核心步骤。读取 `[PROD_ORI]` 文件，按照 `story-feature-muc-rules.md` 中定义的 Story/Feature/MUC 划分规则，识别三层结构，分配 key 编号，并将分析结果**追加到 [PROD_ORI] 文档末尾**。

**⚠️ 重要**：此步骤必须严格按照下方流程执行，先读取所有参考文件，再按阶段 B 的表格格式输出结构分析。不要自行发挥输出格式。

**输入文件确定规则（按优先级）：**
1. 用户明确指定了文件路径 → 直接使用
2. 上一步处理的 `[PROD_ORI]` 文件 → 使用该文件
3. 用户提到了文档名称但未给路径 → 在项目根目录下各子目录中查找匹配的 `[PROD_ORI]*.md` 文件

**输出路径规则（强制）：** 三层结构分析直接追加到 `[PROD_ORI]` 文件末尾。

**AI 执行流程：**

### 阶段 A：读取文件

用 `read` 工具依次读取（**不要执行任何 bash 命令，必须全部读取后再进入阶段 B**）：
1. 输入的 `[PROD_ORI]` Markdown 文件
2. `${CLAUDE_PLUGIN_ROOT}/skills/po-skills/references/story-feature-muc-rules.md`（**必读**，包含 Story/Feature/MUC 的划分规则和 MUC 五维度识别方法）

> pmconfig 已在启动时加载，无需重复读取。

**如果未读取 `references/story-feature-muc-rules.md`，将无法正确划分三层结构，必须先读取再继续。**

### 阶段 B：输出结构分析表，等待一次确认

读取完成后，**立即输出 Story-Feature-MUC 三层结构分析表，然后停下来等用户确认，不要自动继续**。

**输出边界（强制）：**
- **唯一允许的确认输出结构**是本节下方代码块中的 `📋 结构分析` 表格、汇总行和确认提示。
- 确认展示和写入 `[PROD_ORI]` 必须使用同一套 Story-Feature-MUC 表结构。
- 完整表结构只在 `references/story-feature-muc-rules.md` 中定义；本步骤不得重复定义或改写表头。
- 附录标题必须使用规则文件中的 `Story-Feature-MUC 结构分析`。
- 禁止输出“Story 分析报告”标题。
- 禁止输出“详细分析说明”标题或任何逐条解释性段落。
- 禁止额外输出 `Story（用户故事）`、`Feature（功能特性）`、`MUC` 分段说明。
- 禁止使用 `L1 Story | L2 需求点 | L3 MUC` 作为阶段 B 的确认表头。
- 禁止使用 `需求点类型` 或 `MUC 格式` 列。

**输出前自校验（强制）：** 在输出结构分析表之前，AI 必须先执行以下校验，确保数据一致性：
1. **计数校验**：逐行扫描表格，分别统计唯一的 Story 数、唯一的需求点数、MUC 总行数，确保与汇总行的 `N 个 Story，M 个需求点，K 个 MUC` 一致
2. **层级完整性**：每个 Story 至少有 1 个需求点，每个需求点至少有 1 个 MUC
3. **格式一致性**：每行必须严格符合 `references/story-feature-muc-rules.md` 中的输出表结构；`Story / Feature / MUC / 类型识别 / 变更类型 / 端侧 / 影响说明` 列均不能为空，且 Story、Feature、MUC 列必须以对应编号开头
4. 如果校验发现不一致，先修正再输出，不要输出有错误的表格

**三层结构分析表**
> ⚠️ **强制约束**：必须严格、原封不动地使用下方的 Markdown 表格形式进行输出！**绝对禁止**擅自改用嵌套的无序/有序列表（如 `Story > Feature > MUC`）进行简化展示。如果在这一步私自改换格式，将导致严重错误！

```
📋 结构分析：

输入文件：<路径>
输出：追加到 [PROD_ORI] 文档末尾

<严格使用 references/story-feature-muc-rules.md 中“输出表结构”的完整表格，不要在本步骤自定义表头>

共 N 个 Story，M 个需求点，K 个 MUC。

结构有误请说明；确认无误后，输入"继续"或"ok"生成文件。
```

### 阶段 C：用户确认后追加到 [PROD_ORI] 末尾

用户确认结构后，**立即执行以下操作，无需再次等待**：

**C1. 生成并冻结编号**：
- `story_key`：格式 `S-01`、`S-02`...（全局递增，此即 Story 的唯一标识，贯穿 PRD 和 Story 文档）
- `feature_key`：格式 `F-01`、`F-02`...（全局递增）
- `muc_key`：格式 `MUC-01`、`MUC-02`...（全局递增）
- 同一 Story/需求点/MUC 多行出现时复用原编号，不重新分配

**C2. 将三层结构分析追加到 [PROD_ORI] 文档末尾**：

用 `write` 工具在 `[PROD_ORI]` 文件末尾追加以下内容：

```markdown

---

> story_key 为 Story 的唯一标识（S-01、S-02...），在 PRD 和 Story 文档中统一使用。如后续执行 story-create，真实 DPMP ID 将替换此值。

<严格追加 references/story-feature-muc-rules.md 中“输出表结构”的完整表格，不要在本步骤自定义表头>
```

### 阶段 D：输出结果

```
✅ story-analyze 完成！
- 三层结构已追加到 [PROD_ORI] 末尾：<路径>

共 N 个 Story，M 个需求点，K 个 MUC

⚡ 自动进入 prd-convert（生成结构化 PRD）...
```
