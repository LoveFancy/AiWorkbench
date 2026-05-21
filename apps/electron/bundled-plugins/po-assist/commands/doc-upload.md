---
description: 先用 pandoc 将 Markdown 转成 docx，再导入成飞书文档
argument-hint: [本地 Markdown 文件路径] [--folder-token 目标文件夹] [--name 文档名] [--as user|bot]
---

执行 po-skill `doc-upload` 步骤。

输入：$ARGUMENTS

## 执行规则

1. 首先 `read` 公共模块和步骤文件：`${CLAUDE_PLUGIN_ROOT}/skills/po-skills/common/init.md`、`${CLAUDE_PLUGIN_ROOT}/skills/po-skills/steps/doc-upload.md`
2. init.md 中的全局输出规范对本命令生效
3. 依赖校验：检查本机是否可用 `pandoc` 和 `lark-cli`
4. 只接受本地 Markdown 文件；若用户给出其他格式，提示先转换为 Markdown 再上传
5. 调用 `run.py doc-upload` 执行 `pandoc -> lark-cli drive +import`
