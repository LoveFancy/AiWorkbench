---
description: 将本地 Markdown 发布到 Confluence Wiki 页面
argument-hint: [本地 Markdown 文件路径] [--space-key SpaceKey --parent-page-id 父页面ID] [--page-id 已有页面ID --mode update]
---

执行 po-skill `wiki-upload` 步骤。

输入：$ARGUMENTS

## 执行规则

1. 首先 `read` 公共模块和步骤文件：`${CLAUDE_PLUGIN_ROOT}/skills/po-skills/common/init.md`、`${CLAUDE_PLUGIN_ROOT}/skills/po-skills/steps/wiki-upload.md`
2. init.md 中的全局输出规范对本命令生效
3. 依赖校验：检查 `.env` 或会话环境中是否配置 `HTSC_WIKI_TOKEN`，并确认 `markdown-to-confluence` 安装后可用的 `md2conf` 命令存在
4. 只接受本地 Markdown 文件；若用户给出其他格式，提示先转换为 Markdown 再发布
5. 新建页面时需要 `--space-key`，建议提供 `--parent-page-id`
6. 更新页面时需要 `--mode update --page-id <页面ID>`
7. 调用 `run.py wiki-upload` 执行 `md2conf` 同步发布
