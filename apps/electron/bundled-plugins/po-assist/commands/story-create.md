---
description: Create Story items from a CSV plan
argument-hint: [story-plan-csv]
---

执行 po-skill `story-create` 步骤。

输入：$ARGUMENTS

## 执行规则

1. 首先 `read` 公共模块和步骤文件：`${CLAUDE_PLUGIN_ROOT}/skills/po-skills/common/init.md`、`${CLAUDE_PLUGIN_ROOT}/skills/po-skills/steps/story-create.md`
2. init.md 中的全局输出规范对本命令生效
3. 依赖校验：检查 `.env` 中 `DPMP_COOKIE` 是否配置。输入可为 CSV / [PROD_ORI] / [PROD_FORMAT]，按类型自动提取或补全前序步骤后生成 CSV
