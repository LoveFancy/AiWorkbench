# 内部子步骤：newreq（正式需求初始化）

**触发场景：** `/newreq`、`prd-write` 首次创建需求空间、独立 `brainstorming --save` 且缺少 REQID。

**职责：** 创建或复用 `newreq/<REQID>/`，维护 `newreq/req.index`，并在默认模式下串联 `prd-write`。

若环境变量 `OUTPUT_PATH_PREFIX` 存在且非空，`run.py` 会将其作为工作空间根目录，并在 stdout 中输出带该根目录的完整路径；若未设置，则保持现有相对路径输出。路径拼接由脚本完成，skill 只消费 stdout 字段，不自行拼接环境变量。

## 执行规则

1. 从用户输入中识别需求编号、标题和 `--init-only`。
2. 有 `REQID` 时执行：
   ```bash
   python run.py newreq --reqid "<REQID>" --title "<标题>"
   ```
3. 无 `REQID` 时执行：
   ```bash
   python run.py newreq --title "<标题>" --mock
   ```
4. 仅初始化时追加 `--init-only`。

## stdout 契约

执行成功后必须读取：

```text
REQID=<REQID>
REQ_ROOT=newreq/<REQID>
DESIGN_DIR=newreq/<REQID>/PRODUCT_DESIGN
REFERENCES_DIR=newreq/<REQID>/REFERENCES
REFERENCE_IMAGES_DIR=
IMAGES_DIR=newreq/<REQID>/PRODUCT_DESIGN/images
REQ_INDEX=newreq/req.index
CREATED=<true|false>
REUSED=<true|false>
INDEX_UPDATED=<true|false>
NEXT_STEP=<prd-write 或空>
```

当 `OUTPUT_PATH_PREFIX=/app/docs/test_session_id/OUTPUT/` 时，目录字段示例：

```text
REQID=<REQID>
REQ_ROOT=/app/docs/test_session_id/OUTPUT/newreq/<REQID>
DESIGN_DIR=/app/docs/test_session_id/OUTPUT/newreq/<REQID>/PRODUCT_DESIGN
REFERENCES_DIR=/app/docs/test_session_id/OUTPUT/newreq/<REQID>/REFERENCES
REFERENCE_IMAGES_DIR=
IMAGES_DIR=/app/docs/test_session_id/OUTPUT/newreq/<REQID>/PRODUCT_DESIGN/images
REQ_INDEX=/app/docs/test_session_id/OUTPUT/newreq/req.index
```

## 串联规则

- 输入中包含 Wiki URL、飞书文档 URL 或本地文档路径时，先执行 `run.py newreq` 创建或复用需求空间，读取 stdout 中的 `REFERENCES_DIR`，再将资料转换到 `REFERENCES_DIR`。转换脚本会自动落到 `REFERENCES/<文档名>/[PROD_ORI]<文档名>.md`，图片位于 `REFERENCES/<文档名>/images/`。不得先转换到 `raw/` 再搬运。
- Wiki / 飞书 URL 使用：
  ```bash
  python run.py doc-convert --url "<URL>" --output-dir "<REFERENCES_DIR>"
  ```
- 本地 `.doc/.docx/.pdf` 使用：
  ```bash
  python run.py doc-to-md --file "<文件路径>" --output-dir "<REFERENCES_DIR>"
  ```
- 参考资料转换完成后，后续 `prd-write`、`brainstorming` 或手动澄清都必须把 `REFERENCES_DIR` 中的文档作为该需求的参考资料。
- 参考资料转换成功后，必须先读取转换后的 Markdown 内容，再按 `steps/brainstorming.md` 的交互约束做单题澄清：先输出上下文理解，再只输出第一个最关键问题；问题必须提供 2-4 个选项。不得在未阅读参考资料前输出澄清问题，不得一次性输出待澄清问题清单，也不得先启动 brainstorming 再补读参考资料。
- 转换过程中遇到 `HTSC_WIKI_TOKEN 未设置` 或 `WIKI_TOKEN_REQUIRED=true` 时，必须停止后续 brainstorming 或 PRD 串联，询问用户提供 Wiki Personal Access Token；用户提供后自动创建或更新 当前技能目录下的 `.env`，保留已有配置并写入或替换 `HTSC_WIKI_TOKEN`，然后重新执行刚才失败的转换命令，再继续阅读参考资料。
- `NEXT_STEP=prd-write` 且用户未指定 `--init-only`：继续执行 `prd-write`。
- `--init-only` 或 `NEXT_STEP=`：停止在初始化结果，不进入 `prd-write`。

## 完成输出

只告诉用户需求空间已创建或已复用，并说明下一步是否进入 PRD 起草；不要暴露内部 stdout 字段。

## 字段清单

- `REQID`
- `REQ_ROOT`
- `DESIGN_DIR`
- `REFERENCES_DIR`
- `REFERENCE_IMAGES_DIR`（兼容旧输出，当前为空；参考资料图片位于 `REFERENCES/<文档名>/images/`）
- `IMAGES_DIR`
- `REQ_INDEX`
- `CREATED`
- `REUSED`
- `INDEX_UPDATED`
- `NEXT_STEP`
