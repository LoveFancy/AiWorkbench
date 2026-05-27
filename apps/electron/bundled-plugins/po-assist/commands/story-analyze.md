---
description: Analyze story layers from source markdown
argument-hint: [prod-ori-file]
---

执行 po-skill `story-analyze` 步骤。

输入：$ARGUMENTS

## 执行规则

1. 首先 `read` 公共模块和步骤文件：`<技能根目录>/common/init.md`、`<技能根目录>/steps/story-analyze.md`
2. init.md 中的全局输出规范对本命令生效
3. 读取输入文件。未指定路径 → 在当前目录下查找 `[PROD_ORI]*.md` 文件，找不到 → 自动执行 doc-convert 后继续；缺文件由读取失败后的错误处理提示
