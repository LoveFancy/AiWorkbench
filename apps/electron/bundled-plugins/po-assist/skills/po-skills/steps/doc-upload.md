# 独立工具：doc-upload（Markdown → docx → 飞书文档）

**触发词：** `doc-upload`、`上传文档`、`飞书上传`

**职责：** 将本地 Markdown 先通过 `pandoc` 转成 `.docx`，再用 `lark-cli drive +import --type docx` 导入为飞书在线文档。

## 输入约束

- 只支持本地 Markdown 文件
- Markdown 内的图片引用必须是本地相对路径，且文件可被 `pandoc` 从 Markdown 所在目录解析到
- 如果图片路径失效，先修正本地资源，再执行上传

## 执行流程

1. 检查本地 Markdown 文件是否存在
2. 调用 `python ${CLAUDE_PLUGIN_ROOT}/skills/po-skills/run.py doc-upload --file "<本地 Markdown 路径>" ...`
3. 先执行 `pandoc` 生成临时 `.docx`
4. 再执行 `lark-cli drive +import --file "<docx>" --type docx`
5. 如用户指定目标文件夹或名称，透传 `--folder-token` 和 `--name`
6. 如用户明确要求使用特定身份，透传 `--as user|bot`

## 错误处理

- `pandoc` 不可用：提示安装 `pandoc`
- Markdown 文件不存在：提示检查本地路径
- 飞书导入失败：把 `lark-cli` 的原始错误信息返回给用户

完成后输出上传结果和飞书文档返回内容。
