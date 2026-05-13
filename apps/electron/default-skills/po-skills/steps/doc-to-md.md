# 独立工具：doc-to-md（本地文档 → 干净 Markdown）

**触发词：** `doc-to-md` 或"pdf转md"或"docx转md"或"文档转markdown"

**职责：** 纯工具步骤，代码完成，不需要 AI 介入。
- 读取本地 `doc`、`docx`、`pdf` 等文档
- 使用微软 `markitdown` Python 包转换为 Markdown
- 输出干净的 Markdown 文件，文件名前缀 `[PROD_ORI]`

**执行：**
```bash
python ${CLAUDE_PLUGIN_ROOT}/skills/po-skills/run.py doc-to-md --file ./data/spec.pdf
python ${CLAUDE_PLUGIN_ROOT}/skills/po-skills/run.py doc-to-md --file ./data/spec.docx --output-dir ./TAILOR-124/1.产品设计
python ${CLAUDE_PLUGIN_ROOT}/skills/po-skills/run.py doc-to-md --file ./data/spec.docx --enhance-content
```

**输出目录规则：**
- 显式传入 `--output-dir` 时，直接使用
- 未传入时，自动创建 `./<文档名>/1.产品设计/`

**输出：** `./<文档名>/1.产品设计/[PROD_ORI]<文档名>.md`

步骤执行成功后，stdout 会输出 `OUTPUT_FILE=<路径>` 格式的一行。

带 `--enhance-content` 时，stdout 还会输出：

```text
ENHANCE_CONTENT=true
ENHANCE_INPUT=<路径>
```

此时 skill 必须继续执行 `enhance-content --input "<OUTPUT_FILE>"`。

**错误处理：**
- 未安装 `markitdown`：提示先安装依赖
- 输入文件不存在：提示检查路径
- 转换结果为空：提示检查源文件格式是否受支持

完成后输出：
```
✅ doc-to-md 完成！
文件：<路径>

⚡ 自动进入步骤二 enhance-content（图片分析与内容增强）...
```
