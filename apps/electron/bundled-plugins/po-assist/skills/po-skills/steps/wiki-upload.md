# 独立工具：wiki-upload（Markdown → Confluence Wiki 页面）

**触发词：** `wiki-upload`、`上传到 Wiki`、`发布到 Confluence`、`Markdown 发布 Wiki`

**职责：** 将本地 Markdown 交给 `md2conf` 同步到 Confluence Wiki；`md2conf` 负责转换 Storage Format、创建/更新页面，并上传本地图片为页面附件。

## 输入约束

- 只支持本地 Markdown 文件
- Markdown 内的图片引用必须是本地相对路径，且文件可被 `md2conf` 从 Markdown 所在目录解析到
- 配置只允许写入并读取项目根目录 `.env`；`run.py` 会自动读取 `.env`
- `.env` 需要配置 `HTSC_WIKI_TOKEN`；新建页面还需要 `HTSC_WIKI_SPACE_KEY` 或命令行 `--space-key`
- 缺配置时按 init.md 的全局规则只补齐必需键并停止
- 不要使用 `export HTSC_WIKI_TOKEN=...`，不要把 Token 写进命令行参数
- Markdown 内如包含 Mermaid 代码块，`wiki-upload` 会先检查本机或 Poskill 本地目录是否已有 `mmdc`；缺少时再按需安装 `@mermaid-js/mermaid-cli`
- 新建页面需要目标 Space Key，建议提供父页面 ID 或父页面 URL；`--parent-page-id` 可填写纯数字 ID，也可填写 `pages/viewpage.action?pageId=...` 页面 URL
- 可在项目根目录 `.env` 中配置 `HTSC_WIKI_SPACE_KEY`、`HTSC_WIKI_PARENT_PAGE_ID` 或 `HTSC_WIKI_PARENT_PAGE_URL` 作为默认值
- 更新页面需要已有页面 ID

## 执行流程

1. 相对路径基准：使用当前已加载的 `SKILL.md` 所在目录；不要读取或写入路径缓存，不要使用插件根目录环境变量，也不要 glob、find 或递归搜索
2. 如果无法确定相对路径基准，停止并要求用户提供当前已加载的 `SKILL.md` 所在目录
3. 解析用户输入，确定本地 Markdown 路径、标题、创建/更新模式、父页面或目标页面参数
4. 先执行 init.md 的全局自检规则，完成后再读取 wiki-upload 配置；本步骤只补充 wiki-upload 专属键：`HTSC_WIKI_TOKEN`、`HTSC_WIKI_SPACE_KEY`、`HTSC_WIKI_PARENT_PAGE_ID` 或 `HTSC_WIKI_PARENT_PAGE_URL`
5. 不要手工执行 `ls`，不要手工执行 `grep`，不要手工执行 `which md2conf`，也不要读取或检查 `requirements.txt`；缺文件、缺依赖都由脚本返回错误；缺 Token 由脚本返回 WIKI_TOKEN_REQUIRED=true
6. 不得调用 `ht-wiki`、`md2conf`、`pip install`、`python -m pip show` 或自写 Python import 探测
7. 调用 `python run.py wiki-upload --file "<本地 Markdown 路径>" ...`
8. 用户说“上传回原页面”“覆盖这个页面”“更新这个页面”，或提供明确的目标页面 URL/pageId 时，传参必须使用 `--mode update --page-id <页面ID>`；更新模式不读取也不传入 Space Key 或父页面默认值
9. 用户说“发布到某页面下”“作为子页面”“父页面”时，传参必须使用 `--space-key <SpaceKey> --parent-page-id <父页面ID或URL>`
10. 脚本创建临时 Markdown 副本，按需注入 `title`、`confluence-space-key` 和 `confluence-page-id`
11. 如果临时 Markdown 中包含 Mermaid 代码块：
   - 优先复用系统 `PATH` 中已有的 `mmdc`
   - 其次复用技能目录下 `node_modules/.bin/mmdc` 或 `mmdc.cmd`
   - 如果都不存在，再执行 `npm install --prefix <技能目录> @mermaid-js/mermaid-cli`
   - 执行 `md2conf` 前，将技能目录下的 `node_modules/.bin` 注入 `PATH`
