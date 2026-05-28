"""
查询 REQ（需求）命令
"""

import argparse
import json
import sys
from datetime import datetime
from .api_client import create_client


def format_timestamp(ts):
    """将毫秒时间戳转换为日期字符串"""
    if not ts:
        return '未知'
    try:
        return datetime.fromtimestamp(ts / 1000).strftime('%Y-%m-%d')
    except Exception:
        return '未知'


def main(args=None):
    """查询 REQ 主函数"""
    parser = argparse.ArgumentParser(
        prog="query-req",
        description="查询 REQ（需求）",
        epilog="示例: run.py query-req --code \"PRODU-1079\"\n       run.py query-req --assignee \"012950\" --format table"
    )

    # 查询条件（至少一个）
    parser.add_argument("--code", help="REQ编号")
    parser.add_argument("--name", help="REQ名称")
    parser.add_argument("--demand-originator", help="需求提出人工号")
    parser.add_argument("--reporter", help="报告人工号")
    parser.add_argument("--assignee", help="经办人工号")
    parser.add_argument("--iteration", help="迭代名称")
    parser.add_argument("--version-name", help="版本名称")

    # 输出选项
    parser.add_argument("--format", choices=["json", "table", "simple"], default="table",
                       help="输出格式: json, table, simple")
    parser.add_argument("--mock", action="store_true", help="Mock模式")

    if args is None:
        args = sys.argv[1:]
    opts = parser.parse_args(args)

    # 检查是否有查询条件
    query_conditions = [
        opts.code, opts.name, opts.demand_originator,
        opts.reporter, opts.assignee, opts.iteration, opts.version_name
    ]
    if not any(query_conditions):
        print("❌ 错误: 没有提供查询条件")
        parser.print_help()
        return

    if opts.mock:
        print("[Mock] 查询结果")
        if opts.code:
            print(f"   REQ编号: {opts.code}")
            print(f"   名称: 测试需求")
            print(f"   优先级: 高(一般)")
            print(f"   状态: 开发中")
            print(f"   经办人: 012950")
        elif opts.assignee:
            print(f"   经办人: {opts.assignee} 的需求列表:")
            print(f"   • PRODU-1079: 客户管理系统 (开发中)")
            print(f"   • PRODU-1080: 支付优化 (待分析)")
        return

    try:
        client = create_client()

        if opts.code:
            # 精确查询
            result = client.get_req_by_code(opts.code)
            if result.get("code") == "0":
                data = result.get("resultData", {})
                if opts.format == "json":
                    print(json.dumps(data, ensure_ascii=False, indent=2))
                else:
                    # 提取嵌套字段
                    priority = data.get('priorityLevel', {})
                    state = data.get('stateVo', {})
                    project = data.get('projectVo', {})
                    demand_originators = data.get('demanDoriginator', [])
                    reporter = data.get('reporter', {})
                    assignee = data.get('assignee', {})
                    creator = data.get('creator', {})

                    # 需求提出人可能是数组
                    originator_name = demand_originators[0].get('name', '未知') if demand_originators else '未知'

                    print("📋 REQ 详情:")
                    print(f"   编号: {data.get('code', '未知')}")
                    print(f"   名称: {data.get('name', '未知')}")
                    print(f"   优先级: {priority.get('name', '未知')}")
                    print(f"   状态: {state.get('name', '未知')}")
                    print(f"   产品空间: {project.get('name', '未知')}")
                    print(f"   需求提出人: {originator_name}")
                    print(f"   报告人: {reporter.get('name', '未知')}")
                    print(f"   经办人: {assignee.get('name', '未知')}")
                    print(f"   创建人: {creator.get('name', '未知')}")
                    print(f"   创建时间: {format_timestamp(data.get('gmtCreated'))}")
            else:
                error_msg = result.get("msg", "未知错误")
                print(f"❌ 查询失败: {error_msg}")
                sys.exit(1)

        else:
            # 条件查询
            conditions = {}
            if opts.name: conditions["name"] = opts.name
            if opts.demand_originator: conditions["demandOriginator"] = opts.demand_originator
            if opts.reporter: conditions["reporter"] = opts.reporter
            if opts.assignee: conditions["assignee"] = opts.assignee
            if opts.iteration: conditions["iterationname"] = opts.iteration
            if opts.version_name: conditions["versionname"] = opts.version_name

            result = client.query_req_by_conditions(conditions)
            if result.get("code") == "0":
                data = result.get("resultData", {})
                reqs = data.get("list", [])

                if opts.format == "json":
                    print(json.dumps(reqs, ensure_ascii=False, indent=2))
                elif opts.format == "table":
                    print(f"📋 查询结果（共 {len(reqs)} 个）:")
                    if reqs:
                        print("\n   编号        名称                优先级    状态      经办人")
                        print("   " + "-" * 60)
                        for req in reqs:
                            code = req.get('code', '未知')[:12].ljust(12)
                            name = (req.get('name', '未知')[:16] + '...') if len(req.get('name', '')) > 16 else req.get('name', '未知').ljust(19)
                            priority = req.get('priorityLevel', '未知')[:8].ljust(8)
                            status = req.get('statusname', '未知')[:8].ljust(8)
                            assignee = req.get('assignee', '未知')
                            print(f"   {code} {name} {priority} {status} {assignee}")
                else:  # simple
                    print(f"📋 查询结果（共 {len(reqs)} 个）:")
                    for req in reqs:
                        print(f"   • {req.get('code', '未知')}: {req.get('name', '未知')} ({req.get('statusname', '未知')})")
            else:
                error_msg = result.get("msg", "未知错误")
                print(f"❌ 查询失败: {error_msg}")
                sys.exit(1)

    except Exception as e:
        print(f"❌ 执行失败: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()