---
description: 创建或复用正式需求空间并进入 PRD 起草
argument-hint: "[需求编号或需求标题] [--init-only]"
---

执行 po-skill 新需求初始化。

输入：$ARGUMENTS

## 执行规则

1. 首先 `read` 公共模块：`<技能根目录>/common/init.md`
2. 再读取 `<技能根目录>/steps/newreq.md`
3. 从输入中识别需求编号、需求标题和 `--init-only`
4. 执行 `run.py newreq`：
   - 已有需求编号：`python <技能根目录>/run.py newreq --reqid "<REQID>" --title "<标题>"`
   - 无需求编号：`python <技能根目录>/run.py newreq --title "<标题>" --mock`
   - 仅初始化：追加 `--init-only`
5. 从 stdout 读取 `REQID`、`REQ_ROOT`、`DESIGN_DIR`、`REFERENCES_DIR`、`NEXT_STEP`
6. 若 `NEXT_STEP=prd-write` 且用户未指定 `--init-only`，继续执行 `prd-write`
7. 若 `--init-only`，只告知用户需求空间已创建或复用
