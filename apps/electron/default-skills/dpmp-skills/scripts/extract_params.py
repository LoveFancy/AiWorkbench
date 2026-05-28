"""
参数提取指导命令

为 LLM 提供从自然语言中提取结构化参数的指导，不直接解析自然语言，
而是提供模板和指导让 LLM 来理解用户意图。
"""

import argparse
import sys
import json


def main(args=None):
    """参数提取指导主函数"""
    parser = argparse.ArgumentParser(
        prog="extract-params",
        description="参数提取指导 - 为 LLM 提供从自然语言中提取结构化参数的指导",
        epilog="示例: run.py extract-params --text \"创建一个客户管理系统的需求\""
    )

    parser.add_argument("--text", required=True, help="用户输入的自然语言描述")
    parser.add_argument("--format", choices=["json", "text"], default="json",
                       help="输出格式: json 或 text")

    if args is None:
        args = sys.argv[1:]
    opts = parser.parse_args(args)

    # 分析用户输入，提供提取指导
    user_input = opts.text
    guidance = generate_extraction_guidance(user_input)

    if opts.format == "json":
        print(json.dumps(guidance, indent=2, ensure_ascii=False))
    else:
        print_guidance_text(guidance)


def generate_extraction_guidance(user_input):
    """生成参数提取指导"""

    # 分析用户意图
    intent = analyze_intent(user_input)
    operation_type = intent["operation_type"]
    entity_type = intent["entity_type"]

    # 获取模板信息
    template_info = get_template_info(operation_type, entity_type)

    # 生成提取指导步骤
    extraction_steps = generate_extraction_steps(operation_type, entity_type)

    # 构建完整的指导信息
    guidance = {
        "user_input": user_input,
        "task_description": "从自然语言描述中提取结构化参数",
        "intent_analysis": intent,
        "extraction_guidance": extraction_steps,
        "suggested_template": template_info["template_name"],
        "template_info": template_info,
        "field_descriptions": get_field_descriptions(entity_type, operation_type)
    }

    return guidance


def analyze_intent(text):
    """分析用户意图"""
    text_lower = text.lower()

    # 判断操作类型
    operation_type = "unknown"
    if any(word in text_lower for word in ["创建", "新建", "添加", "create", "add"]):
        operation_type = "create"
    elif any(word in text_lower for word in ["状态", "status"]):
        operation_type = "update_status"
    elif any(word in text_lower for word in ["更新", "修改", "编辑", "update", "modify"]):
        operation_type = "update"
    elif any(word in text_lower for word in ["查询", "查看", "查找", "search", "query", "find"]):
        operation_type = "query"

    # 判断实体类型
    entity_type = "unknown"
    if any(word in text_lower for word in ["需求", "req", "requirement"]):
        entity_type = "req"
    elif any(word in text_lower for word in ["任务", "story", "task"]):
        entity_type = "story"

    return {
        "operation_type": operation_type,
        "entity_type": entity_type,
        "confidence": "medium"  # 低、中、高
    }


