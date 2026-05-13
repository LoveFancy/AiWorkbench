# 独立工具：wiki-export（Wiki 批量导出）

**触发词：** `wiki-export`、"批量导出 wiki"、"导出 wiki 目录"、"导出 wiki space"

**职责：** 使用 `confluence-markdown-exporter` 批量导出 Confluence Wiki 页面、页面树或 Space 为 Markdown 文件集合。

---

## 输入

```text
/wiki-export <Wiki URL...> [--output-dir <目录>] [--mode pages|tree|space]
```

支持一个或多个 Wiki URL。第一版不支持本地清单文件或目录输入。

---

## 导出范围判断

显式 `--mode` 优先：

| 参数 | 含义 |
|------|------|
| `--mode pages` | 只导出传入页面本身；多个 URL 时批量导出多个页面 |
| `--mode tree` | 导出传入页面及所有子页面；多个 URL 时分别导出每棵页面树 |
| `--mode space` | 导出整个 Space；多个 URL 时分别导出多个 Space |

未传 `--mode` 时按语义判断：

| 用户表达 | mode |
|----------|------|
| "只导出这个页面"、"导出当前页面"、"把这几个 Wiki 都导出" | `pages` |
| "连同子页面"、"下面所有子页面"、"导出这棵树"、"目录树" | `tree` |
| "整个 Space"、"整个空间"、"全部空间文档" | `space` |

语义不明确时必须追问：

```text
你希望只导出当前页面，还是连同它下面的子页面一起导出？
```

如果输入多个页面 URL，但只表达"导出这些 Wiki / 批量导出这些链接"，默认使用 `pages`。只有明确提到"子页面"、"目录树"、"下级页面"等范围词时，才使用 `tree`。

禁止在语义不清时默认 `tree` 或 `space`。

---

## 输出目录

用户指定保存目录时，必须按用户要求输出。包括：

- 显式参数：`--output-dir <目录>`
- 自然语言：例如"保存到 `./docs/wiki`"、"导出到 `REQ-123/0.关联知识/wiki-export`"

用户未指定保存目录时，自动生成：

```text
./tmp-wiki-export-<YYYYMMDD-HHMMSS>/
```

未指定目录时不得默认写入需求目录、`1.产品设计/` 或其他业务目录。

---

## 执行

执行前检查：

- 不要用 `echo $HTSC_WIKI_TOKEN` 检查 token；token 可能只写在 `.env` 中，不会出现在当前 shell 环境变量里。
- 直接运行 `run.py wiki-export ...`，由 wrapper 自动加载当前工作目录、`CLAUDE_PROJECT_DIR` 或 `po-skills` 目录下的 `.env`。
- wrapper 日志中出现 `token_configured=True` 或 `token status=configured` 即表示已读取到 token；日志不得打印 token 明文。
- 用户提供至少一个 Wiki URL
- mode 是 `pages`、`tree`、`space` 之一

## cme 调用示例

内部实际调用 `confluence-markdown-exporter` 的 `cme`，推荐按下面方式理解：

```bash
export CME_CONFIG_PATH="/tmp/wiki-export-cme/config.json"
export CME_EXPORT__OUTPUT_PATH="./tmp-wiki-export-demo"
export CME_EXPORT__ATTACHMENT_HREF="relative"
export CME_EXPORT__ATTACHMENT_EXPORT_ALL="false"

cme pages "http://wiki.htzq.htsc.com.cn/display/AI/周报"
cme pages-with-descendants "http://wiki.htzq.htsc.com.cn/display/AI/项目目录"
cme spaces "http://wiki.htzq.htsc.com.cn/display/AI"
```

`cme` 原生支持 `pageId` 链接，例如：

```bash
cme pages "http://wiki.htzq.htsc.com.cn/pages/viewpage.action?pageId=123456789"
```

命令示例：

```bash
python ${CLAUDE_PLUGIN_ROOT}/skills/po-skills/run.py wiki-export --mode pages "http://wiki.../pages/viewpage.action?pageId=123"
python ${CLAUDE_PLUGIN_ROOT}/skills/po-skills/run.py wiki-export --mode tree --output-dir "./tmp-wiki-export-demo" "http://wiki.../pages/viewpage.action?pageId=123"
python ${CLAUDE_PLUGIN_ROOT}/skills/po-skills/run.py wiki-export --mode space "http://wiki.../display/ABC"
```

多个 URL：

```bash
python ${CLAUDE_PLUGIN_ROOT}/skills/po-skills/run.py wiki-export --mode pages \
  "http://wiki.../pages/viewpage.action?pageId=123" \
  "http://wiki.../pages/viewpage.action?pageId=456"
```

---

## 图片与附件

图片和附件单独保存为文件，Markdown 中使用相对链接。不要把图片转成 base64，也不要内联到 Markdown。

批量导出默认不执行 `enhance-content`，不逐张读取图片，不自动做图片语义命名。若用户后续明确要求整理图片，再针对指定 Markdown 子集单独处理。

---

## 输出契约

成功后 stdout 包含：

```text
OUTPUT_DIR=<导出目录>
INDEX_FILE=<导出索引文件>
MODE=<pages|tree|space>
```

索引文件固定命名：

```text
[WIKI_EXPORT_INDEX]导出索引.md
```

完成后向用户汇总：

```text
Wiki 批量导出完成：
- 输出目录：<OUTPUT_DIR>
- 索引文件：<INDEX_FILE>
- 导出模式：<MODE>

下一步：你可以指定某个 Markdown 文件进入 /story-analyze，或作为 /prd-write 的参考资料。
```
