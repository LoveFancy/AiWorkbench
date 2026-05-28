"""
创建 STORY（任务）命令
"""

import argparse
import sys
from .api_client import create_client


def main(args=None):
    """创建 STORY 主函数"""
    parser = argparse.ArgumentParser(
        prog="create-story",
        description="创建 STORY（任务）",
        epilog="示例: run.py create-story --name \"任务名称\" --priority \"高(一般)\" --desc \"任务描述\" --reporter \"012950\" --assignee \"012950\""
    )

    # 必需参数
    parser.add_argument("--project-key", required=True, help="项目空间key")
    parser.add_argument("--name", required=True, help="STORY名称")
    parser.add_argument("--priority", required=True,
                       choices=["紧急(致命)", "极高(严重)", "高(一般)", "中(轻微)", "低(改善)"],
                       help="优先级")
    parser.add_argument("--desc", required=True, help="详细描述")
    parser.add_argument("--reporter", required=True, help="报告人工号")
    parser.add_argument("--assignee", required=True, help="经办人工号")

    # 可选参数
    parser.add_argument("--iteration", help="迭代名称")
    parser.add_argument("--req-code", help="所属REQ编号")
    parser.add_argument("--plan-dev-end", help="计划开发完成日期 yyyy-mm-dd")
    parser.add_argument("--plan-test-end", help="计划测试完成日期 yyyy-mm-dd")
    parser.add_argument("--plan-end", help="计划完成日期 yyyy-mm-dd")

    # 特殊参数
    parser.add_argument("--mock", action="store_true", help="Mock模式，不实际调用API")

    if args is None:
        args = sys.argv[1:]
    opts = parser.parse_args(args)

    if opts.mock:
        print("[Mock] 创建 STORY 成功")
        print(f"   名称: {opts.name}")
        print(f"   优先级: {opts.priority}")
        print(f"   报告人: {opts.reporter}")
        print(f"   经办人: {opts.assignee}")
        if opts.project_key:
            print(f"   项目空间: {opts.project_key}")
        if opts.iteration:
            print(f"   迭代: {opts.iteration}")
        if opts.req_code:
            print(f"   所属需求: {opts.req_code}")
        if opts.plan_end:
            print(f"   计划完成日期: {opts.plan_end}")
        return

    try:
        client = create_client()

        # 构建请求数据
        story_data = {
            "projectkey": opts.project_key,
            "name": opts.name,
            "priorityLevel": opts.priority,
            "description": opts.desc,
            "reporter": opts.reporter,
            "assignee": opts.assignee
        }

        # 可选字段
        if opts.iteration:
            story_data["iterationname"] = opts.iteration
        if opts.req_code:
            story_data["reqcode"] = opts.req_code
        if opts.plan_dev_end:
            story_data["plandevend"] = opts.plan_dev_end
        if opts.plan_test_end:
            story_data["plantestend"] = opts.plan_test_end
        if opts.plan_end:
            story_data["planend"] = opts.plan_end

        # 调用 API
        result = client.create_story(story_data)

        if result.get("code") == "0":
            data = result.get("resultData", {})
            story_code = data.get("code", "未知")
            story_id = data.get("id", "未知")

            print("STORY 创建成功")
            print(f"   STORY编号: {story_code}")
            print(f"   任务ID: {story_id}")
            print(f"   名称: {opts.name}")
            print(f"   优先级: {opts.priority}")
            print(f"   经办人: {opts.assignee}")
            if opts.project_key:
                print(f"   项目空间: {opts.project_key}")
            if opts.req_code:
                print(f"   所属需求: {opts.req_code}")
            if opts.plan_end:
                print(f"   计划完成日期: {opts.plan_end}")
        else:
            error_msg = result.get("msg", "未知错误")
            print(f"STORY 创建失败: {error_msg}")
            sys.exit(1)

    except Exception as e:
        print(f"执行失败: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()