#!/usr/bin/env python3
"""quick-story：从结构化参数直接创建单条 DPMP Story，无需 [STORY_PLAN].csv。

用法：
  python run.py quick-story \
      --name "【前后端】客户标签管理" \
      --desc "支持对客户添加、删除、查询标签" \
      --iteration "2024-Q2-Sprint3" \
      --req-code "TAILOR-124" \
      --assignee "012950" \
      --reporter "012950"
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
import time


def setup_logger() -> logging.Logger:
    logger = logging.getLogger("quick_story")
    logger.setLevel(logging.INFO)
    if not logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter(
            "%(asctime)s - %(levelname)s - %(message)s",
            datefmt="%H:%M:%S",
        ))
        logger.addHandler(handler)
    return logger


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="run.py quick-story",
        description="直接从参数创建单条 DPMP Story，无需 [STORY_PLAN].csv",
    )
    parser.add_argument("--name",       required=True,  help="Story 名称")
    parser.add_argument("--desc",       required=True,  help="Story 描述")
    parser.add_argument("--iteration",  required=True,  help="所属完整迭代名，如 2024-Q2-Sprint3")
    parser.add_argument("--req-code",   required=True,  help="所属需求编号，如 TAILOR-124")
    parser.add_argument("--assignee",   default="",     help="经办人工号（默认读 pmconfig）")
    parser.add_argument("--reporter",   default="",     help="创建人工号（默认读 pmconfig）")
    parser.add_argument("--mock",       action="store_true", help="Mock 模式，不实际调用 DPMP API")
    args = parser.parse_args()

    logger = setup_logger()

    # 从环境变量读取 DPMP 配置（.env 已在 run.py 启动时自动加载）
    cookie     = os.environ.get("DPMP_COOKIE", "")
    project_id = int(os.environ.get("DPMP_PROJECT_ID", "2232"))
    task_type_id = int(os.environ.get("DPMP_TASK_TYPE_ID", "13"))
    base_url   = os.environ.get("DPMP_BASE_URL", "http://pt.htsc/paas/dc/api")

    if not cookie and not args.mock:
        print("错误：未配置 DPMP_COOKIE，请在 .env 文件中设置或使用 --mock 模式。", file=sys.stderr)
        sys.exit(1)

    # 将 scripts/dpmp 加入 sys.path
    dpmp_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dpmp")
    if dpmp_dir not in sys.path:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

    from dpmp.config import DPMPConfig
    from dpmp.cache import QueryCache
    from dpmp.api_client import APIClient

    config = DPMPConfig(
        cookie=cookie,
        project_id=project_id,
        task_type_id=task_type_id,
        base_url=base_url,
    )
    cache = QueryCache()
    client = APIClient(config, cache, logger)

    if args.mock:
        print(f"[MOCK] Story 创建成功（Mock 模式）")
        print(f"  名称：{args.name}")
        print(f"  描述：{args.desc}")
        print(f"  迭代：{args.iteration}")
        print(f"  需求：{args.req_code}")
        print(f"STORY_ID=MOCK-001")
        return

    # 验证 Cookie
    logger.info("验证 Cookie...")
    if not client.validate_cookie():
        print("错误：Cookie 无效或已过期，请更新 .env 中的 DPMP_COOKIE。", file=sys.stderr)
        sys.exit(1)

    # 查询迭代
    logger.info(f"查询迭代：{args.iteration}")
    iteration = client.query_iteration(args.iteration)
    if not iteration:
        print(f"错误：未找到迭代 '{args.iteration}'，请检查迭代名称是否正确。", file=sys.stderr)
        sys.exit(1)

    # 查询经办人
    assignee_id = args.assignee or os.environ.get("DPMP_DEFAULT_ASSIGNEE", "")
    if not assignee_id:
        print("错误：未指定经办人工号，请通过 --assignee 传入或在 .env 中设置 DPMP_DEFAULT_ASSIGNEE。", file=sys.stderr)
        sys.exit(1)
    logger.info(f"查询经办人：{assignee_id}")
    assignee = client.query_user(assignee_id)
    if not assignee:
        print(f"错误：未找到用户 '{assignee_id}'。", file=sys.stderr)
        sys.exit(1)

    # 查询创建人
    reporter_id = args.reporter or assignee_id
    if reporter_id == assignee_id:
        reporter = assignee
    else:
        logger.info(f"查询创建人：{reporter_id}")
        reporter = client.query_user(reporter_id)
        if not reporter:
            print(f"错误：未找到用户 '{reporter_id}'。", file=sys.stderr)
            sys.exit(1)

    # 查询父需求
    logger.info(f"查询需求：{args.req_code}")
    parent_issue = client.query_parent_issue(args.req_code)
    if not parent_issue:
        print(f"错误：未找到需求 '{args.req_code}'，请检查需求编号是否正确。", file=sys.stderr)
        sys.exit(1)

    # 构造并发送创建请求
    from dpmp.automation import StoryAutomation
    from dpmp.models import StoryData

    story = StoryData(
        story_key="quick-1",
        story_name=args.name,
        story_description=args.desc,
        iteration_name=args.iteration,
        requirement_code=args.req_code,
        requirement_name=parent_issue.get("name", ""),
        release_version="",
        assignee_id=assignee_id,
        assignee_name=assignee.get("displayName", ""),
        reporter_id=reporter_id,
        plan_dev_end="",
        test_plan_end="",
        plan_end="",
    )

    automation = StoryAutomation(config)
    success, story_id = automation._process_story(story)

    if success and story_id:
        print(f"✅ Story 创建成功！")
        print(f"  名称：{args.name}")
        print(f"  迭代：{args.iteration}")
        print(f"  需求：{args.req_code}")
        print(f"STORY_ID={story_id}")
    else:
        print("❌ Story 创建失败，请查看上方日志。", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
