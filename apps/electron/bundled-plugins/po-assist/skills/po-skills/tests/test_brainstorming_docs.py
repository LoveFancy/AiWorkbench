from pathlib import Path


SKILL_ROOT = Path(__file__).resolve().parents[1]
SRC_ROOT = Path(__file__).resolve().parents[2]


def test_brainstorming_command_and_step_exist():
    command = SRC_ROOT / "commands" / "brainstorming.md"
    step = SKILL_ROOT / "steps" / "brainstorming.md"
    template = SKILL_ROOT / "references" / "brainstorming-template.md"

    assert command.is_file()
    assert step.is_file()
    assert template.is_file()

    command_content = command.read_text(encoding="utf-8")
    assert "description: 产品阶段头脑风暴与需求澄清" in command_content
    assert "--continue-prd" in command_content

    step_content = step.read_text(encoding="utf-8")
    assert "不引入 Visual Companion" in step_content
    assert "PRD 写作参考" in step_content
    assert "PRD_INPUT_SUMMARY" not in step_content
    assert "需求评审" in step_content
    assert "不要逐项机械询问" in step_content
    assert "提问前必须先理解项目 / 文档上下文" in step_content
    assert "先阅读用户提供的文档、片段、链接摘要或项目背景" in step_content
    assert "识别到 REQID 或 `newreq/<REQID>` 路径时" in step_content
    assert "必须先理解整个需求空间" in step_content
    assert "`newreq/<REQID>/references/`" in step_content
    assert "先输出一段简短的上下文理解" in step_content
    assert "如果上下文文档已经明确回答了某个问题" in step_content
    assert "收敛判断" in step_content
    assert "默认一次只问 1 个问题" in step_content
    assert "每个问题优先提供 2-4 个选项" in step_content
    assert "用户可以直接回复选项字母" in step_content
    assert "问题之间有依赖关系时必须按顺序提问" in step_content
    assert "本文件不是照搬其工程化流程" in step_content
    assert "你问了什么" in step_content
    assert "用户怎么回答" in step_content

    template_content = template.read_text(encoding="utf-8")
    assert "## 0. 上下文理解" in template_content
    assert "## 2. 澄清问答" in template_content
    assert "Q{N}" in template_content
    assert "用户答复：" in template_content
    assert "这一节记录已经达成一致、可快速扫读的结构化结论" in template_content
    assert "## 7. PRD 写作参考" in template_content
    assert "这一节面向后续 `prd-write`" in template_content
    assert "PRD_INPUT_SUMMARY" not in template_content


def test_skill_routes_brainstorming_and_req_review_distinctly():
    content = (SKILL_ROOT / "SKILL.md").read_text(encoding="utf-8")
    req_review = (SKILL_ROOT / "steps" / "req-review.md").read_text(encoding="utf-8")

    assert '"需求澄清"' in content
    assert '"需求评审"' in content
    assert "| 产品头脑风暴 / 需求澄清请求 | brainstorming | `steps/brainstorming.md` |" in content
    assert "| brainstorming | 无外部依赖" in content
    assert '或"需求评审"或"需求审查"或"需求质量检查"' in req_review
    assert '或"需求澄清"或"需求审查"或"需求质量检查"' not in req_review
    assert "由 `prd-write` 在已确认需求空间后执行内部 `brainstorming` 阶段" in content
    assert "自由想法 → newreq → prd-write → brainstorming（按需）→ 回到 prd-write" in content
    step = (SKILL_ROOT / "steps" / "brainstorming.md").read_text(encoding="utf-8")
    assert "默认询问用户是否继续进入 `/prd-write`" in step
    assert "/po-assist:prd-write" not in step


def test_prd_write_mentions_brainstorming_intermediate_step():
    content = (SKILL_ROOT / "steps" / "prd-write.md").read_text(encoding="utf-8")

    assert "阶段 A.5：需求成熟度判断与内部 brainstorming 串联" in content
    assert "此阶段发生在 `prd-write` 内部" in content
    assert "头脑风暴纪要" in content
    assert "PRD 写作参考" in content
    assert "PRD_INPUT_SUMMARY" not in content
    assert "直接写 PRD" in content


