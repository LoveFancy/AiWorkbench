---
description: 初始化 po 工作空间骨架
argument-hint: ""
---

执行 po-skill 工作空间初始化。

输入：$ARGUMENTS

## 执行规则

1. 按 po-skill 中对应步骤执行；不要把项目工作区中的 `common/` 或 `steps/` 当作内部目录
2. 执行 `run.py init-workspace`：
   ```bash
   python ${CLAUDE_PLUGIN_ROOT}/skills/po-skills/run.py init-workspace
   ```
3. 用产品语言告诉用户工作空间已初始化，不暴露内部脚本细节
