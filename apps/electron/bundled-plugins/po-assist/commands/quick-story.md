---
description: 从自然语言描述直接创建单条 DPMP Story
argument-hint: [自然语言描述的 Story 信息]
---

执行 po-skill `quick-story` 步骤。

输入：$ARGUMENTS

## 执行规则

1. 首先 `read` 公共模块和步骤文件：`${CLAUDE_PLUGIN_ROOT}/skills/po-skills/common/init.md`、`${CLAUDE_PLUGIN_ROOT}/skills/po-skills/steps/quick-story.md`
2. init.md 中的全局输出规范对本命令生效
3. 直接按步骤文件创建 Story；DPMP 配置缺失由脚本返回错误后再提示用户补充
