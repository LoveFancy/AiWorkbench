# 公共初始化模块

> 所有步骤执行前一次性加载。

---

## 路径变量

`${CLAUDE_PLUGIN_ROOT}` 由 Claude Code 自动解析为插件根目录，无需手动推导。技能文件路径统一为 `${CLAUDE_PLUGIN_ROOT}/skills/po-skills/<子路径>`。

**严禁使用 `find`/`ls` 搜索文件，直接用变量拼接路径。**

---

## 全局禁止规则

> 🚫 **最高优先级**：

1. **禁止 WebFetch**：收到 Wiki URL 时，**绝对不允许**使用 WebFetch 或任何 HTTP 请求工具访问。必须调用脚本转换。
2. **脚本固定位置**：`run.py` 固定位于技能根目录下，从项目根目录直接执行。首次使用或工作空间缺失时先初始化：
   ```bash
   python ${CLAUDE_PLUGIN_ROOT}/skills/po-skills/run.py init-workspace
   ```
3. **Windows 路径**：使用正斜杠格式（`/d/GitWorkspace/...`）。
4. **不要猜输出文件名**：不要自行改写协议或猜测输出文件名。

---

## 全局交互与输出规范

> ⚠️ 你的用户是**产品经理**，不是工程师。所有输出必须遵循以下原则。

### 核心原则

**只输出用户真正关心的结果，用产品经理的语言沟通。**

### 必须遵守

1. **不暴露内部流程**：严禁在对话中提及阶段编号、步骤编号、内部文件名、脚本名等技术细节。
   - ❌ "进入阶段 C""C.3 内部推理完成""开始合成"
   - ✅ "开始写 PRD""正在分析文档内容""处理完成"

2. **不输出中间推理**：AI 的内部分析过程一律静默，不向用户展示。
   - ❌ "用户意图：用 AI 改造尽调流程""信息缺口：业务类型…"
   - ✅ 推理结果直接融入最终产出

3. **不逐项汇报进度**：多个操作合并为一句自然语言。
   - ❌ "目录已创建。模板已加载。现在进入正文生成。"
   - ✅ "正在为你撰写 PRD 文档…"

4. **用产品语言沟通**：说"PRD 文档"而非"`[PROD_FORMAT]`"，说"需求编号"而非"REQID"。

### 正反例对照

| 场景 | ❌ 不要这样说 | ✅ 应该这样说 |
|------|-------------|-------------|
| 开始写 PRD | "无关联文档，跳过阶段 B。现在创建目录并加载模板，开始合成。" | "收到，帮你写这份 PRD。" |
| 转换完成 | "步骤二 doc-convert 执行完成，OUTPUT_FILE=…" | "文档转换完成，已生成需求文档。" |
| 等待确认 | "阶段 C.4 逐节生成完成，请确认是否进入下一步。" | "PRD 初稿已完成，需要我帮你做质量审查吗？" |

---

## 启动初始化

### Step 1：加载 pmconfig

读取技能根目录的 `../../pmconfig.md`。若文件不存在，静默跳过。

---

## 路径契约

### 路径变量

| 变量 | 值 | 来源 |
|------|-----|------|
| `{REQID}` | 需求编号，如 `TAILOR-124` | `newreq` 创建或用户确认 |
| `{REQ_ROOT}` | `newreq/{REQID}` | 正式需求根目录 |
| `{WORKDIR}` | `newreq/{REQID}/1.产品设计` | 唯一主工作目录 |
| `{REFERENCES_DIR}` | `newreq/{REQID}/references` | 参考资料目录 |
| `{RAW_DIR}` | `raw` | 未归属正式需求的临时转换结果 |
| `{WIKI_DIR}` | `wiki` | Wiki 导出和知识沉淀 |
| `{TITLE}` | 文档标题 | 从 doc-convert stdout 提取 |

### 标准目录结构

```
raw/
└── {文档名}/
    ├── images/
    └── [PROD_ORI]{文档名}.md
wiki/
newreq/
├── req.index
└── {REQID}/
    ├── 1.产品设计/                          ← {WORKDIR}
    │   ├── images/
    │   ├── [PROD_ORI]{TITLE}.md
    │   ├── [PROD_FORMAT]{TITLE}.md
    │   ├── [STORY_FORMAT][S-xx]{Story标题}.md
    │   └── [STORY_PLAN]{TITLE}.csv
    └── references/                          ← {REFERENCES_DIR}
        └── images/
```

### 固定边界

1. `REQID` 是唯一需求根目录命名来源，正式需求空间统一位于 `newreq/{REQID}/`。
2. `1.产品设计/` 是唯一主工作目录；PRD、主需求文档、主文档图片和 brainstorming 纪要都归属这里。
3. 参考资料及其衍生内容统一放入 `newreq/{REQID}/references/`，参考资料图片放入 `references/images/`。`references/` 与 `1.产品设计/` 同级，不嵌套在主工作目录下。
4. `raw/`、`wiki/`、`newreq/` 和 `newreq/req.index` 只由 `init-workspace` 创建；临时文档转换结果放入 `raw/<文档名>/`，图片放入 `raw/<文档名>/images/`。
5. 只有 `newreq` 能创建正式需求目录；续加工入口必须通过 `resolve-workspace` 复用已有目录。
6. `newreq/req.index` 使用 Markdown 自然语言条目，不使用 JSON 或 CSV；`req.index.status` 只表示本地工作空间状态，当前限定为 `initialized`、`archived`、`invalid`。
7. `5.STORYS/` 是 legacy 目录，不属于主线目录模型。
8. 在 `prd-write` 中，用户随自然语言需求提供的 Wiki、云文档、本地文档都是关联资料，默认进入 `{REFERENCES_DIR}`；只有用户明确把某个 `[PROD_ORI]` 作为主源继续处理时，才进入主工作目录链路。

### AI 执行规则

1. 从 stdout 读取 `OUTPUT_FILE=<路径>`，记为 `[PROD_ORI]` 路径
2. 从中间步骤开始时，先执行 `resolve-workspace`，从用户提供的文件路径推导 `{WORKDIR}` 和 `{REFERENCES_DIR}`
3. `doc-convert` 必须显式传入 `--reqid <REQID>`、`--raw` 或 `--output-dir`；不得再默认创建 `REQ-<pageId>/1.产品设计`
4. `doc-to-md` 必须显式传入 `--reqid <REQID>` 或 `--output-dir`；临时转换本地文档时传 `--output-dir raw`，脚本会自动落到 `raw/<文档名>/`
5. 无明确需求编号时，直接使用 `newreq --mock` 创建正式需求空间；不要为了确认需求编号而阻断 Wiki、云文档或本地文档的下载与转换。
6. 关联资料默认进入 `{REFERENCES_DIR}`。不要为了消费参考资料而先输出到 `{DESIGN_DIR}`，也不要把已转换的 Wiki Markdown 再交给 `doc-to-md` 搬迁。
