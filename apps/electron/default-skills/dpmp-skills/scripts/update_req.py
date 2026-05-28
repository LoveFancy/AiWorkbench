"""
更新 REQ（需求）命令
"""

import argparse
import sys
from .api_client import create_client


def main(args=None):
    """更新 REQ 主函数"""
    parser = argparse.ArgumentParser(
        prog="update-req",
        description="更新 REQ（需求）",
        epilog="示例: run.py update-req --code \"PRODU-1079\" --priority \"紧急(致命)\" --desc \"需要立即处理\""
    )

    # 必需参数
    parser.add_argument("--code", required=True, help="REQ编号")

    # 可选更新字段
    parser.add_argument("--name", help="REQ名称")
    parser.add_argument("--priority",
                       choices=["紧急(致命)", "极高(严重)", "高(一般)", "中(轻微)", "低(改善)"],
                       help="优先级")
    parser.add_argument("--desc", help="详细描述")
    parser.add_argument("--demand-originator", help="需求提出人工号")
    parser.add_argument("--reporter", help="报告人工号")
    parser.add_argument("--assignee", help="经办人工号")
    parser.add_argument("--vip-req", choices=["Y", "N"], help="重大需求：Y/N")
    parser.add_argument("--req-doc-url", help="需求文档URL")

    # 特殊参数
    parser.add_argument("--mock", action="store_true", help="Mock模式，不实际调用API")

    if args is None:
        args = sys.argv[1:]
    opts = parser.parse_args(args)

    # 检查是否有更新字段
    update_fields = [
        opts.name, opts.priority, opts.desc, opts.demand_originator,
        opts.reporter, opts.assignee, opts.vip_req, opts.req_doc_url
    ]
    if not any(update_fields):
        print("❌ 错误: 没有提供更新字段")
        parser.print_help()
        return

    if opts.mock:
        print("✅ [Mock] 更新 REQ 成功")
        print(f"   REQ编号: {opts.code}")
        updates = []
        if opts.name: updates.append(f"名称: {opts.name}")
        if opts.priority: updates.append(f"优先级: {opts.priority}")
        if opts.desc: updates.append(f"描述: {opts.desc}")
        if opts.demand_originator: updates.append(f"需求提出人: {opts.demand_originator}")
        if opts.reporter: updates.append(f"报告人: {opts.reporter}")
        if opts.assignee: updates.append(f"经办人: {opts.assignee}")
        if opts.vip_req: updates.append(f"重大需求: {opts.vip_req}")
        if opts.req_doc_url: updates.append(f"需求文档URL: {opts.req_doc_url}")
        if updates:
            print("   更新字段: " + ", ".join(updates))
        return

    try:
        client = create_client()

        # 构建更新数据
        update_data = {}
        if opts.name: update_data["name"] = opts.name
        if opts.priority: update_data["priorityLevel"] = opts.priority
        if opts.desc: update_data["description"] = opts.desc
        if opts.demand_originator: update_data["demandoriginator"] = opts.demand_originator
        if opts.reporter: update_data["reporter"] = opts.reporter
        if opts.assignee: update_data["assignee"] = opts.assignee
        if opts.vip_req: update_data["vipreq"] = opts.vip_req
        if opts.req_doc_url: update_data["reqdocurl"] = opts.req_doc_url

        # 调用 API
        result = client.update_req(opts.code, update_data)

        if result.get("code") == "0":
            data = result.get("resultData", {})
            req_code = data.get("code", opts.code)

            print("✅ REQ 更新成功")
            print(f"   REQ编号: {req_code}")
            if update_data:
                print("   更新字段:")
                for key, value in update_data.items():
                    print(f"     - {key}: {value}")
        else:
            error_msg = result.get("msg", "未知错误")
            print(f"❌ REQ 更新失败: {error_msg}")
            sys.exit(1)

    except Exception as e:
        print(f"❌ 执行失败: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()