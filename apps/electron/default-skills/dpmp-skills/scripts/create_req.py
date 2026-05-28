"""
创建 REQ（需求）命令
"""

import argparse
import sys
from .api_client import create_client


def main(args=None):
    """创建 REQ 主函数"""
    parser = argparse.ArgumentParser(
        prog="create-req",
        description="创建 REQ（需求）",
        epilog="示例: run.py create-req --name \"需求名称\" --priority \"高(一般)\" --desc \"需求描述\" --product-key \"PRODU\""
    )

    # 必需参数
    parser.add_argument("--product-key", required=True, help="产品空间key")
    parser.add_argument("--name", required=True, help="REQ名称")
    parser.add_argument("--priority", required=True,
                       choices=["紧急(致命)", "极高(严重)", "高(一般)", "中(轻微)", "低(改善)"],
                       help="优先级")
    parser.add_argument("--desc", required=True, help="详细描述")
    parser.add_argument("--demand-originator", required=True, help="需求提出人工号")
    parser.add_argument("--req-doc-url", required=True, help="需求文档URL")
    parser.add_argument("--req-doc-type", required=True, help="需求文档类型")
    parser.add_argument("--reporter", required=True, help="报告人工号")
    parser.add_argument("--assignee", required=True, help="经办人工号")

    # 可选参数
    parser.add_argument("--vip-req", choices=["Y", "N"], help="重大需求：Y/N")

    # 特殊参数
    parser.add_argument("--mock", action="store_true", help="Mock模式，不实际调用API")

    if args is None:
        args = sys.argv[1:]
    opts = parser.parse_args(args)

    if opts.mock:
        print("[Mock] 创建 REQ 成功")
        print(f"   产品空间: {opts.product_key}")
        print(f"   名称: {opts.name}")
        print(f"   优先级: {opts.priority}")
        print(f"   描述: {opts.desc}")
        if opts.demand_originator:
            print(f"   需求提出人: {opts.demand_originator}")
        if opts.reporter:
            print(f"   报告人: {opts.reporter}")
        if opts.assignee:
            print(f"   经办人: {opts.assignee}")
        return

    try:
        client = create_client()

        # 构建请求数据（使用小写格式，description和reqdocurl需要<p>标签）
        req_data = {
            "productkey": opts.product_key,
            "name": opts.name,
            "priorityLevel": opts.priority,
            "description": opts.desc,
            "demandoriginator": opts.demand_originator,
            "reqdocurl": opts.req_doc_url,
            "reqdoctype": opts.req_doc_type,
            "vipreq": opts.vip_req or "N"
        }

        # 可选字段
        if opts.reporter:
            req_data["reporter"] = opts.reporter
        if opts.assignee:
            req_data["assignee"] = opts.assignee

        # 打印请求体
        print("请求体数据:")
        import json
        print(json.dumps(req_data, indent=2, ensure_ascii=False))

        # 调用 API
        result = client.create_req(req_data)

        if result.get("code") == "0":
            data = result.get("resultData", {})
            req_code = data.get("code", "未知")
            req_id = data.get("id", "未知")

            print("REQ 创建成功")
            print(f"   REQ编号: {req_code}")
            print(f"   需求ID: {req_id}")
            print(f"   名称: {opts.name}")
            print(f"   优先级: {opts.priority}")
            print(f"   产品空间: {opts.product_key}")
        else:
            error_msg = result.get("msg", "未知错误")
            print(f"REQ 创建失败: {error_msg}")
            sys.exit(1)

    except Exception as e:
        print(f"执行失败: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()