---
description: 一键运行完整 PO 工作流
argument-hint: [wiki-url 或 本地文件路径]
---

执行 po-skill 完整工作流。

输入：$ARGUMENTS

## 执行规则

## 启动前说明（强制）

开始执行任何 read、glob、bash、脚本或文件写入之前，必须先完整说明本次 full 工作流的全部步骤，不得只说“步骤 1/5”或只展示当前进度。

必须向用户说明完整链路：

```text
init-workspace → newreq → doc-convert → story-analyze → prd-convert → req-review
```

说明时必须包含：
- `init-workspace`：初始化工作空间骨架。
- `newreq`：创建或复用正式需求目录；如果没有真实需求编号，使用 mock 需求编号承接本次工作。
- `doc-convert`：把 Wiki URL / 本地文档转换为 `[PROD_ORI]` Markdown，正式链路输出到 `newreq/<REQID>/1.产品设计/`；EIP/LinkApp 云文档暂不支持自动下载，需用户手工下载后作为本地文件转换。
- `story-analyze`：按 Story-Feature-MUC 规则生成三层结构表，写入 `[PROD_ORI]`；story-analyze 后会暂停等待确认。
- `prd-convert`：基于已确认的三层结构生成 `[PROD_FORMAT]` 和独立 Story 文档。
- `req-review`：按需求评审 10 项模板输出质量审查报告；req-review 后会暂停等待确认。

说明完完整流程后，再开始执行第一个步骤。

这是全链路指令，按以下顺序依次执行。每个步骤执行前加载对应的 `steps/*.md` 文件获取详细指令。

1. **工作空间初始化**：先执行 `init-workspace`
2. **正式需求空间**：执行 `newreq --init-only` 创建或复用正式需求目录；无真实需求编号时使用 mock 需求编号
3. **文档转换**：用户侧进入 doc-convert 入口；执行时按输入类型分流（Wiki/JSON → doc-convert，本地文档 → doc-to-md；EIP/LinkApp 云文档提示手工下载），有图片则自动串联 enhance-content
4. **story-analyze**：分析三层结构，输出后暂停等待用户确认
5. **prd-convert**：生成结构化 PRD 与独立 Story 文档
6. **req-review**：PRD 质量审查，完成后暂停等待确认

## req-review 串联约束

进入第 5 步时，不得自行生成 PRD 质量审查报告，不得使用通用 PRD 完整性检查口径。
必须完整加载 `steps/req-review.md` 和 `references/req-review-prompt.md`，并严格按其中的输出格式执行。
必须输出 `req-review` 模板中的 10 项检查表，即：关联需求缺失、功能入口路径缺失、EARS 核心要素缺失、规则歧义、异常缺失、权限缺失、约束缺失、边界缺失、状态缺失、矛盾冲突。

每次进入新步骤前更新进度状态。
