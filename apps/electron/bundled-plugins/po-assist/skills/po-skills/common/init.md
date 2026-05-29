# 公共初始化模块

> 所有步骤执行前一次性加载。

---

## 路径变量

使用当前已加载 skill 的所在目录作为路径基准。技能文件路径统一写成相对路径，例如 `run.py`、`steps/doc-convert.md`。

路径基准由当前已加载的 SKILL.md 所在目录确定。不要读取项目 `.env` 中的技能根目录缓存，也不要把路径基准写入项目 `.env`。

**严禁使用 `find`/`ls` 搜索文件，直接把文档中的相对路径解析为相对于当前 SKILL.md 的路径。**

---

## 全局禁止规则

> 🚫 **最高优先级**：

1. **禁止 WebFetch**：收到 Wiki URL 时，**绝对不允许**使用 WebFetch 或任何 HTTP 请求工具访问。必须调用脚本转换。
2. **脚本固定位置**：`run.py` 固定位于当前 SKILL.md 同目录下。业务命令直接调用 `run.py`，执行前按相对于当前 SKILL.md 的路径解析，不要在外层逐项检查 Python 依赖、`requirements.txt` 或具体三方命令。
3. **首次启动自检**：首次启动负责检查必需配置并初始化 `.env`。只有技能目录下不存在 `.poskill-env.json` 时，才先执行一次环境自检：
   ```bash
   python bootstrap.py
   ```
   若当前还没有工作空间，或用户明确执行初始化，则可用 `bootstrap.py` 包住初始化命令：
   ```bash
   python bootstrap.py -- python run.py init-workspace
   ```
   如果执行 `bootstrap.py` 时提示缺少 Python 或版本不满足要求，引导用户参考 `http://eip.htsc.com.cn/huatech/practices/124061#heading-0` 配置 Python 后重试。
   只有这个判断允许查看 `.poskill-env.json` 是否存在；不要检查 `requirements.txt`，不要手工探测 `md2conf`、`markitdown` 等依赖命令，是否安装依赖、是否跳过安装都由 `bootstrap.py` 内部判断。
   首次自检会初始化 `.env` 模板并提示用户补充必需配置。具体命令若有必需配置，按该命令步骤文件的配置契约先检查项目根目录 `.env`；缺配置时只创建/补齐 `.env` 键并提示用户填写真实值，不使用临时 `export` 绕过。
4. **Windows 路径**：使用正斜杠格式（`/d/GitWorkspace/...`）。
5. **不要猜输出文件名**：不要自行改写协议或猜测输出文件名。

## 缺少 Wiki Token 的处理规则

当脚本返回 `HTSC_WIKI_TOKEN 未设置` 或 `WIKI_TOKEN_REQUIRED=true` 时：

1. 主动询问用户提供 Wiki Personal Access Token，并说明这里需要的是 Wiki Token，不是浏览器 Cookie。
2. 停止当前后续流程，不要继续 brainstorming、PRD 起草或输出待澄清问题。
3. 用户提供 Token 后，自动创建或更新 当前技能目录下的 `.env`，写入或替换 `HTSC_WIKI_TOKEN=<用户提供的Token>`。
4. 如果 `.env` 已存在，保留其他配置项，只更新 `HTSC_WIKI_TOKEN`；如果不存在，则创建新文件。
5. 不得要求用户自行编辑 `.env`，除非写入文件失败。
6. 不要在对话中回显 Token 明文。
7. 写入完成后，重新执行刚才失败的命令。

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

读取 `../../pmconfig.md`。若文件不存在，静默跳过。

---

## 路径契约

### 路径变量

| 变量 | 值 | 来源 |
|------|-----|------|
| `{REQID}` | 需求编号，如 `TAILOR-124` | `newreq` 创建或用户确认 |
| `{REQ_ROOT}` | `newreq/{REQID}` | 正式需求根目录 |
| `{WORKDIR}` | `newreq/{REQID}/PRODUCT_DESIGN` | 唯一主工作目录 |
| `{REFERENCES_DIR}` | `newreq/{REQID}/REFERENCES` | 参考资料目录 |
| `{RAW_DIR}` | `raw` | 未归属正式需求的临时转换结果 |
| `{WIKI_DIR}` | `wiki` | Wiki 导出和知识沉淀 |
| `{TITLE}` | 文档标题 | 从 doc-convert stdout 提取 |

