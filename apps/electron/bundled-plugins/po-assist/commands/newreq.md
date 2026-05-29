---
description: 创建或复用正式需求空间并进入 PRD 起草
argument-hint: "[需求编号或需求标题] [--init-only]"
---

执行 po-skill 新需求初始化。

输入：$ARGUMENTS

## 执行规则

1. 按 po-skill 中对应步骤执行；不要把项目工作区中的 `common/` 或 `steps/` 当作内部目录
2. 从输入中识别需求编号、需求标题和 `--init-only`
3. 执行 `run.py newreq`：
   - 已有需求编号：`python ${CLAUDE_PLUGIN_ROOT}/skills/po-skills/run.py newreq --reqid "<REQID>" --title "<标题>"`
   - 无需求编号：`python ${CLAUDE_PLUGIN_ROOT}/skills/po-skills/run.py newreq --title "<标题>" --mock`
   - 仅初始化：追加 `--init-only`
4. 从 stdout 读取 `REQID`、`REQ_ROOT`、`DESIGN_DIR`、`REFERENCES_DIR`、`NEXT_STEP`
5. 输入中包含 Wiki URL、飞书文档 URL 或本地文档路径时，先执行 `run.py newreq` 创建或复用需求空间，再将资料转换到 `REFERENCES_DIR`：
   - Wiki / 飞书 URL：`python ${CLAUDE_PLUGIN_ROOT}/skills/po-skills/run.py doc-convert --url "<URL>" --output-dir "<REFERENCES_DIR>"`
   - 本地 `.doc/.docx/.pdf`：`python ${CLAUDE_PLUGIN_ROOT}/skills/po-skills/run.py doc-to-md --file "<文件路径>" --output-dir "<REFERENCES_DIR>"`
   - 不得先转换到 `raw/` 再搬运；参考资料默认归入新需求空间的 `REFERENCES/`，且转换脚本会自动落到 `REFERENCES/<文档名>/`
   - 转换成功后必须先读取转换后的 Markdown 内容，再按 brainstorming 风格做单题澄清：先输出上下文理解，再只输出第一个最关键问题；问题必须提供 2-4 个选项。不得在未阅读参考资料前输出澄清问题，不得一次性输出待澄清问题清单或启动未读资料的 brainstorming。
   - 转换过程中遇到 `HTSC_WIKI_TOKEN 未设置` 或 `WIKI_TOKEN_REQUIRED=true` 时，停止后续 brainstorming 或 PRD 串联，询问用户提供 Wiki Personal Access Token；用户提供后自动创建或更新 当前技能目录下的 `.env`，重新执行刚才失败的转换命令，再继续阅读参考资料。
6. 若 `NEXT_STEP=prd-write` 且用户未指定 `--init-only`，继续执行 `prd-write`，并把已进入 `REFERENCES_DIR` 的资料作为 PRD 参考资料
7. 若 `--init-only`，只告知用户需求空间已创建或复用
