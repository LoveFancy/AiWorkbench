---
description: 创建本地 Mermaid 或 drawio 图文件
argument-hint: [流程描述 / PRD片段 / 文档路径] [--reqid REQID] [--format mermaid|drawio]
---

执行 po-skill `newdiagram` 步骤。

输入：$ARGUMENTS

## 执行规则

1. 按 po-skill 中对应步骤执行；不要把项目工作区中的 `common/` 或 `steps/` 当作内部目录
2. init.md 中的全局输出规范对本命令生效
3. 默认创建本地 `.mmd` Mermaid 文件
4. 用户明确要求 drawio / 可编辑 draw.io / `.drawio` 时，直接生成本地 `.drawio` 文件
5. 如用户未提供 REQID，写入当前工作目录下的 `diagrams/`
