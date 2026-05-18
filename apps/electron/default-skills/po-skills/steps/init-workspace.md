# 内部子步骤：init-workspace（全局工作空间初始化）

**触发场景：** `/init-workspace` 或 `newreq` 检测到全局工作空间缺失时。

**职责：** 初始化 `raw/`、`wiki/`、`newreq/` 和 `newreq/req.index`。
- 只创建全局工作空间骨架
- 不创建任何具体需求目录
- 不输出 `NEXT_STEP`
- 不调用 `prd-write`

## 执行

```bash
python ${CLAUDE_PLUGIN_ROOT}/skills/po-skills/run.py init-workspace [--force]
```

## 参数

- `--force`：补齐缺失说明文件，不覆盖已有业务文件。

## stdout 契约

执行成功后必须从 stdout 读取：

```text
RAW_DIR=raw
WIKI_DIR=wiki
NEWREQ_DIR=newreq
REQ_INDEX=newreq/req.index
CREATED=true
```

## 完成输出

只用产品语言说明工作空间已准备好，不向用户暴露脚本路径或 stdout 字段。

必须同时向用户说明各目录的基本用途：

- `raw/`：临时放置原始材料、未归属到具体需求的转换中间产物。
- `wiki/`：放置批量导出的 Wiki 知识库内容。
- `newreq/`：正式需求空间；后续每个需求会放在 `newreq/<REQID>/` 下。
- `newreq/req.index`：本地需求索引，用来记录已初始化的需求空间。

推荐输出示例：

```text
PO 工作空间已准备就绪。当前已初始化 raw、wiki 和 newreq：

- raw：临时存放原始材料和未归属需求的转换结果。
- wiki：存放批量导出的 Wiki 知识库内容。
- newreq：正式需求空间，后续每个需求都会放在 newreq/<REQID>/ 下。
- newreq/req.index：记录本地已初始化的需求空间。

现在可以继续创建需求或转换文档。
```
