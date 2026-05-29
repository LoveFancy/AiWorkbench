---
description: Review a structured PRD for quality issues
argument-hint: [prod-format-file]
---

执行 po-skill `req-review` 步骤。

输入：$ARGUMENTS

## 执行规则

1. 按 po-skill 中对应步骤执行；不要把项目工作区中的 `common/` 或 `steps/` 当作内部目录
2. init.md 中的全局输出规范对本命令生效
3. 读取输入文件。未指定路径 → 在当前目录下查找 `[PROD_FORMAT]*.md` 文件，找不到 → 自动执行 prd-convert 后继续；缺文件由读取失败后的错误处理提示
