---
description: Create Story items from a CSV plan
argument-hint: [story-plan-csv]
---

执行 po-skill `story-create` 步骤。

输入：$ARGUMENTS

## 执行规则

1. 按 po-skill 中对应步骤执行；不要把项目工作区中的 `common/` 或 `steps/` 当作内部目录
2. init.md 中的全局输出规范对本命令生效
3. 输入可为 CSV / [PROD_ORI] / [PROD_FORMAT]，按类型自动提取或补全前序步骤后生成 CSV；DPMP 配置缺失由脚本返回错误后再提示用户补充
