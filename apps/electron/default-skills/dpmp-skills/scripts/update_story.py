"""
更新 STORY（任务）命令
"""

import argparse
import sys
from .api_client import create_client


def main(args=None):
    """更新 STORY 主函数"""
    parser = argparse.ArgumentParser(
        prog="update-story",
        description="更新 STORY（任务）",
        epilog="示例: run.py update-story --code \"STORY-123\" --assignee \"021343\" --plan-end \"2026-07-15\""
    )

    # 必需参数
    parser.add_argument("--code", required=True, help="STORY编号")

    # 可选更新字段
    parser.add_argument("--name", help="STORY名称")
    parser.add_argument("--priority",
                       choices=["紧急(致命)", "极高(严重)", "高(一般)", "中(轻微)", "低(改善)"],
                       help="优先级")
    parser.add_argument("--req-code", help="所属REQ编号")
    parser.add_argument("--reporter", help="报告人工号")
    parser.add_argument("--desc", help="详细描述")
    parser.add_argument("--assignee", help="经办人工号")
    parser.add_argument("--plan-end", help="计划完成日期 yyyy-mm-dd")
    parser.add_argument("--plan-dev-end", help="计划开发完成日期 yyyy-mm-dd")
    parser.add_argument("--plan-test-end", help="计划测试完成日期 yyyy-mm-dd")
    parser.add_argument("--iteration", help="迭代名称")

    # 特殊参数
    parser.add_argument("--mock", action="store_true", help="Mock模式")

    if args is None:
        args = sys.argv[1:]
    opts = parser.parse_args(args)

    # 检查是否有更新字段
    update_fields = [
        opts.name, opts.priority, opts.req_code, opts.reporter,
        opts.desc, opts.assignee, opts.plan_end, opts.plan_dev_end,
        opts.plan_test_end, opts.iteration
    ]
    if not any(update_fields):
        print("❌ 错误: 没有提供更新字段")
        parser.print_help()
        return

    if opts.mock:
        print("✅ [Mock] 更新 STORY 成功")
        print(f"   STORY编号: {opts.code}")
        updates = []
        if opts.name: updates.append(f"名称: {opts.name}")
        if opts.priority: updates.append(f"优先级: {opts.priority}")
        if opts.req_code: updates.append(f"所属需求: {opts.req_code}")
        if opts.reporter: updates.append(f"报告人: {opts.reporter}")
        if opts.desc: updates.append(f"描述: {opts.desc}")
        if opts.assignee: updates.append(f"经办人: {opts.assignee}")
        if opts.plan_end: updates.append(f"计划完成日期: {opts.plan_end}")
        if updates:
            print("   更新字段: " + ", ".join(updates))
        return

    try:
        client = create_client()

        # 构建更新数据
        update_data = {}
        if opts.name: update_data["name"] = opts.name
        if opts.priority: update_data["priorityLevel"] = opts.priority
        if opts.req_code: update_data["reqcode"] = opts.req_code
        if opts.reporter: update_data["reporter"] = opts.reporter
        if opts.desc: update_data["description"] = opts.desc
        if opts.assignee: update_data["assignee"] = opts.assignee
        if opts.plan_end: update_data["planend"] = opts.plan_end
        if opts.plan_dev_end: update_data["plandevend"] = opts.plan_dev_end
        if opts.plan_test_end: update_data["plantestend"] = opts.plan_test_end
        if opts.iteration: update_data["iterationname"] = opts.iteration

        # 调用 API
        result = client.update_story(opts.code, update_data)

        if result.get("code") == "0":
            data = result.get("resultData", {})
            story_code = data.get("code", opts.code)

            print("✅ STORY 更新成功")
            print(f"   STORY编号: {story_code}")
            if update_data:
                print("   更新字段:")
                for key, value in update_data.items():
                    print(f"     - {key}: {value}")
        else:
            error_msg = result.get("msg", "未知错误")
            print(f"❌ STORY 更新失败: {error_msg}")
            sys.exit(1)

    except Exception as e:
        print(f"❌ 执行失败: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()