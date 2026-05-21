---
description: Analyze story layers from source markdown
argument-hint: [prod-ori-file]
---

执行 po-skill `story-analyze` 步骤。

输入：$ARGUMENTS

## 执行规则

1. 首先 `read` 公共模块和步骤文件：`${CLAUDE_PLUGIN_ROOT}/skills/po-skills/common/init.md`、`${CLAUDE_PLUGIN_ROOT}/skills/po-skills/steps/story-analyze.md`
2. init.md 中的全局输出规范对本命令生效
3. 依赖校验：检查输入文件是否存在。未指定路径 → 在当前目录下查找 `[PROD_ORI]*.md` 文件，找不到 → 自动执行 doc-convert 后继续