def test_prd_write_creates_mock_req_before_reference_conversion_when_reqid_missing():
    content = (SKILL_ROOT / "steps" / "prd-write.md").read_text(encoding="utf-8")
    skill = (SKILL_ROOT / "SKILL.md").read_text(encoding="utf-8")
    init = (SKILL_ROOT / "common" / "init.md").read_text(encoding="utf-8")

    assert "无明确需求编号时，不追问，直接执行 `newreq --mock`" in content
    assert "先创建或复用正式需求空间，再转换和理解可访问的关联文档" in content
    assert "无 REQID → 直接执行 `newreq --mock`" in skill
    assert "无明确需求编号时，直接使用 `newreq --mock`" in init
    assert "无 REQID → 先询问用户" not in skill


def test_prd_write_routes_reference_wiki_to_references_dir_not_design_dir():
    content = (SKILL_ROOT / "steps" / "prd-write.md").read_text(encoding="utf-8")
    init = (SKILL_ROOT / "common" / "init.md").read_text(encoding="utf-8")

    assert "Wiki URL 在 `prd-write` 中属于关联文档" in content
    assert 'doc-convert --url "<URL>" --output-dir "{REFERENCES_DIR}"' in content
    assert 'doc-convert --url "<URL>" --reqid "{REQID}"' not in content
    assert "关联资料默认进入 `{REFERENCES_DIR}`" in init


def test_prd_write_focuses_on_delta_when_reference_is_legacy_document():
    content = (SKILL_ROOT / "steps" / "prd-write.md").read_text(encoding="utf-8")
    template = (SKILL_ROOT / "references" / "prd-template.md").read_text(encoding="utf-8")

    assert "存量文档 + 新变更诉求" in content
    assert "不要把存量文档里的老逻辑完整复述成新 PRD 正文" in content
    assert "新 PRD 正文重点写新增/变更内容" in content
    assert "存量文档差异化写作规则" in template
    assert "重点描述本次新增、修改、删除的内容" in template


def test_prd_outputs_keep_diagrams_optional_for_simple_stories():
    prd_write = (SKILL_ROOT / "steps" / "prd-write.md").read_text(encoding="utf-8")
    prd_convert = (SKILL_ROOT / "steps" / "prd-convert.md").read_text(encoding="utf-8")
    prd_template = (SKILL_ROOT / "references" / "prd-template.md").read_text(encoding="utf-8")
    story_template = (SKILL_ROOT / "references" / "story-template.md").read_text(encoding="utf-8")
    convert_prompt = (SKILL_ROOT / "references" / "prd-convert-prompt.md").read_text(encoding="utf-8")

    assert "简单 Story 只要用文字、表格和验收用例能说明白" in prd_write
    assert "不要强制补流程图、时序图、架构图或占位原型图" in prd_write
    assert "流程图仅在存在多步骤流转" in prd_write
    assert "不要输出空图、占位图、`path/to/mockup.png`" in prd_write

    assert "简单 Story 不要为了套模板强制补流程图" in prd_convert
    assert "按需提取" in prd_convert
    assert "简单 Story 删除此章节" in story_template
    assert "不要为了套模板强制补流程图" in story_template

    assert "简单 Story 不强制绘制流程图" in prd_template
    assert "不要生成 `path/to/mockup.png`" in prd_template
    assert "图示按需" in convert_prompt


def test_prd_write_requires_plain_language_analysis_and_research():
    content = (SKILL_ROOT / "steps" / "prd-write.md").read_text(encoding="utf-8")

    assert "你是一位经验丰富的产品经理" in content
    assert "正式需求说明" in content
    assert "指导后续开发和验收工作" in content
    assert "站在产品负责人的角度" in content
    assert "四问分析" in content
    assert "我们正在解决什么问题" in content
    assert "我们是在为谁解决问题" in content
    assert "我们如何衡量成功" in content
    assert "限制条件和假设" in content
    assert "小学毕业生能读懂" in content
    assert "格式良好的 Markdown 文档" in content
    assert "必须先仔细阅读/转换/摘要后再写" in content
    assert "必须通过网络搜索补充背景信息和市场分析数据" not in content


def test_workspace_commands_have_matching_step_files():
    init_command = (SRC_ROOT / "commands" / "init-workspace.md").read_text(encoding="utf-8")
    newreq_command = (SRC_ROOT / "commands" / "newreq.md").read_text(encoding="utf-8")
    init_step = (SKILL_ROOT / "steps" / "init-workspace.md").read_text(encoding="utf-8")
    newreq_step = (SKILL_ROOT / "steps" / "newreq.md").read_text(encoding="utf-8")

    assert "steps/init-workspace.md" in init_command
    assert "steps/newreq.md" in newreq_command
    assert "stdout 契约" in init_step
    assert "CREATED=true" in init_step
    assert "stdout 契约" in newreq_step
    assert "NEXT_STEP=<prd-write 或空>" in newreq_step
    assert "串联规则" in newreq_step


