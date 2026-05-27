---
description: Generate a structured PRD from source markdown
argument-hint: [prod-ori-file]
---

执行 po-skill `prd-convert` 步骤。

输入：$ARGUMENTS

## 执行规则

1. 首先 `read` 公共模块和步骤文件：`<技能根目录>/common/init.md`、`<技能根目录>/steps/prd-convert.md`
2. init.md 中的全局输出规范对本命令生效：严禁向用户暴露文件路径、步骤编号、内部流程等技术细节，用产品经理的语言沟通
3. 读取输入文件并判断末尾是否包含"附录：Story 结构分析"。不含 → 自动执行 story-analyze 后继续；缺文件由读取失败后的错误处理提示
4. 未指定路径 → 在当前目录下查找 `[PROD_ORI]*.md` 文件，找不到 → 引导先执行 `newreq` 或 `/doc-convert --raw`
