# 步骤二：doc-convert（文档 → 干净 Markdown）

**触发词：** `doc-convert` 或"wiki转markdown"或"wiki转md"

**职责：** 接收多种输入类型，自动选择转换策略：
- Wiki URL → API 直接拉取转换
- EIP / LinkApp URL → 浏览器下载后转换（加载 `steps/doc-browser-download.md`）
- 本地文档（.docx/.pdf/.doc）→ 直接 doc-to-md 转换

---

## 输入分流（优先执行）

收到 URL 或文件路径后先判断类型，选择对应策略：

| URL/文件特征 | 策略 | 步骤文件 |
|-------------|------|----------|
| `http://wiki...` 含 `pageId=` | Wiki API 转换 | 本文档后续步骤 |
| `eip.htsc.com.cn/htscPortalDocs/` | 浏览器下载 | `steps/doc-browser-download.md` |
| `linkapp.htsc.com.cn/S/` | 浏览器下载 | `steps/doc-browser-download.md` |
| `.docx` / `.pdf` / `.doc` 本地文件 | doc-to-md | `steps/doc-to-md.md` |

> 进入浏览器下载分支后，默认优先调用插件 subagent `cloud-doc-downloader`，输入 `source_url`、`reqid`、`references_dir`，由 subagent 执行下载和 `doc-to-md` 转换。本命令场景下等待 subagent 返回结果后再进入完成输出流程。
>
> 调试开关：如果用户输入包含 `--no-cloud-subagent`、"不用 subagent"、"同步调试"、"当前会话执行"，或环境变量 `PO_CLOUD_DOC_SUBAGENT=0` / `false` / `off`，禁止派发 subagent，直接加载 `${CLAUDE_PLUGIN_ROOT}/skills/po-skills/steps/doc-browser-download.md` 并在当前会话同步执行。这个模式便于观察 Chrome DevTools MCP 操作和排查浏览器会话冲突。
>
> 若 `cloud-doc-downloader` 不可用，**立即切换**加载 `${CLAUDE_PLUGIN_ROOT}/skills/po-skills/steps/doc-browser-download.md` 并在当前会话同步执行。下载转换完成后回到本文档的完成输出流程。
>
> 进入本地文档分支后，切换到 `steps/doc-to-md.md`。

---

## Wiki API 转换

**输出目录规则（AI 在执行前自动推导，无需用户指定）：**

| 输入方式 | 输出目录 |
|---|---|
| `--file`（本地 JSON 转换） | 项目根目录下以文件名命名的新目录，内部固定结构如下 |
| `--url`（Wiki 页面转换） | 默认输出到 `REQ-<pageId>/1.产品设计/`；若无法提取 `pageId`，则输出到 `REQ-<随机8位>/1.产品设计/` |
| 后续步骤处理本地已有 `[PROD_ORI]` 文件 | 与该 `[PROD_ORI]` 文件所在的 `1.产品设计/` 目录 |

**目录结构（固定）：**
```
<需求ID>/              ← 以需求ID命名，如 TAILOR-124
  1.产品设计/          ← [PROD_ORI]、[PROD_FORMAT] 文件和 images/ 都放这里
    images/
```

doc-convert 执行时 `--output-dir` 指向 `<需求ID>/1.产品设计/`。

**默认目录命名规则：**
1. 使用 `--file`（本地 JSON）→ 从 JSON 文件名去掉扩展名作为目录名
2. 使用 `--url`（Wiki 页面）→ 使用 `REQ-<pageId>`
3. 无法提取 `pageId` → 使用 `REQ-<随机8位>`

**说明：**
- Windows 环境下推荐 URL 模式使用默认 `REQ-<pageId>` 目录，避免中文路径编码问题
- 如需自定义目录，可显式传入 `--output-dir`
- `fetch-title` 可用于确认页面标题或后续文件命名参考，但**不要**再将页面标题直接拼成 URL 模式的默认输出目录
- URL 模式默认应直接执行 `doc-convert --url ...`，让 `run.py` 自动推导 `REQ-<pageId>/1.产品设计/`

**执行：**
```bash
python ${CLAUDE_PLUGIN_ROOT}/skills/po-skills/run.py doc-convert --file ./data/page.json --output-dir ./考核优化二期需求/1.产品设计
python ${CLAUDE_PLUGIN_ROOT}/skills/po-skills/run.py doc-convert --url "http://wiki.../pages/viewpage.action?pageId=123456"
python ${CLAUDE_PLUGIN_ROOT}/skills/po-skills/run.py doc-convert --url "http://wiki.../pages/viewpage.action?pageId=123456" --output-dir "TAILOR-124/1.产品设计"
```

> ⚠️ **`--output-dir` 强制规则**：当用户提供了 REQID 时，`--output-dir` 的值**必须是 `<REQID>/1.产品设计`**，而不能只填 `<REQID>`。只填 REQID 会导致文件输出到错误目录，进而导致后续所有步骤全部失败。

**输出：** `./REQ-<pageId>/1.产品设计/[PROD_ORI]<页面标题>.md`，图片下载至同目录下的 `images/`

步骤二执行成功后，stdout 会输出：

```text
OUTPUT_FILE=<路径>
```

> ⚠️ **enhance-content 调用规则**：必须读取 stdout 中的 `OUTPUT_FILE=<路径>` 并将其作为 `--input` 参数，**严禁**使用 `--input-dir`，严禁自行猜测文件名。正确示例：
```bash
python ${CLAUDE_PLUGIN_ROOT}/skills/po-skills/run.py enhance-content --input "TAILOR-124/1.产品设计/[PROD_ORI]需求说明.md"
```

**错误处理：**
- `HTSC_WIKI_TOKEN` 未设置：明确提示用户这里需要的是 **Wiki Personal Access Token，不是 Cookie**。提示文案应类似：

```text
需要先配置 Wiki 访问 Token。

请在 `${CLAUDE_PLUGIN_ROOT}/skills/po-skills/.env` 中添加：
HTSC_WIKI_TOKEN=<你的 Confluence Personal Access Token>

获取方式：
1. 登录 Wiki
2. 右上角头像 → 个人设置
3. 进入"个人访问令牌（Personal Access Tokens）"
4. 创建并复制 Token

这里需要的是 Token，不是浏览器 Cookie。
```
- 页面不存在或无权限：提示检查 URL 和 Token

完成后输出：
```
✅ doc-convert 完成！
文件：<路径>

⚡ 自动进入图片分析（enhance-content）...
```
