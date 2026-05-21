# 步骤二：doc-convert（文档 → 干净 Markdown）

**触发词：** `doc-convert` 或"wiki转markdown"或"wiki转md"

**职责：** 对外统一的文档转换入口，接收多种输入类型，自动选择转换策略：
- Wiki URL → API 直接拉取转换
- 飞书 docx/wiki URL → `lark-cli docs +fetch` 拉取 Markdown，并直接下载图片 URL 到 `images/`
- EIP / LinkApp URL → 暂不支持自动下载，提示用户手工下载后再转换
- 本地文档（.docx/.pdf/.doc）→ doc-to-md 转换

**强制边界：** 飞书 docx/wiki URL 走 `lark-doc-to-md`；EIP / LinkApp 云文档 URL 暂不支持自动下载；手工下载后的 `.doc/.docx/.pdf` 文件必须调用 `run.py doc-to-md --file`，由 `steps/doc-to-md.md` 使用 markitdown 转换。`run.py doc-convert --file` 只用于 Confluence API JSON，不能拿来处理 Office/PDF 文档；也禁止临时编写 `python-docx`、PDF 解析脚本替代 doc-to-md。

---

## 输入分流（优先执行）

收到 URL 或文件路径后先判断类型，选择对应策略：

| URL/文件特征 | 策略 | 步骤文件 |
|-------------|------|----------|
| `http://wiki...` 含 `pageId=` | Wiki API 转换 | 本文档后续步骤 |
| `*.feishu.cn/docx/` / `*.feishu.cn/wiki/` / `*.larksuite.com/docx/` / `*.larksuite.com/wiki/` | 飞书文档转换，图片直接下载到 `images/` | 本文档后续步骤 |
| `eip.htsc.com.cn/htscPortalDocs/` | 暂不支持自动下载，提示手工下载 | 无 |
| `linkapp.htsc.com.cn/S/` | 暂不支持自动下载，提示手工下载 | 无 |
| `.json` 且为 Confluence API 响应 | Wiki JSON 转换 | 本文档后续步骤 |
| `.docx` / `.pdf` / `.doc` 本地文件 | `run.py doc-to-md --file` | `steps/doc-to-md.md` |

> 识别到 EIP / LinkApp 云文档 URL 时，直接停止自动转换并返回 `CLOUD_DOC_MANUAL_DOWNLOAD_REQUIRED`。不要派发 `cloud-doc-downloader`，不要加载或同步执行 `steps/doc-browser-download.md`，不要尝试通过 chrome-devtools 点击下载。
>
> 提示用户：暂不支持自动下载 EIP/LinkApp 云文档；请先在浏览器中手工下载原始 `.doc/.docx/.pdf` 文件，然后使用 `/doc-convert <本地文件路径>` 继续转换。
>
> 进入本地文档分支后，切换到 `steps/doc-to-md.md`，执行 `python ${CLAUDE_PLUGIN_ROOT}/skills/po-skills/run.py doc-to-md --file "<本地文档路径>" ...`。

> 进入飞书文档分支后，`run.py doc-convert --url` 会内部转调 `lark-doc-to-md`：先执行 `lark-cli docs +fetch --api-version v2 --doc "<飞书文档URL>" --doc-format markdown`，再将 Markdown 中的 `internal-api-drive-stream.feishu.cn` 图片直接下载到输出目录的 `images/` 下，并把图片引用改写成 `./images/image-xxx.<ext>`。
> 识别到飞书文档 URL 后必须直接转换，不要询问用户是否调用 `lark-doc` 或要求二次确认；如果没有提供 REQID / `--output-dir`，执行 `run.py doc-convert --url "<飞书文档URL>"`，脚本默认输出到 `raw/`。

---

## Wiki API 转换

**输出目录规则：**

| 输入方式 | 输出目录 |
|---|---|
| `--reqid <REQID>` | `newreq/<REQID>/1.产品设计/`，要求需求空间已由 `newreq` 创建 |
| `--raw` | `raw/`，只用于未归属正式需求的临时转换 |
| `--output-dir` | 兼容/高级参数，调用方自行保证目录已存在 |
| 后续步骤处理本地已有 `[PROD_ORI]` 文件 | 先执行 `resolve-workspace --from-file <路径>` 推导目录 |

**目录结构（固定）：**
```
newreq/<REQID>/
  1.产品设计/          ← 主需求文档和 images/ 放这里
    images/
  references/          ← 参考资料放这里
    images/
```

doc-convert 作为转换工具，不再拥有正式需求目录初始化职责。

**说明：**
- `fetch-title` 可用于确认页面标题或后续文件命名参考，但**不要**再将页面标题直接拼成 URL 模式的默认输出目录
- `--reqid` 指向的需求空间不存在时，先执行 `newreq --reqid <REQID> --init-only`
- `--raw` 使用的 `raw/` 不存在时，先执行 `init-workspace`

**执行：**
```bash
python ${CLAUDE_PLUGIN_ROOT}/skills/po-skills/run.py doc-convert --url "http://wiki.../pages/viewpage.action?pageId=123456" --reqid "TAILOR-124"
python ${CLAUDE_PLUGIN_ROOT}/skills/po-skills/run.py doc-convert --url "https://example.feishu.cn/docx/xxxxx" --reqid "TAILOR-124"
python ${CLAUDE_PLUGIN_ROOT}/skills/po-skills/run.py doc-convert --file ./data/page.json --raw
python ${CLAUDE_PLUGIN_ROOT}/skills/po-skills/run.py doc-convert --url "http://wiki.../pages/viewpage.action?pageId=123456" --output-dir "newreq/TAILOR-124/1.产品设计"
```

> ⚠️ `doc-convert --file` 示例中的 `page.json` 是 Confluence API JSON，不是 `.doc/.docx/.pdf`。本地文档转换示例见 `steps/doc-to-md.md`。

> ⚠️ **目标目录强制规则**：用户提供了 REQID 时优先使用 `--reqid <REQID>`，不要自行拼 `--output-dir`。只有兼容旧资料或明确高级用法时才使用 `--output-dir`。

**输出：** `newreq/<REQID>/1.产品设计/[PROD_ORI]<页面标题或飞书标题>.md`，图片下载至同目录下的 `images/`

步骤二执行成功后，stdout 会输出：

```text
OUTPUT_FILE=<路径>
```

> ⚠️ **enhance-content 调用规则**：必须读取 stdout 中的 `OUTPUT_FILE=<路径>` 并将其作为 `--input` 参数，**严禁**使用 `--input-dir`，严禁自行猜测文件名。
>
> 图片数量控制：`run.py doc-convert --enhance-content` 会统计输出 Markdown 中的本地图片引用。图片数量 ≤ 20 时输出 `ENHANCE_CONTENT=true`，可继续执行 `enhance-content`；图片数量 > 20 时输出 `IMAGE_ENHANCE_CONFIRM_REQUIRED=true`、`IMAGE_COUNT=<数量>` 和 `ENHANCE_INPUT=<路径>`，此时必须先询问用户是否需要转换图片，用户确认后再执行 `enhance-content`，用户拒绝则跳过图片转换并保留原图片链接。
>
> 正确示例：
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

⚡ 如图片数量不多，自动进入图片分析（enhance-content）；如图片数量较多，先询问用户是否继续转换图片。
```
