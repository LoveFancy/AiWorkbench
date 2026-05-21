# 文件命名约定

| 前缀 | 含义 | 来源步骤 |
|------|------|----------|
| `[PROD_ORI]` | 自然语言原文，从 Wiki 转换，末尾包含 Story 三层结构分析附录 | 步骤一（doc-convert）+ 步骤二（story-analyze 追加附录） |
| `[STORY_PLAN]` | Story 规划 CSV（story_key + 名称/迭代/经办人等） | `story-create` 自动生成（从三层结构分析表提取），并消费 |
| `[PROD_FORMAT]` | 结构化 PRD，含 Story、功能点、EARS 描述 | 步骤三（prd-convert） |
| `[STORY_FORMAT][<story_key>]` | 单个 Story 的独立需求文档，放在 `1.产品设计/` 目录下 | 步骤三（prd-convert） |
