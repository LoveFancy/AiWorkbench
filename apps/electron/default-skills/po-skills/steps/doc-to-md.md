# 内部子步骤：doc-to-md（本地文档 → 干净 Markdown）

**触发场景：** `doc-convert` 或云文档下载链路内部调用。

**职责：** 内部实现步骤，代码完成，不作为用户侧独立入口。
- 读取本地 `doc`、`docx`、`pdf` 等文档
- 使用微软 `markitdown` Python 包转换为 Markdown
- 输出干净的 Markdown 文件，文件名前缀 `[PROD_ORI]`

**执行：**
```bash
python <技能根目录>/run.py doc-to-md --file ./data/spec.pdf
python <技能根目录>/run.py doc-to-md --file ./data/spec.docx --output-dir ./TAILOR-124/1.产品设计
python <技能根目录>/run.py doc-to-md --file ./raw/spec.docx --output-dir raw
python <技能根目录>/run.py doc-to-md --file ./data/spec.docx --enhance-content
```

**输出目录规则：**
- 显式传入 `--output-dir` 时，直接使用
- 当 `--output-dir raw` 指向工作空间 raw 根目录时，自动输出到 `raw/<源文档名>/`
- 或通过 `--reqid <REQID>` 输出到 `newreq/<REQID>/1.产品设计/`
- 未传入上述参数时，直接报错，不再自动创建目录
- `doc-to-md` 不支持 `--raw`；临时转换本地文档时使用 `--output-dir raw`

**输出：**
- 正式需求：`newreq/<REQID>/1.产品设计/[PROD_ORI]<文档名>.md`
- 临时转换：`raw/<文档名>/[PROD_ORI]<文档名>.md`，图片位于 `raw/<文档名>/images/`

步骤执行成功后，stdout 会输出 `OUTPUT_FILE=<路径>` 格式的一行。

带 `--enhance-content` 时，stdout 还会输出：

```text
ENHANCE_CONTENT=true
ENHANCE_INPUT=<路径>
```

此时 skill 必须继续执行 `enhance-content --input "<OUTPUT_FILE>"`。

**错误处理：**
- 未安装 `markitdown`：说明环境初始化未完成或依赖安装失败，按 init.md 的全局自检规则处理
- 输入文件不存在：提示检查路径
- 转换结果为空：提示检查源文件格式是否受支持

完成后输出：
```
✅ doc-to-md 完成！
文件：<路径>

⚡ 自动进入步骤二 enhance-content（图片分析与内容增强）...
```
