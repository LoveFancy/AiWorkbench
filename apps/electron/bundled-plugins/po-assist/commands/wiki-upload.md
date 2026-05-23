---
description: 将本地 Markdown 发布到 Confluence Wiki 页面
argument-hint: [本地 Markdown 文件路径] [--space-key SpaceKey --parent-page-id 父页面ID或URL] [--page-id 已有页面ID --mode update]
---

执行 po-skill `wiki-upload` 步骤。

输入：$ARGUMENTS

## 执行规则

1. 首先 `read` 公共模块和步骤文件：`${CLAUDE_PLUGIN_ROOT}/skills/po-skills/common/init.md`、`${CLAUDE_PLUGIN_ROOT}/skills/po-skills/steps/wiki-upload.md`
2. init.md 中的全局输出规范对本命令生效
3. 首次自检：若技能目录下不存在 `.poskill-env.json`，先执行 `bootstrap.py` 完成 Poskill 环境自检；若已存在则不要重复检查 Python 依赖或 `md2conf`
4. 不要手工读取配置文件、本地目录、Markdown 文件、图片目录或探测 `md2conf`；缺文件、缺 Token、缺依赖都由脚本返回错误
5. 只接受本地 Markdown 文件；若用户给出其他格式，提示先转换为 Markdown 再发布
6. 新建页面时需要 `--space-key`，建议提供 `--parent-page-id`；该参数可填写纯数字父页面 ID，也可填写 `pages/viewpage.action?pageId=...` 页面 URL
7. 更新页面时需要 `--mode update --page-id <页面ID>`
8. 如果用户本次显式提供父页面 ID/URL，发布后提醒用户可写入项目根目录 `.env`，后续复用同一父目录
9. 如果用户未显式提供父页面 ID/URL，但 `.env` 中存在 `HTSC_WIKI_PARENT_PAGE_ID` 或 `HTSC_WIKI_PARENT_PAGE_URL`，上传前必须提醒用户将默认发布到该父页面下，并获得用户确认后再执行
10. 调用 `run.py wiki-upload` 执行 `md2conf` 同步发布
