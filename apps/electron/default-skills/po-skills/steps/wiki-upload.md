# 独立工具：wiki-upload（Markdown → Confluence Wiki 页面）

**触发词：** `wiki-upload`、`上传到 Wiki`、`发布到 Confluence`、`Markdown 发布 Wiki`

**职责：** 将本地 Markdown 交给 `md2conf` 同步到 Confluence Wiki；`md2conf` 负责转换 Storage Format、创建/更新页面，并上传本地图片为页面附件。

## 输入约束

- 只支持本地 Markdown 文件
- Markdown 内的图片引用必须是本地相对路径，且文件可被 `md2conf` 从 Markdown 所在目录解析到
- 需要配置 `HTSC_WIKI_TOKEN`
- 新建页面需要目标 Space Key，建议提供父页面 ID 或父页面 URL；`--parent-page-id` 可填写纯数字 ID，也可填写 `pages/viewpage.action?pageId=...` 页面 URL
- 可在项目根目录 `.env` 中配置 `HTSC_WIKI_SPACE_KEY`、`HTSC_WIKI_PARENT_PAGE_ID` 或 `HTSC_WIKI_PARENT_PAGE_URL` 作为默认值
- 更新页面需要已有页面 ID

## 执行流程

1. 解析用户输入，确定本地 Markdown 路径、标题、创建/更新模式、父页面或目标页面参数
2. 首次自检：只有技能目录下不存在 `.poskill-env.json` 时，才先执行 `bootstrap.py`
3. 不要手工执行 `ls`，不要手工执行 `grep`，不要手工执行 `which md2conf`，也不要读取或检查 `requirements.txt`；缺文件、缺 Token、缺依赖都由脚本返回错误
4. 调用 `python ${CLAUDE_PLUGIN_ROOT}/skills/po-skills/run.py wiki-upload --file "<本地 Markdown 路径>" ...`
5. 脚本创建临时 Markdown 副本，按需注入 `title`、`confluence-space-key` 和 `confluence-page-id`
6. 处理父页面默认值：
   - 如果用户本次显式提供父页面 ID/URL，发布后提醒用户记录到项目根目录 `.env`，例如 `HTSC_WIKI_PARENT_PAGE_ID=123456`，方便下次复用
   - 如果用户未显式提供父页面 ID/URL，但 `.env` 中存在 `HTSC_WIKI_PARENT_PAGE_ID` 或 `HTSC_WIKI_PARENT_PAGE_URL`，上传前必须提醒用户将默认发布到该父页面下，并获得用户确认后再执行
7. 调用 `md2conf` 发布页面；新建页面由 `space-key` 和 `parent-page-id` 定位，更新页面由 `page-id` 定位；命令行参数优先，未传时读取 `.env` 默认值
8. 本地图片由 `md2conf` 作为 Confluence 页面附件上传和引用

## 常用命令

使用 `.env` 默认目标新建页面：

```bash
python ${CLAUDE_PLUGIN_ROOT}/skills/po-skills/run.py wiki-upload \
  --file "./newreq/REQ-001/1.产品设计/[PROD_FORMAT]活动需求.md" \
  --title "活动需求"
```

覆盖默认目标新建页面：

```bash
python ${CLAUDE_PLUGIN_ROOT}/skills/po-skills/run.py wiki-upload \
  --file "./newreq/REQ-001/1.产品设计/[PROD_FORMAT]活动需求.md" \
  --space-key "AI" \
  --parent-page-id "http://wiki.htzq.htsc.com.cn/pages/viewpage.action?pageId=123456" \
  --title "活动需求"
```

更新已有页面：

```bash
python ${CLAUDE_PLUGIN_ROOT}/skills/po-skills/run.py wiki-upload \
  --file "./newreq/REQ-001/1.产品设计/[PROD_FORMAT]活动需求.md" \
  --mode update \
  --page-id "789012" \
  --title "活动需求"
```

## 错误处理

- `HTSC_WIKI_TOKEN` 未配置：提示配置 Confluence Personal Access Token
- `md2conf` 不可用：说明 Poskill 首次自检未完成或依赖安装失败，引导用户执行一次 `bootstrap.py`
- Markdown 文件不存在：提示检查本地路径
- Confluence 创建或更新失败：返回 HTTP 错误摘要，并提示检查页面权限、Space Key 或 page ID

完成后输出 `CONFLUENCE_PAGE_ID`、`CONFLUENCE_PAGE_TITLE`、`CONFLUENCE_PAGE_URL` 和 `MODE`。
