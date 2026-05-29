#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
显示参数模板命令
"""

import argparse
import sys
import json
import io
import sys

# 设置标准输出编码为UTF-8
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

from .extract_params import get_template_info, get_field_descriptions


def main(args=None):
    """显示模板主函数"""
    parser = argparse.ArgumentParser(
        prog="show-template",
        description="显示参数模板信息",
        epilog="示例: run.py show-template --template create_req"
    )

    parser.add_argument("--template",
                       choices=[
                           "create_req", "update_req", "query_req",
                           "create_story", "update_story", "query_story",
                           "update_status"
                       ],
                       help="要显示的模板名称，不指定则显示所有模板")

    parser.add_argument("--format", choices=["json", "text"], default="text",
                       help="输出格式: json 或 text")

    if args is None:
        args = sys.argv[1:]
    opts = parser.parse_args(args)

    if opts.template:
        # 显示单个模板
        template_info = get_single_template_info(opts.template)
        if opts.format == "json":
            print(json.dumps(template_info, indent=2, ensure_ascii=False))
        else:
            print_template_text(template_info)
    else:
        # 显示所有模板
        all_templates = get_all_templates_info()
        if opts.format == "json":
            print(json.dumps(all_templates, indent=2, ensure_ascii=False))
        else:
            print_all_templates_text(all_templates)


def get_single_template_info(template_name):
    """获取单个模板信息"""
    # 从 extract_params.py 中获取模板信息
    template_info = get_template_info_from_name(template_name)

    # 获取字段描述
    entity_type = template_info.get("entity_type", "unknown")
    operation_type = template_info.get("operation_type", "unknown")
    field_descriptions = get_field_descriptions(entity_type, operation_type)

    # 构建完整的模板信息
    result = {
        "template_name": template_name,
        "template_info": template_info,
        "field_descriptions": field_descriptions,
        "cli_usage": generate_cli_usage(template_name, template_info)
    }

    return result


def get_template_info_from_name(template_name):
    """根据模板名称获取模板信息"""
    templates = {
        "create_req": {
            "template_name": "create_req",
            "entity_type": "req",
            "operation_type": "create",
            "required_fields": ["productkey", "name", "priorityLevel", "description",
                               "demandoriginator", "reqdocurl", "reqdoctype",
                               "reporter", "assignee"],
            "optional_fields": ["vipreq"],
            "cli_command": "create-req",
            "api_endpoint": "/api/req/addreq",
            "description": "创建 REQ（需求）"
        },
        "update_req": {
            "template_name": "update_req",
            "entity_type": "req",
            "operation_type": "update",
            "required_fields": ["code"],
            "optional_fields": ["name", "priorityLevel", "description",
                               "demandoriginator", "reporter", "assignee"],
            "cli_command": "update-req",
            "api_endpoint": "/api/req/updatereq",
            "description": "更新 REQ（需求）"
        },
        "query_req": {
            "template_name": "query_req",
            "entity_type": "req",
            "operation_type": "query",
            "required_fields": [],
            "optional_fields": ["code", "assignee", "reporter", "iteration", "status"],
            "cli_command": "query-req",
            "api_endpoint": "/api/req/queryreqbyconditions",
            "description": "查询 REQ（需求）"
        },
        "create_story": {
            "template_name": "create_story",
            "entity_type": "story",
            "operation_type": "create",
            "required_fields": ["name", "priorityLevel", "description",
                               "reporter", "assignee", "projectkey"],
            "optional_fields": ["reqcode", "planstart", "planend", "storypoint",
                               "iterationname", "plandevend", "plantestend"],
            "cli_command": "create-story",
            "api_endpoint": "/api/story/addstory",
            "description": "创建 STORY（任务）"
        },
        "update_story": {
            "template_name": "update_story",
            "entity_type": "story",
            "operation_type": "update",
            "required_fields": ["code"],
            "optional_fields": ["name", "priorityLevel", "description",
                               "assignee", "planend"],
            "cli_command": "update-story",
            "api_endpoint": "/api/story/updatestory",
            "description": "更新 STORY（任务）"
        },
        "query_story": {
            "template_name": "query_story",
            "entity_type": "story",
            "operation_type": "query",
            "required_fields": [],
            "optional_fields": ["code", "assignee", "reporter", "iteration", "status"],
            "cli_command": "query-story",
            "api_endpoint": "/api/story/querystorybyconditions",
            "description": "查询 STORY（任务）"
        },
        "update_status": {
            "template_name": "update_status",
            "entity_type": "both",
            "operation_type": "update_status",
            "required_fields": ["code", "statusname"],
            "optional_fields": ["type"],
            "cli_command": "update-status",
            "api_endpoint": "/api/req/updatestatus 或 /api/story/updatestatus",
            "description": "更新 REQ/STORY 状态"
        }
    }

    return templates.get(template_name, {})


def get_all_templates_info():
    """获取所有模板信息"""
    template_names = [
        "create_req", "update_req", "query_req",
        "create_story", "update_story", "query_story",
        "update_status"
    ]

    all_templates = {}
    for template_name in template_names:
        all_templates[template_name] = get_single_template_info(template_name)

    return all_templates


def generate_cli_usage(template_name, template_info):
    """生成CLI使用示例"""
    cli_command = template_info.get("cli_command", "")
    required_fields = template_info.get("required_fields", [])

    if template_name == "create_req":
        return f"""python3 run.py {cli_command} \\
    --product-key "PRODU" \\
    --name "需求名称" \\
    --priority "高(一般)" \\
    --desc "需求描述" \\
    --demand-originator "012950" \\
    --reporter "012950" \\
    --assignee "012950" \\
    --req-doc-url "http://example.com/doc" \\
    --req-doc-type "需求文档\""""

    elif template_name == "update_req":
        return f"""python3 run.py {cli_command} \\
    --code "PRODU-1079" \\
    --priority "紧急(致命)" \\
    --desc "更新后的描述\""""

    elif template_name == "query_req":
        return f"""python3 run.py {cli_command} \\
    --code "PRODU-1079" \\
    --format "table\""""

    elif template_name == "create_story":
        return f"""python3 run.py {cli_command} \\
    --project-key "TEST0408" \\
    --name "任务名称" \\
    --priority "高(一般)" \\
    --desc "任务描述" \\
    --reporter "012950" \\
    --assignee "012950" \\
    --req-code "PRODU-1079" \\
    --plan-end "2026-06-30\""""

    elif template_name == "update_story":
        return f"""python3 run.py {cli_command} \\
    --code "STORY-123" \\
    --assignee "021343" \\
    --plan-end "2026-07-15\""""

    elif template_name == "query_story":
        return f"""python3 run.py {cli_command} \\
    --code "STORY-123" \\
    --format "table\""""

    elif template_name == "update_status":
        return f"""python3 run.py {cli_command} \\
    --code "PRODU-1079" \\
    --status "开发中" \\
    --type "req\""""

    return f"python3 run.py {cli_command} [参数]"