def get_template_info(operation_type, entity_type):
    """获取模板信息"""
    templates = {
        "create_req": {
            "template_name": "create_req",
            "entity_type": "req",
            "operation_type": "create",
            "required_fields": ["productkey", "name", "priorityLevel", "description", "demandoriginator", "reqdocurl", "reqdoctype", "reporter", "assignee"],
            "optional_fields": ["vipreq"],
            "cli_command": "create-req",
            "api_endpoint": "/api/req/addreq"
        },
        "update_req": {
            "template_name": "update_req",
            "entity_type": "req",
            "operation_type": "update",
            "required_fields": ["code"],
            "optional_fields": ["name", "priorityLevel", "description", "demandoriginator", "reporter", "assignee"],
            "cli_command": "update-req",
            "api_endpoint": "/api/req/updatereq"
        },
        "query_req": {
            "template_name": "query_req",
            "entity_type": "req",
            "operation_type": "query",
            "required_fields": [],
            "optional_fields": ["code", "assignee", "reporter", "iteration", "status"],
            "cli_command": "query-req",
            "api_endpoint": "/api/req/queryreqbyconditions"
        },
        "create_story": {
            "template_name": "create_story",
            "entity_type": "story",
            "operation_type": "create",
            "required_fields": ["name", "priorityLevel", "description", "reporter", "assignee", "projectkey"],
            "optional_fields": ["reqcode", "planstart", "planend", "storypoint", "iterationname", "plandevend", "plantestend"],
            "cli_command": "create-story",
            "api_endpoint": "/api/story/addstory"
        },
        "update_story": {
            "template_name": "update_story",
            "entity_type": "story",
            "operation_type": "update",
            "required_fields": ["code"],
            "optional_fields": ["name", "priorityLevel", "description", "assignee", "planend"],
            "cli_command": "update-story",
            "api_endpoint": "/api/story/updatestory"
        },
        "query_story": {
            "template_name": "query_story",
            "entity_type": "story",
            "operation_type": "query",
            "required_fields": [],
            "optional_fields": ["code", "assignee", "reporter", "iteration", "status"],
            "cli_command": "query-story",
            "api_endpoint": "/api/story/querystorybyconditions"
        },
        "update_status": {
            "template_name": "update_status",
            "entity_type": "both",  # req 或 story
            "operation_type": "update_status",
            "required_fields": ["code", "statusname"],
            "optional_fields": ["type"],  # req 或 story
            "cli_command": "update-status",
            "api_endpoint": "/api/req/updatestatus 或 /api/story/updatestatus"
        }
    }

    # 根据操作类型和实体类型选择模板
    if operation_type == "create" and entity_type == "req":
        return templates["create_req"]
    elif operation_type == "update" and entity_type == "req":
        return templates["update_req"]
    elif operation_type == "query" and entity_type == "req":
        return templates["query_req"]
    elif operation_type == "create" and entity_type == "story":
        return templates["create_story"]
    elif operation_type == "update" and entity_type == "story":
        return templates["update_story"]
    elif operation_type == "query" and entity_type == "story":
        return templates["query_story"]
    elif operation_type == "update_status":
        return templates["update_status"]
    else:
        # 返回通用指导
        return {
            "template_name": "generic",
            "entity_type": entity_type,
            "operation_type": operation_type,
            "required_fields": [],
            "optional_fields": [],
            "cli_command": "unknown",
            "api_endpoint": "unknown"
        }


def generate_extraction_steps(operation_type, entity_type):
    """生成提取指导步骤"""
    steps = []

    steps.append("1. **分析用户意图**: 判断用户想要执行什么操作（创建、更新、查询、状态更新）")
    steps.append("2. **识别操作对象**: 判断操作对象是 REQ（需求）还是 STORY（任务）")

    if operation_type == "create":
        steps.append("3. **提取创建参数**: 从描述中提取创建所需的字段")
        steps.append("4. **标记必需字段**: 识别哪些字段是必需的，哪些是可选的")
        steps.append("5. **处理缺失字段**: 对于缺失的必需字段，需要向用户询问")
    elif operation_type == "update":
        steps.append("3. **识别更新对象**: 提取要更新的 REQ/STORY 编号（code）")
        steps.append("4. **提取更新字段**: 从描述中提取需要更新的字段")
        steps.append("5. **验证字段有效性**: 确保更新的字段是允许修改的")
    elif operation_type == "query":
        steps.append("3. **提取查询条件**: 从描述中提取查询条件（编号、经办人、状态等）")
        steps.append("4. **构建查询参数**: 将条件转化为查询参数")
    elif operation_type == "update_status":
        steps.append("3. **提取状态信息**: 提取要更新的编号（code）和新的状态名称")
        steps.append("4. **确定对象类型**: 判断是更新 REQ 状态还是 STORY 状态")

    steps.append("6. **格式化参数**: 将提取的参数格式化为结构化数据")
    steps.append("7. **向用户确认**: 展示提取的参数，让用户确认")

    return steps


