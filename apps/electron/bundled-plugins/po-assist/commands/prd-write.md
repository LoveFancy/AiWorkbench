---
description: 从自由文字描述合成首版草稿 PRD
argument-hint: [需求描述，可含 Wiki URL、本地文档或 EIP/LinkApp URL]
---

执行 po-skill `prd-write` 步骤。

输入：$ARGUMENTS

## 执行规则

1. 首先 `read` 公共模块和步骤文件：`${CLAUDE_PLUGIN_ROOT}/skills/po-skills/common/init.md`、`${CLAUDE_PLUGIN_ROOT}/skills/po-skills/steps/prd-write.md`
2. init.md 中的全局输出规范对本命令生效
3. 如输入含 Wiki URL，直接按步骤文件调用脚本转换；缺 Token 或权限由脚本返回错误后再提示用户补充
4. 如输入含 EIP / LinkApp 云文档 URL，不要自动下载；按步骤文件登记为待补充，并提示用户手工下载原始 `.doc/.docx/.pdf` 文件后再提供本地路径
5. 主会话继续生成首版 PRD 草稿；用户后续提供手工下载后的本地文件时，按补充文档流程先更新 `1.2.1 参考资料 / 关联文档清单`，再列出受影响章节并征得用户确认后更新 PRD
