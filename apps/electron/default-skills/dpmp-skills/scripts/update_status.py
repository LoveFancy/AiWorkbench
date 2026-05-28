"""
更新状态命令（支持 REQ 和 STORY）
"""

import argparse
import sys
from .api_client import create_client


def main(args=None):
    """更新状态主函数"""
    parser = argparse.ArgumentParser(
        prog="update-status",
        description="更新 REQ/STORY 状态",
        epilog="示例: run.py update-status --code \"PRODU-1079\" --status \"开发中\" --type req\n       run.py update-status --code \"STORY-123\" --status \"测试中\" --type story"
    )

    # 必需参数
    parser.add_argument("--code", required=True, help="REQ/STORY编号")
    parser.add_argument("--status", required=True, help="状态名称")
    parser.add_argument("--type", choices=["req", "story"], required=True, help="实体类型")

    # 特殊参数
    parser.add_argument("--mock", action="store_true", help="Mock模式")

    if args is None:
        args = sys.argv[1:]
    opts = parser.parse_args(args)

    if opts.mock:
        entity_name = "REQ" if opts.type == "req" else "STORY"
        print(f"✅ [Mock] 更新{entity_name}状态成功")
        print(f"   编号: {opts.code}")
        print(f"   新状态: {opts.status}")
        return

    try:
        client = create_client()

        if opts.type == "req":
            # 更新 REQ 状态
            result = client.update_req_status(opts.code, opts.status)
            entity_name = "REQ"
        else:
            # 更新 STORY 状态
            result = client.update_story_status(opts.code, opts.status)
            entity_name = "STORY"

        if result.get("code") == "0":
            data = result.get("resultData", {})
            entity_code = data.get("code", opts.code)

            print(f"✅ {entity_name} 状态更新成功")
            print(f"   编号: {entity_code}")
            print(f"   新状态: {opts.status}")

            # 显示可能的状态流转建议
            if opts.type == "req":
                print("\n   REQ 常见状态流转:")
                print("     • 需求待完善 → 待分析 → 分析中 → 待评审 → 评审中")
                print("     • 待排期 → 已排期 → 开发中 → 测试中 → 验收中")
                print("     • 已发布 → 已关闭 / 废弃")
            else:
                print("\n   STORY 常见状态流转:")
                print("     • 待分析 → 分析中 → 待开发 → 开发中")
                print("     • 待测试 → 测试中 → 待验收 → 已验收")
                print("     • 已关闭 / 已取消")
        else:
            error_msg = result.get("msg", "未知错误")
            print(f"❌ {entity_name} 状态更新失败: {error_msg}")
            sys.exit(1)

    except Exception as e:
        print(f"❌ 执行失败: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()