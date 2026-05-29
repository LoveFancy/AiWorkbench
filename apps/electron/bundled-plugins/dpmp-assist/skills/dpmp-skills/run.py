#!/usr/bin/env python3
"""
DPMP 技能主入口脚本

直接从命令行调用各个 DPMP 能力，每个能力在 scripts/ 目录下有对应的实现。

命令列表：
  create-req      创建 REQ（需求）
  update-req      更新 REQ
  query-req       查询 REQ
  create-story    创建 STORY（任务）
  update-story    更新 STORY
  query-story     查询 STORY
  update-status   更新 REQ/STORY 状态
  list-keys       列出可用的产品空间和项目空间key
  check-config    检查环境变量配置状态

环境变量配置（在 .env 文件中）：
  DPMP_BASE_URL=http://10.102.104.177:8080
  DPMP_APP_ID=18
  DPMP_OPEN_API_TOKEN=<your_token>
  DPMP_AD_ACCOUNT=<your_ad_account>

使用示例：
  python3 run.py create-req --name "需求名称" --priority "高(一般)" --desc "需求描述" --product-key "PRODU"
  python3 run.py query-req --code "PRODU-1079"
  python3 run.py create-story --name "任务名称" --priority "高(一般)" --desc "任务描述" --reporter "012950" --assignee "012950"
"""

import argparse
import sys
import os
from dotenv import load_dotenv

_SKILL_DIR = os.path.dirname(os.path.abspath(__file__))

load_dotenv(os.path.join(os.getcwd(), ".env"))
load_dotenv(os.path.join(_SKILL_DIR, ".env"))

def main():
    parser = argparse.ArgumentParser(
        prog="run.py",
        description="DPMP 项目管理平台命令行工具",
        epilog="使用 'run.py <命令> --help' 查看具体命令的帮助信息"
    )

    parser.add_argument(
        "command",
        choices=[
            "create-req", "update-req", "query-req",
            "create-story", "update-story", "query-story",
            "update-status", "extract-params", "show-template",
            "batch-create-story", "list-keys", "check-config"
        ],
        help="要执行的命令"
    )

    if len(sys.argv) < 2:
        parser.print_help()
        sys.exit(1)

    command = sys.argv[1]
    args = sys.argv[2:]

    # 根据命令调用对应的脚本
    try:
        if command == "create-req":
            from scripts.create_req import main as cmd_main
            cmd_main(args)
        elif command == "update-req":
            from scripts.update_req import main as cmd_main
            cmd_main(args)
        elif command == "query-req":
            from scripts.query_req import main as cmd_main
            cmd_main(args)
        elif command == "create-story":
            from scripts.create_story import main as cmd_main
            cmd_main(args)
        elif command == "update-story":
            from scripts.update_story import main as cmd_main
            cmd_main(args)
        elif command == "query-story":
            from scripts.query_story import main as cmd_main
            cmd_main(args)
        elif command == "update-status":
            from scripts.update_status import main as cmd_main
            cmd_main(args)
        elif command == "extract-params":
            from scripts.extract_params import main as cmd_main
            cmd_main(args)
        elif command == "show-template":
            from scripts.show_template import main as cmd_main
            cmd_main(args)
        elif command == "batch-create-story":
            from scripts.batch_create_story import main as cmd_main
            cmd_main(args)
        elif command == "list-keys":
            from scripts.list_keys import main as cmd_main
            cmd_main(args)
        elif command == "check-config":
            from scripts.check_config import main as cmd_main
            cmd_main(args)
        else:
            print(f"未知命令: {command}")
            parser.print_help()
            sys.exit(1)

    except ImportError as e:
        print(f"无法加载命令模块: {e}")
        print("请确保 scripts/ 目录下存在对应的脚本文件")
        sys.exit(1)
    except Exception as e:
        print(f"命令执行失败: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()