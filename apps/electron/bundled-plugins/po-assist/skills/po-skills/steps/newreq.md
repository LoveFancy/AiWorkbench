# 内部子步骤：newreq（正式需求初始化）

**触发场景：** `/newreq`、`prd-write` 首次创建需求空间、独立 `brainstorming --save` 且缺少 REQID。

**职责：** 创建或复用 `newreq/<REQID>/`，维护 `newreq/req.index`，并在默认模式下串联 `prd-write`。

## 执行规则

1. 从用户输入中识别需求编号、标题和 `--init-only`。
2. 有 `REQID` 时执行：
   ```bash
   python ${CLAUDE_PLUGIN_ROOT}/skills/po-skills/run.py newreq --reqid "<REQID>" --title "<标题>"
   ```
3. 无 `REQID` 时执行：
   ```bash
   python ${CLAUDE_PLUGIN_ROOT}/skills/po-skills/run.py newreq --title "<标题>" --mock
   ```
4. 仅初始化时追加 `--init-only`。

## stdout 契约

执行成功后必须读取：

```text
REQID=<REQID>
REQ_ROOT=newreq/<REQID>
DESIGN_DIR=newreq/<REQID>/1.产品设计
REFERENCES_DIR=newreq/<REQID>/references
REFERENCE_IMAGES_DIR=newreq/<REQID>/references/images
IMAGES_DIR=newreq/<REQID>/1.产品设计/images
REQ_INDEX=newreq/req.index
CREATED=<true|false>
REUSED=<true|false>
INDEX_UPDATED=<true|false>
NEXT_STEP=<prd-write 或空>
```

## 串联规则

- `NEXT_STEP=prd-write` 且用户未指定 `--init-only`：继续执行 `prd-write`。
- `--init-only` 或 `NEXT_STEP=`：停止在初始化结果，不进入 `prd-write`。

## 完成输出

只告诉用户需求空间已创建或已复用，并说明下一步是否进入 PRD 起草；不要暴露内部 stdout 字段。

## 字段清单

- `REQID`
- `REQ_ROOT`
- `DESIGN_DIR`
- `REFERENCES_DIR`
- `REFERENCE_IMAGES_DIR`
- `IMAGES_DIR`
- `REQ_INDEX`
- `CREATED`
- `REUSED`
- `INDEX_UPDATED`
- `NEXT_STEP`
