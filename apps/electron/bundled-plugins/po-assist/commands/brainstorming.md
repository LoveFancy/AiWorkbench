---
description: 产品阶段头脑风暴与需求澄清
argument-hint: <产品想法 / 业务问题 / 需求背景> [--save] [--continue-prd]
---

执行 po-skill `brainstorming` 步骤。

输入：$ARGUMENTS

## 执行规则

1. 首先 `read` 公共模块和步骤文件：`${CLAUDE_PLUGIN_ROOT}/skills/po-skills/common/init.md`、`${CLAUDE_PLUGIN_ROOT}/skills/po-skills/steps/brainstorming.md`
2. init.md 中的全局输出规范对本命令生效
3. 输入中包含 `--save`、"保存"、"沉淀成文档" 时，先确认或通过 `newreq --init-only` 获取正式需求空间，再生成 `[BRAINSTORM]需求澄清纪要.md`
4. 输入中包含 `--continue-prd`、"继续写 PRD"、"再生成 PRD" 时，在输出头脑风暴纪要后继续执行 `prd-write`
5. 默认只在对话中输出结构化结论，不写文件，不生成 PRD