def test_image_analyse_command_and_step_exist():
    command = (SRC_ROOT / "commands" / "image-analyse.md").read_text(encoding="utf-8")
    step = (SKILL_ROOT / "steps" / "image-analyse.md").read_text(encoding="utf-8")
    skill = (SKILL_ROOT / "SKILL.md").read_text(encoding="utf-8")

    assert "description: 从界面截图还原字段说明表" in command
    assert "执行 po-skill `image-analyse` 步骤" in command
    assert "steps/image-analyse.md" in command
    assert "字段名称、字段类型、字段描述/逻辑、字段取值、是否必填、交互说明、备注" in step
    assert "| 字段名称 | 字段类型 | 字段描述/逻辑 | 字段取值 | 是否必填 | 交互说明 | 备注 |" in step
    assert "独立入口" in step
    assert "image-analyse" in skill
    assert "image-to-fields" not in skill
    assert "截图字段表" in skill


def test_image_analyse_describes_buttons_with_button_table():
    step = (SKILL_ROOT / "steps" / "image-analyse.md").read_text(encoding="utf-8")

    assert "如果图片的页面上有按钮" in step
    assert "按钮名称、业务逻辑、交互说明、备注" in step
    assert "| 按钮名称 | 业务逻辑 | 交互说明 | 备注 |" in step
    assert "取消所有录入信息" in step
    assert "保存录入信息，回到上一级页面" in step


def test_newdiagram_supports_mermaid_and_drawio_output_formats():
    command = (SRC_ROOT / "commands" / "newdiagram.md").read_text(encoding="utf-8")
    step = (SKILL_ROOT / "steps" / "newdiagram.md").read_text(encoding="utf-8")
    skill = (SKILL_ROOT / "SKILL.md").read_text(encoding="utf-8")

    assert "description: 创建本地 Mermaid 或 drawio 图文件" in command
    assert "steps/newdiagram.md" in command
    assert "newdiagram" in skill
    assert "drawio" in skill
    assert "默认输出 `.mmd` Mermaid 文件" in step
    assert "用户明确要求 drawio" in step
    assert "直接生成本地 `.drawio` 文件" in step
    assert "不要求 Mermaid 直接转换为 drawio" in step
    assert "^[A-Z]+-\\d+$" in step
    assert "newreq/<REQID>/diagrams/[DIAGRAM]<标题>.mmd" in step
    assert "newreq/<REQID>/diagrams/[DIAGRAM]<标题>.drawio" in step
    assert "newreq/<REQID>/1.产品设计/images/[流程图]<标题>.svg" in step
    assert "diagrams/[DIAGRAM]<标题>.mmd" in step
    assert "diagrams/[DIAGRAM]<标题>.drawio" in step
    assert "app.dragiam.net" not in step


def test_newdiagram_includes_default_rendering_spec():
    step = (SKILL_ROOT / "steps" / "newdiagram.md").read_text(encoding="utf-8")

    assert "## Mermaid 生成规范" in step
    assert "默认使用 `flowchart TD`" in step
    assert "边标签必须使用双引号包裹" in step
    assert 'A -->|"验证失败（密码错误）"| B' in step
    assert "Mermaid 文件只保存 Mermaid 源码" in step
    assert "## drawio 生成规范" in step
    assert "Top-to-Bottom" in step
    assert "主流程（Yes/通过）必须保持在同一垂直中心线上" in step
    assert "节点间纵向间距固定为 80px" in step
    assert "横向分支间距固定为 150px" in step
    assert "统一宽度为 160px" in step
    assert "rounded=1" in step
    assert "orthogonal" in step
    assert "否/异常" in step
    assert "#D5E8D4" in step
    assert "#82B366" in step
    assert "#DAE8FC" in step
    assert "#6C8EBF" in step
    assert "#FFF2CC" in step
    assert "#D6B656" in step
    assert "#F8CECC" in step
    assert "#B85450" in step


def test_newdiagram_documents_drawio_xml_compatibility_constraints():
    step = (SKILL_ROOT / "steps" / "newdiagram.md").read_text(encoding="utf-8")

    assert "不要在 mxCell 之间插入 XML 注释" in step
    assert "`<!-- -->`" in step
    assert "rhombus" in step
    assert "菱形节点" in step
    assert "不得使用 `rounded=1`" in step
