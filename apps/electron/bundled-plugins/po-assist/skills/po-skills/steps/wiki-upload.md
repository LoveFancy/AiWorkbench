# 独立工具：wiki-upload（Markdown → Confluence Wiki 页面）

**触发词：** `wiki-upload`、`上传到 Wiki`、`发布到 Confluence`、`Markdown 发布 Wiki`

**职责：** 将本地 Markdown 交给 `md2conf` 同步到 Confluence Wiki；`md2conf` 负责转换 Storage Format、创建/更新页面，并上传本地图片为页面附件。

## 输入约束

- 只支持本地 Markdown 文件
- Markdown 内的图片引用必须是本地相对路径，且文件可被 `md2conf` 从 Markdown 所在目录解析到
- 需要配置 `HTSC_WIKI_TOKEN`
- 新建页面需要目标 Space Key，建议提供父页面 ID
- 更新页面需要已有页面 ID

## 执行流程

1. 检查本地 Markdown 文件是否存在
2. 检查 `HTSC_WIKI_TOKEN` 是否配置
3. 检查 `md2conf` 是否可执行；如果不可用，提示安装 `src/po-skills/requirements.txt`（依赖包名是 `markdown-to-confluence`）
4. 调用 `python ${CLAUDE_PLUGIN_ROOT}/skills/po-skills/run.py wiki-upload --file "<本地 Markdown 路径>" ...`
5. 脚本创建临时 Markdown 副本，按需注入 `title`、`confluence-space-key` 和 `confluence-page-id`
6. 调用 `md2conf` 发布页面；新建页面由 `space-key` 和 `parent-page-id` 定位，更新页面由 `page-id` 定位
7. 本地图片由 `md2conf` 作为 Confluence 页面附件上传和引用

## 常用命令

新建页面：

```bash
python ${CLAUDE_PLUGIN_ROOT}/skills/po-skills/run.py wiki-upload \
  --file "./newreq/REQ-001/1.产品设计/[PROD_FORMAT]活动需求.md" \
  --space-key "AI" \
  --parent-page-id "123456" \
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
- `md2conf` 不可用：提示执行 `pip install -r src/po-skills/requirements.txt`
- Markdown 文件不存在：提示检查本地路径
- Confluence 创建或更新失败：返回 HTTP 错误摘要，并提示检查页面权限、Space Key 或 page ID

完成后输出 `CONFLUENCE_PAGE_ID`、`CONFLUENCE_PAGE_TITLE`、`CONFLUENCE_PAGE_URL` 和 `MODE`。