若运行环境提供 `OUTPUT_PATH_PREFIX`，上述目录会以该环境变量作为工作空间根目录，并由 `run.py` 在 stdout 中输出完整路径，例如 `{WORKDIR}` 输出为 `/app/docs/test_session_id/OUTPUT/newreq/{REQID}/PRODUCT_DESIGN`。若未提供该环境变量，保持当前相对路径输出。路径拼接必须由脚本完成，不由 AI 手工拼接。

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
    ├── PRODUCT_DESIGN/                          ← {WORKDIR}
    │   ├── images/
    │   ├── [PROD_ORI]{TITLE}.md
    │   ├── [PROD_FORMAT]{TITLE}.md
    │   ├── [STORY_FORMAT][S-xx]{Story标题}.md
    │   └── [STORY_PLAN]{TITLE}.csv
    └── REFERENCES/                          ← {REFERENCES_DIR}
        └── {文档名}/
            ├── images/
            └── [PROD_ORI]{文档名}.md
```

### 固定边界

1. `REQID` 是唯一需求根目录命名来源，正式需求空间统一位于 `newreq/{REQID}/`。
2. `PRODUCT_DESIGN/` 是唯一主工作目录；PRD、主需求文档、主文档图片和 brainstorming 纪要都归属这里。
3. 参考资料及其衍生内容统一放入 `newreq/{REQID}/REFERENCES/`。参考资料转换结果按文档分目录：`REFERENCES/<文档名>/`，Markdown 位于 `REFERENCES/<文档名>/[PROD_ORI]<文档名>.md`，图片位于 `REFERENCES/<文档名>/images/`。`REFERENCES/` 与 `PRODUCT_DESIGN/` 同级，不嵌套在主工作目录下。
4. `raw/`、`wiki/`、`newreq/` 和 `newreq/req.index` 只由 `init-workspace` 创建；临时文档转换结果放入 `raw/<文档名>/`，图片放入 `raw/<文档名>/images/`。
5. 只有 `newreq` 能创建正式需求目录；续加工入口必须通过 `resolve-workspace` 复用已有目录。
6. `newreq/req.index` 使用 Markdown 自然语言条目，不使用 JSON 或 CSV；`req.index.status` 只表示本地工作空间状态，当前限定为 `initialized`、`archived`、`invalid`。
7. `5.STORYS/` 是 legacy 目录，不属于主线目录模型。
8. 在 `prd-write` 中，用户随自然语言需求提供的 Wiki、云文档、本地文档都是关联资料，默认进入 `{REFERENCES_DIR}`；只有用户明确把某个 `[PROD_ORI]` 作为主源继续处理时，才进入主工作目录链路。

### AI 执行规则

1. 从 stdout 读取 `OUTPUT_FILE=<路径>`，记为 `[PROD_ORI]` 路径
2. 从中间步骤开始时，先执行 `resolve-workspace`，从用户提供的文件路径推导 `{WORKDIR}` 和 `{REFERENCES_DIR}`
3. `doc-convert` 必须显式传入 `--reqid <REQID>`、`--raw` 或 `--output-dir`；不得再默认创建 `REQ-<pageId>/PRODUCT_DESIGN`。临时转换时使用 `--raw`，脚本会自动落到 `raw/<文档标题或token>/`
4. `doc-to-md` 必须显式传入 `--reqid <REQID>` 或 `--output-dir`；临时转换本地文档时传 `--output-dir raw`，脚本会自动落到 `raw/<文档名>/`
5. 无明确需求编号时，直接使用 `newreq --mock` 创建正式需求空间；不要为了确认需求编号而阻断 Wiki、云文档或本地文档的下载与转换。
6. 关联资料默认进入 `{REFERENCES_DIR}`。传入 `{REFERENCES_DIR}` 时，转换脚本会自动创建 `REFERENCES/<文档名>/` 子目录，不要手工把多个文档和图片混放在 `REFERENCES/` 根目录。不要为了消费参考资料而先输出到 `{DESIGN_DIR}`，也不要把已转换的 Wiki Markdown 再交给 `doc-to-md` 搬迁。