12. 处理父页面默认值：
   - 如果用户本次显式提供父页面 ID/URL，发布后提醒用户记录到项目根目录 `.env`，例如 `HTSC_WIKI_PARENT_PAGE_ID=123456`，方便下次复用
   - 如果用户未显式提供父页面 ID/URL，但 `.env` 中存在 `HTSC_WIKI_PARENT_PAGE_ID` 或 `HTSC_WIKI_PARENT_PAGE_URL`，上传前必须提醒用户将默认发布到该父页面下，并获得用户确认后再执行
13. `run.py wiki-upload` 内部调用 `md2conf` 发布页面；新建页面由 `space-key` 和 `parent-page-id` 定位，更新页面由 `page-id` 定位；命令行参数优先，未传时读取 `.env` 默认值
14. 调用 `md2conf` 时必须给子进程注入 `PYTHONIOENCODING=utf-8`，避免 Windows GBK 终端下中文路径或中文日志编码失败
15. 本地图片由 `md2conf` 作为 Confluence 页面附件上传和引用

## `.env` 配置契约

项目根目录 `.env` 至少需要：

```bash
HTSC_WIKI_TOKEN=<你的 Confluence Personal Access Token>
```

新建页面还需要命令行传入 `--space-key`，或在 `.env` 中配置：

```bash
HTSC_WIKI_SPACE_KEY=<SpaceKey>
HTSC_WIKI_PARENT_PAGE_ID=<父页面ID>
```

缺配置时按 init.md 的全局规则只补齐上述键并停止；不要用临时 shell 环境变量绕过.

## 常用命令

使用 `.env` 默认目标新建页面：

```bash
python run.py wiki-upload \
  --file "./newreq/REQ-001/PRODUCT_DESIGN/[PROD_FORMAT]活动需求.md" \
  --title "活动需求"
```

覆盖默认目标新建页面：

```bash
python run.py wiki-upload \
  --file "./newreq/REQ-001/PRODUCT_DESIGN/[PROD_FORMAT]活动需求.md" \
  --space-key "AI" \
  --parent-page-id "http://wiki.htzq.htsc.com.cn/pages/viewpage.action?pageId=123456" \
  --title "活动需求"
```

更新已有页面：

```bash
python run.py wiki-upload \
  --file "./newreq/REQ-001/PRODUCT_DESIGN/[PROD_FORMAT]活动需求.md" \
  --mode update \
  --page-id "789012" \
  --title "活动需求"
```

## 错误处理

- `HTSC_WIKI_TOKEN` 未配置：按 init.md 的全局规则主动询问用户提供 Wiki Personal Access Token；收到后只补齐必需配置键，不要在对话中回显 Token 明文；写入后重新执行刚才失败的命令。
- `md2conf` 不可用：说明环境初始化未完成或依赖安装失败，按 init.md 的全局自检规则处理
- `md2conf` 运行时报 `ScannedDocument`、`Scanner().scan()`、`ConfluenceDocument` 或 `object has no len()`：说明当前命令来自旧版 `md2conf` 或 Python 包冲突，应卸载旧版 `md2conf`，并确认使用 `markdown-to-confluence` 提供的 `md2conf`
- Markdown 含 Mermaid 代码块但 `npm` 不可用或 Mermaid CLI 安装失败：提示安装 Node.js/npm，或先将 Mermaid 图导出为图片后再上传
- Markdown 文件不存在：提示检查本地路径
- Confluence 创建或更新失败：返回 HTTP 错误摘要，并提示检查页面权限、Space Key 或 page ID

完成后输出 `CONFLUENCE_PAGE_ID`、`CONFLUENCE_PAGE_TITLE`、`CONFLUENCE_PAGE_URL` 和 `MODE`。
