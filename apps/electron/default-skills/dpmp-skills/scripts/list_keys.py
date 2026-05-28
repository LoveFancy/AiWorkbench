#!/usr/bin/env python3
"""
列出可用的产品空间和项目空间key
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


def main(args=None):
    parser = argparse.ArgumentParser(
        prog="list-keys",
        description="列出 .env 中配置的可用产品空间和项目空间key",
    )

    parser.add_argument("--format", choices=["json", "text"], default="text",
                       help="输出格式: json 或 text")

    if args is None:
        args = sys.argv[1:]
    opts = parser.parse_args(args)

    config = DPMPConfig()

    if opts.format == "json":
        output = {
            "product_keys": config.product_keys,
            "project_keys": config.project_keys,
        }
        print(json.dumps(output, indent=2, ensure_ascii=False))
    else:
        if config.product_keys:
            print(f"产品空间key ({len(config.product_keys)}个): {', '.join(config.product_keys)}")
        else:
            print("产品空间key: (未配置)")

        if config.project_keys:
            print(f"项目空间key ({len(config.project_keys)}个): {', '.join(config.project_keys)}")
        else:
            print("项目空间key: (未配置)")
