---
description: 将 Confluence wiki、飞书文档或本地文档转换为结构化 Markdown
argument-hint: [wiki-url、飞书文档 URL 或本地文件路径]
---

执行 po-skill 文档转换步骤。

输入：$ARGUMENTS

## 输入类型

收到 URL 或文件路径后先判断类型：

| 输入类型 | 识别特征 | 策略 |
|----------|----------|------|
| Wiki URL | `http://wiki...pageId=...` | `run.py doc-convert --url` |
| 飞书文档 | `*.feishu.cn/docx/`、`*.feishu.cn/wiki/`、`*.larksuite.com/docx/`、`*.larksuite.com/wiki/` | `run.py doc-convert --url`，内部转 `lark-doc-to-md` |
| Confluence API JSON | `.json` 文件且内容为 Confluence API 响应 | `run.py doc-convert --file` |
| EIP 文档 | `eip.htsc.com.cn/htscPortalDocs/` | 暂不支持自动下载；提示用户手工下载后再转换 |
| LinkApp 短链 | `linkapp.htsc.com.cn/S/` | 暂不支持自动下载；提示用户手工下载后再转换 |
| 本地文档 | `.docx` / `.pdf` / `.doc` 扩展名 | `run.py doc-to-md --file` |

**强制分流规则：** `/doc-convert` 是用户侧统一入口；`run.py doc-convert` 处理 Wiki URL、飞书 docx/wiki URL 和 Confluence API JSON。本地 `.doc/.docx/.pdf`、以及用户手工下载后的云文档文件，必须调用 `run.py doc-to-md --file`，由 markitdown 转换，禁止临时编写 `python-docx` / PDF 解析脚本替代。

## 执行规则

1. 首先 `read` 公共模块和步骤文件：`<技能根目录>/common/init.md`，以及对应的步骤文件（Wiki/JSON/飞书文档 → `doc-convert.md`，本地文档 → `doc-to-md.md`）
2. init.md 中的全局输出规范对本命令生效
3. 若识别到飞书文档 URL，直接执行 `run.py doc-convert --url "<飞书URL>"`；不要询问是否改用 `lark-doc`，不要要求用户二次确认。脚本会自动转调 `lark-doc-to-md`；如无 REQID / `--output-dir`，默认输出到 `raw/<飞书文档token>/`。
4. 非飞书输入如无 REQID，先询问用户；若只是临时转换，按输入类型处理：Wiki/JSON 使用 `doc-convert --raw`；本地文档使用 `doc-to-md --output-dir raw`，不得给 `doc-to-md` 传 `--raw`
5. 若识别到 EIP / LinkApp 云文档 URL，不要调用 chrome-devtools、不要派发 subagent、不要进入浏览器下载流程；直接返回：

```text
CLOUD_DOC_MANUAL_DOWNLOAD_REQUIRED：暂不支持自动下载 EIP/LinkApp 云文档。
请先在浏览器中手工下载原始 .doc/.docx/.pdf 文件，然后使用 /doc-convert <本地文件路径> 继续转换。
```

6. 飞书文档下载会直接把 `internal-api-drive-stream.feishu.cn` 图片落盘到同级 `images/` 并改写为 `./images/...`
7. 完成后如有图片引用，按图片数量决定是否继续图片转换 / `enhance-content`：图片数量 ≤ 20 时继续加载 `<技能根目录>/steps/enhance-content.md` 并执行；图片数量 > 20 时，先询问用户是否需要转换图片，用户确认后再执行 `enhance-content`。

完成后输出汇总，引导下一步 `/story-analyze`。