def print_template_text(template_info):
    """以文本格式打印模板信息"""
    template_name = template_info["template_name"]
    info = template_info["template_info"]
    fields = template_info["field_descriptions"]
    cli_usage = template_info.get("cli_usage", "")

    print("=" * 60)
    print(f"模板: {template_name}")
    print(f"描述: {info.get('description', '')}")
    print("=" * 60)

    print(f"\n基本信息:")
    print(f"  - CLI命令: {info.get('cli_command', '')}")
    print(f"  - API端点: {info.get('api_endpoint', '')}")
    print(f"  - 实体类型: {info.get('entity_type', '')}")
    print(f"  - 操作类型: {info.get('operation_type', '')}")

    print(f"\n必需字段:")
    for field in info.get('required_fields', []):
        if field in fields:
            field_info = fields[field]
            required = "必需" if field_info.get('required', False) else "可选"
            print(f"  - {field} ({field_info.get('zh', '')}): {field_info.get('en', '')}")
            if 'example' in field_info:
                print(f"    示例: {field_info['example']}")

    print(f"\n可选字段:")
    for field in info.get('optional_fields', []):
        if field in fields:
            field_info = fields[field]
            required = "必需" if field_info.get('required', False) else "可选"
            print(f"  - {field} ({field_info.get('zh', '')}): {field_info.get('en', '')}")
            if 'example' in field_info:
                print(f"    示例: {field_info['example']}")

    if cli_usage:
        print(f"\nCLI使用示例:")
        print(cli_usage)

    print("\n" + "=" * 60)


def print_all_templates_text(all_templates):
    """以文本格式打印所有模板信息"""
    print("=" * 60)
    print("所有可用模板")
    print("=" * 60)

    for template_name, template_info in all_templates.items():
        info = template_info["template_info"]
        print(f"\n{template_name}: {info.get('description', '')}")
        print(f"  CLI命令: {info.get('cli_command', '')}")
        print(f"  必需字段: {', '.join(info.get('required_fields', []))}")
        print(f"  可选字段: {', '.join(info.get('optional_fields', []))}")

    print(f"\n使用示例:")
    print("  run.py show-template --template create_req")
    print("  run.py show-template --template create_story --format json")
    print("\n" + "=" * 60)


if __name__ == "__main__":
    main()