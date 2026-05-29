"""
查询 STORY（任务）命令
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
    """查询 STORY 主函数"""
    parser = argparse.ArgumentParser(
        prog="query-story",
        description="查询 STORY（任务）",
        epilog="示例: run.py query-story --code \"STORY-123\"\n       run.py query-story --assignee \"012950\" --format table"
    )

    # 查询条件（至少一个）
    parser.add_argument("--code", help="STORY编号")
    parser.add_argument("--name", help="STORY名称")
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
        opts.code, opts.name, opts.reporter,
        opts.assignee, opts.iteration, opts.version_name
    ]
    if not any(query_conditions):
        print("❌ 错误: 没有提供查询条件")
        parser.print_help()
        return

    if opts.mock:
        print("📋 [Mock] 查询结果")
        if opts.code:
            print(f"   STORY编号: {opts.code}")
            print(f"   名称: 测试任务")
            print(f"   优先级: 高(一般)")
            print(f"   状态: 开发中")
            print(f"   经办人: 012950")
        elif opts.assignee:
            print(f"   经办人: {opts.assignee} 的任务列表:")
            print(f"   • STORY-123: 客户标签管理 (开发中)")
            print(f"   • STORY-124: 用户界面优化 (测试中)")
        return

    try:
        client = create_client()

        if opts.code:
            # 精确查询
            result = client.get_story_by_code(opts.code)
            if result.get("code") == "0":
                data = result.get("resultData", {})
                if opts.format == "json":
                    print(json.dumps(data, ensure_ascii=False, indent=2))
                else:
                    # 提取嵌套字段
                    priority = data.get('priorityLevel', {})
                    state = data.get('stateVo', {})
                    project = data.get('projectVo', {})
                    reporter = data.get('reporter', {})
                    assignee = data.get('assignee', {})
                    creator = data.get('creator', {})

                    print("📋 STORY 详情:")
                    print(f"   编号: {data.get('code', '未知')}")
                    print(f"   名称: {data.get('name', '未知')}")
                    print(f"   优先级: {priority.get('name', '未知')}")
                    print(f"   状态: {state.get('name', '未知')}")
                    print(f"   项目空间: {project.get('name', '未知')}")
                    print(f"   报告人: {reporter.get('name', '未知')}")
                    print(f"   经办人: {assignee.get('name', '未知')}")
                    print(f"   创建人: {creator.get('name', '未知')}")
                    print(f"   计划完成日期: {format_timestamp(data.get('planEnd'))}")
                    desc = data.get('description', '')
                    if desc:
                        print(f"   描述: {desc[:50]}..." if len(desc) > 50 else f"   描述: {desc}")
            else:
                error_msg = result.get("msg", "未知错误")
                print(f"❌ 查询失败: {error_msg}")
                sys.exit(1)

        else:
            # 条件查询
            conditions = {}
            if opts.name: conditions["name"] = opts.name
            if opts.reporter: conditions["reporter"] = opts.reporter
            if opts.assignee: conditions["assignee"] = opts.assignee
            if opts.iteration: conditions["iterationname"] = opts.iteration
            if opts.version_name: conditions["versionname"] = opts.version_name

            result = client.query_story_by_conditions(conditions)
            if result.get("code") == "0":
                data = result.get("resultData", {})
                stories = data.get("list", [])

                if opts.format == "json":
                    print(json.dumps(stories, ensure_ascii=False, indent=2))
                elif opts.format == "table":
                    print(f"📋 查询结果（共 {len(stories)} 个）:")
                    if stories:
                        print("\n   编号        名称                优先级    状态      经办人      计划完成日期")
                        print("   " + "-" * 75)
                        for story in stories:
                            code = story.get('code', '未知')[:12].ljust(12)
                            name = (story.get('name', '未知')[:16] + '...') if len(story.get('name', '')) > 16 else story.get('name', '未知').ljust(19)
                            priority = story.get('priorityLevel', '未知')[:8].ljust(8)
                            status = story.get('statusname', '未知')[:8].ljust(8)
                            assignee = story.get('assignee', '未知')[:8].ljust(8)
                            plan_end = story.get('planend', '未知')[:10]
                            print(f"   {code} {name} {priority} {status} {assignee} {plan_end}")
                else:  # simple
                    print(f"📋 查询结果（共 {len(stories)} 个）:")
                    for story in stories:
                        print(f"   • {story.get('code', '未知')}: {story.get('name', '未知')} ({story.get('statusname', '未知')})")
            else:
                error_msg = result.get("msg", "未知错误")
                print(f"❌ 查询失败: {error_msg}")
                sys.exit(1)

    except Exception as e:
        print(f"❌ 执行失败: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()