# 文件命名规范

本文件定义 po-skill 工作流内部的文件命名、目录放置和图片路径契约。最终生成的 PRD 和 Story 文档模板不重复展示这些规则。

| 前缀 | 含义 | 来源步骤 |
|------|------|----------|
| `[PROD_ORI]` | 自然语言原文，从 Wiki 转换，末尾包含 Story 三层结构分析附录 | 步骤一（doc-convert）+ 步骤二（story-analyze 追加附录） |
| `[STORY_PLAN]` | Story 规划 CSV（story_key + 名称/迭代/经办人等） | `story-create` 自动生成（从三层结构分析表提取），并消费 |
| `[PROD_FORMAT]` | 结构化 PRD，含 Story、功能点、EARS 描述 | 步骤三（prd-convert） |
| `[STORY_FORMAT][<story_key>]` | 单个 Story 的独立需求文档，放在 `PRODUCT_DESIGN/` 目录下 | 步骤三（prd-convert） |

## 目录约定

- 正式需求文件统一放在 `newreq/<REQID>/PRODUCT_DESIGN/` 目录下。
- 正式需求图片放在 `newreq/<REQID>/PRODUCT_DESIGN/images/`。
- 参考资料及其图片按文档放在 `newreq/<REQID>/REFERENCES/<文档名>/` 和 `newreq/<REQID>/REFERENCES/<文档名>/images/`。
- 临时转换文件放在 `raw/<文档名>/`，临时图片放在 `raw/<文档名>/images/`。

## 图片路径约定

图片路径必须使用相对于当前 Markdown 文件所在目录的相对路径。

- 禁止使用绝对路径、项目根路径、`file://` 路径或 Windows 盘符路径。
- 引用同级 `images/` 下图片时写成 `./images/<文件名>`。
- 引用参考资料图片时写成 `../REFERENCES/<文档名>/images/<文件名>`。
- 如跨目录相对路径无法稳定计算，先复制到当前文档同级 `images/` 后使用 `./images/<文件名>`。
