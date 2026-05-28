#!/usr/bin/env python3
"""
检查 DPMP 配置状态

通过 config.py 检测所有环境变量的配置状态，支持 JSON 输出供 AI 解析。
"""

import argparse
import sys
import json
import io

try:
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
except AttributeError:
    pass

from .config import DPMPConfig


def check_required(name, value, description, guide):
    """检查必需配置项"""
    return {
        "name": name,
        "status": "configured" if value else "missing",
        "value_hint": f"{value[:8]}..." if value and len(value) > 8 else value,
        "description": description,
        "guide": "" if value else guide,
    }


def check_optional(name, value, description):
    """检查可选配置项"""
    return {
        "name": name,
        "status": "configured" if value else "not_set",
        "value_hint": value if isinstance(value, str) else str(value),
        "description": description,
        "guide": "",
    }


def main(args=None):
    parser = argparse.ArgumentParser(
        prog="check-config",
        description="检查 DPMP 环境变量配置状态",
    )

    parser.add_argument("--format", choices=["json", "text"], default="json",
                       help="输出格式: json 或 text")

    if args is None:
        args = sys.argv[1:]
    opts = parser.parse_args(args)

    config = DPMPConfig(strict=False)

    items = [
        check_required(
            "DPMP_BASE_URL", config.base_url,
            "DPMP API 基础地址",
            "填写 DPMP API 的根路径，如 http://10.102.104.177:8080"
        ),
        check_required(
            "DPMP_APP_ID", config.app_id,
            "应用ID，用于标识调用方",
            "从 DPMP 系统管理员获取"
        ),
        check_required(
            "DPMP_OPEN_API_TOKEN", config.open_api_token,
            "API Token, 用于 openApiToken 认证",
            "联系马振徽(011516) 获取"
        ),
        check_required(
            "DPMP_AD_ACCOUNT", config.ad_account,
            "操作人工号(AD账号)",
            "填写你的工号, 如 012950"
        ),
        check_optional(
            "DPMP_PRODUCT_KEY", ";".join(config.product_keys),
            "产品空间key, 多个key用分号分隔(创建REQ时使用)"
        ),
        check_optional(
            "DPMP_PROJECT_KEY", ";".join(config.project_keys),
            "项目空间key, 多个key用分号分隔(创建STORY时使用)"
        ),
    ]

    missing_count = sum(1 for i in items if i["status"] == "missing")

    if opts.format == "json":
        output = {
            "config_status": "ready" if missing_count == 0 else "incomplete",
            "missing_count": missing_count,
            "total_count": len(items),
            "items": items,
        }
        print(json.dumps(output, indent=2, ensure_ascii=False))
    else:
        if missing_count == 0:
            print("✅ 所有配置项已就绪\n")
        else:
            print(f"⚠️  有 {missing_count} 个必需配置项未设置\n")

        for item in items:
            icon = {"configured": "✅", "missing": "❌", "not_set": "⚪"}[item["status"]]
            print(f"{icon} {item['name']}: {item['description']}")
            if item["status"] == "missing":
                print(f"   获取方式: {item['guide']}")
            elif item["status"] != "not_set":
                print(f"   当前值: {item['value_hint']}")
        print()

    sys.exit(0 if missing_count == 0 else 1)