def get_field_descriptions(entity_type, operation_type):
    """获取字段描述"""
    field_descriptions = {
        "req": {
            "productkey": {"zh": "产品空间key", "en": "Product space key", "required": True, "example": "PRODU, S0305"},
            "name": {"zh": "REQ名称", "en": "REQ name", "required": True, "example": "客户管理系统"},
            "priorityLevel": {"zh": "优先级", "en": "Priority level", "required": True, "example": "紧急(致命), 高(一般), 中(轻微)"},
            "description": {"zh": "详细描述", "en": "Detailed description", "required": True, "example": "需要支持客户标签管理功能"},
            "demandoriginator": {"zh": "需求提出人工号", "en": "Demand originator AD account", "required": True, "example": "012950"},
            "reporter": {"zh": "报告人工号", "en": "Reporter AD account", "required": True, "example": "012950"},
            "assignee": {"zh": "经办人工号", "en": "Assignee AD account", "required": True, "example": "012950"},
            "reqdocurl": {"zh": "需求文档URL", "en": "Requirement document URL", "required": True, "example": "http://example.com/doc"},
            "reqdoctype": {"zh": "需求文档类型", "en": "Requirement document type", "required": True, "example": "需求文档"},
            "vipreq": {"zh": "重大需求", "en": "VIP requirement", "required": False, "example": "Y/N"},
            "code": {"zh": "REQ编号", "en": "REQ code", "required": True, "example": "PRODU-1079"}
        },
        "story": {
            "name": {"zh": "STORY名称", "en": "STORY name", "required": True, "example": "客户标签管理"},
            "priorityLevel": {"zh": "优先级", "en": "Priority level", "required": True, "example": "紧急(致命), 高(一般), 中(轻微)"},
            "description": {"zh": "详细描述", "en": "Detailed description", "required": True, "example": "实现客户标签管理功能"},
            "reporter": {"zh": "报告人工号", "en": "Reporter AD account", "required": True, "example": "012950"},
            "assignee": {"zh": "经办人工号", "en": "Assignee AD account", "required": True, "example": "012950"},
            "projectkey": {"zh": "项目key", "en": "Project key", "required": True, "example": "TEST0408"},
            "reqcode": {"zh": "所属REQ编号", "en": "Parent REQ code", "required": False, "example": "PRODU-1079"},
            "planstart": {"zh": "计划开始时间", "en": "Plan start date", "required": False, "example": "2026-05-23"},
            "planend": {"zh": "计划结束时间", "en": "Plan end date", "required": False, "example": "2026-06-30"},
            "storypoint": {"zh": "故事点", "en": "Story point", "required": False, "example": "3"},
            "code": {"zh": "STORY编号", "en": "STORY code", "required": True, "example": "STORY-123"}
        },
        "common": {
            "statusname": {"zh": "状态名称", "en": "Status name", "required": True, "example": "待分析, 开发中, 测试中, 已完成"},
            "iteration": {"zh": "迭代", "en": "Iteration", "required": False, "example": "2024-Q2-Sprint3"},
            "type": {"zh": "类型", "en": "Type", "required": False, "example": "req 或 story"}
        }
    }

    # 根据实体类型返回对应的字段描述
    result = {}
    if entity_type in ["req", "both"]:
        result.update(field_descriptions["req"])
    if entity_type in ["story", "both"]:
        result.update(field_descriptions["story"])

    # 添加通用字段
    result.update(field_descriptions["common"])

    return result


def print_guidance_text(guidance):
    """以文本格式打印指导信息"""
    print("=" * 60)
    print("参数提取指导")
    print("=" * 60)

    print(f"\n📝 用户输入: {guidance['user_input']}")
    print(f"\n📋 任务描述: {guidance['task_description']}")

    print(f"\n🎯 意图分析:")
    intent = guidance['intent_analysis']
    print(f"   • 操作类型: {intent['operation_type']}")
    print(f"   • 实体类型: {intent['entity_type']}")
    print(f"   • 置信度: {intent['confidence']}")

    print(f"\n📝 建议的模板: {guidance['suggested_template']}")

    template = guidance['template_info']
    print(f"\n📋 模板信息:")
    print(f"   • CLI命令: {template['cli_command']}")
    print(f"   • API端点: {template['api_endpoint']}")
    print(f"   • 必需字段: {', '.join(template['required_fields'])}")
    print(f"   • 可选字段: {', '.join(template['optional_fields'])}")

    print(f"\n🔍 提取指导步骤:")
    for i, step in enumerate(guidance['extraction_guidance'], 1):
        print(f"   {i}. {step}")

    print(f"\n📖 字段描述:")
    fields = guidance['field_descriptions']
    for field_name, field_info in fields.items():
        required = "必需" if field_info.get('required', False) else "可选"
        print(f"   • {field_name} ({field_info['zh']}): {field_info['en']} [{required}]")
        if 'example' in field_info:
            print(f"     示例: {field_info['example']}")

    print("\n" + "=" * 60)


if __name__ == "__main__":
    main()