---
description: 产品阶段头脑风暴与需求澄清
argument-hint: <产品想法 / 业务问题 / 需求背景> [--save] [--continue-prd]
---

执行 po-skill `brainstorming` 步骤。

输入：$ARGUMENTS

**重要边界：** brainstorming 是 AI 对话流程，不是 `run.py` 子命令。禁止执行 `run.py brainstorming`；只能读取步骤文件后在当前对话中完成澄清、收敛和纪要输出。

## 执行规则

1. 按 po-skill 中对应步骤执行；不要把项目工作区中的 `common/` 或 `steps/` 当作内部目录
2. init.md 中的全局输出规范对本命令生效
3. 输入中包含 `--save`、"保存"、"沉淀成文档" 时，先确认或通过 `newreq --init-only` 获取正式需求空间，再生成 `[BRAINSTORM]需求澄清纪要.md`
4. 输入中包含 `--continue-prd`、"继续写 PRD"、"再生成 PRD" 时，在输出头脑风暴纪要后继续执行 `prd-write`
5. 默认只在对话中输出结构化结论，不写文件，不生成 PRD
