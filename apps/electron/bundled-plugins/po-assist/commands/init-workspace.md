---
description: 初始化 po 工作空间骨架
argument-hint: ""
---

执行 po-skill 工作空间初始化。

输入：$ARGUMENTS

## 执行规则

1. 首先 `read` 公共模块：`<技能根目录>/common/init.md`
2. 再读取 `<技能根目录>/steps/init-workspace.md`
3. 按 step 文件执行 `run.py init-workspace`
4. 用产品语言告诉用户工作空间已初始化，不暴露内部脚本细节
