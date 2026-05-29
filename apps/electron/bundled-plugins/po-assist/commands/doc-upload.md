---
description: 先用 pandoc 将 Markdown 转成 docx，再导入成飞书文档
argument-hint: [本地 Markdown 文件路径] [--folder-token 目标文件夹] [--name 文档名] [--as user|bot]
---

执行 po-skill `doc-upload` 步骤。

输入：$ARGUMENTS

## 执行规则

1. 按 po-skill 中对应步骤执行；不要把项目工作区中的 `common/` 或 `steps/` 当作内部目录
2. init.md 中的全局输出规范对本命令生效
3. 按 init.md 的全局规则处理环境初始化；不要手工探测 `pandoc`、`lark-cli` 等命令
4. 只接受本地 Markdown 文件；若用户给出其他格式，提示先转换为 Markdown 再上传
5. 调用 `run.py doc-upload` 执行 `pandoc -> lark-cli drive +import`：
   ```bash
   python ${CLAUDE_PLUGIN_ROOT}/skills/po-skills/run.py doc-upload --file "<本地 Markdown 路径>"
   ```
