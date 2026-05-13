#!/usr/bin/env python3
"""enhance-content：执行图片重命名并更新 Markdown 链接。

执行流程：
  1. AI 读取 [PROD_ORI] 文档，从上下文分析图片语义，确定新名称
  2. AI 构造 --rename / --keep 参数调用本脚本
  3. 脚本执行：图片物理重命名 + 更新 [PROD_ORI] 图片链接
"""

from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
from dataclasses import dataclass, field


@dataclass
class RenameResult:
    original: str
    target: str
    status: str          # 已重命名 / 保留原名 / 处理失败
    category: str = ""
    reason: str = ""



def infer_from_git(markdown_path: str) -> list[RenameResult]:
    """通过 git diff HEAD 自动推导图片重命名映射。

    AI 修改 [PROD_ORI] 后（图片链接已替换为语义化名称），本函数对该文件做
    git diff HEAD ，从删除行提取旧路径、从新增行提取新路径，按出现顺序配对。
    """
    img_ext = re.compile(
        r'["(]((?:[^"()]*/)?(\S+\.(?:png|jpg|jpeg|gif|webp|svg|bmp)))[")] ',
        re.IGNORECASE,
    )
    # 更简洁的正则：匹配 markdown 图片链接 ![]() 中的路径
    img_ref = re.compile(
        r'!\[[^\]]*\]\(([^)]+\.(?:png|jpg|jpeg|gif|webp|svg|bmp))\)',
        re.IGNORECASE,
    )

    try:
        diff = subprocess.run(
            ["git", "diff", "HEAD", "--", markdown_path],
            capture_output=True, text=True, check=True,
        ).stdout
    except subprocess.CalledProcessError as e:
        raise RuntimeError(f"git diff 失败：{e.stderr.strip()}") from e

    removed: list[str] = []   # 旧图片路径（删除行）
    added: list[str] = []     # 新图片路径（新增行）

    for line in diff.splitlines():
        if line.startswith("-") and not line.startswith("---"):
            removed.extend(img_ref.findall(line[1:]))
        elif line.startswith("+") and not line.startswith("+++"):
            added.extend(img_ref.findall(line[1:]))

    # 按顺序配对（相同下标对应）
    results: list[RenameResult] = []
    for old, new in zip(removed, added):
        if old == new:
            results.append(RenameResult(original=old, target=new, status="保留原名"))
        else:
            results.append(RenameResult(original=old, target=new, status="pending"))

    if not results:
        # 没有图片变化（可能本来就没有图片，或全都保留了）
        pass

    return results


def apply_renames(doc_dir: str, results: list[RenameResult]) -> None:
    """执行文件重命名，更新每条记录的 status。"""
    for r in results:
        if r.status != "pending":
            continue

        src = os.path.abspath(os.path.join(doc_dir, r.original))
        dst = os.path.abspath(os.path.join(doc_dir, r.target))

        if src == dst:
            r.status = "保留原名"
            continue

        if not os.path.exists(src):
            r.status = "处理失败（源文件不存在）"
            continue

        os.makedirs(os.path.dirname(dst), exist_ok=True)

        # 目标已存在时自动加序号避免覆盖
        if os.path.exists(dst) and os.path.abspath(dst) != os.path.abspath(src):
            stem, ext = os.path.splitext(dst)
            # 去掉 stem 末尾已有的 -\d+ 序号（如 -01），从 2 开始重新递增
            base_stem = re.sub(r"-\d+$", "", stem)
            counter = 2
            while os.path.exists(f"{base_stem}-{counter:02d}{ext}"):
                counter += 1
            dst = f"{base_stem}-{counter:02d}{ext}"
            r.target = os.path.relpath(dst, os.path.abspath(doc_dir))

        try:
            os.replace(src, dst)
            r.status = "已重命名"
        except OSError as e:
            r.status = f"处理失败（{e}）"


def update_markdown_links(
    markdown_path: str,
    results: list[RenameResult],
) -> int:
    """将 [PROD_ORI] 文件中的图片链接替换为新文件名，返回替换次数。

    替换策略：
    - 只处理状态为「已重命名」的条目（target 与 original 不同）
    - 先尝试匹配完整路径，兜底匹配文件名
    - 分批执行时（脚本被多次调用），已替换的链接不会重复替换
    """
    with open(markdown_path, encoding="utf-8") as f:
        content = f.read()

    original_content = content
    replace_count = 0

    for r in results:
        if r.status != "已重命名" or r.original == r.target:
            continue

        old_name = os.path.basename(r.original)
        new_name = os.path.basename(r.target)
        old_path = r.original.replace("\\", "/")
        new_path = r.target.replace("\\", "/")

        if old_path in content:
            content = content.replace(old_path, new_path)
            replace_count += 1
        elif old_name in content:
            # 兜底：仅匹配文件名（路径前缀因执行目录不同可能有差异）
            content = content.replace(old_name, new_name)
            replace_count += 1

    if content != original_content:
        with open(markdown_path, "w", encoding="utf-8") as f:
            f.write(content)

    return replace_count




# write_manifest 已移除：图片分析记录不再写入 [PROCESS] 文件，
# 统计信息通过 stdout 输出即可。


def main() -> None:
    parser = argparse.ArgumentParser(
        description="执行图片重命名并生成过程记录"
    )
    parser.add_argument("--input", required=True, help="[PROD_ORI] Markdown 文件路径")
    parser.add_argument(
        "--rename",
        nargs=2,
        metavar=("OLD", "NEW"),
        action="append",
        default=[],
        help="重命名条目（可重复）：--rename 旧路径 新路径",
    )
    parser.add_argument(
        "--keep",
        metavar="PATH",
        action="append",
        default=[],
        help="保留原名（可重复）：--keep 路径",
    )
    args = parser.parse_args()

    if not args.rename and not args.keep:
        print("错误：必须至少提供一个 --rename 或 --keep 参数。", file=sys.stderr)
        print("提示：请先由 AI 分析图片语义，再构造 --rename OLD NEW 参数调用本脚本。", file=sys.stderr)
        sys.exit(1)

    results = []
    for old, new in args.rename:
        results.append(RenameResult(original=old, target=new, status="pending"))
    for path in args.keep:
        results.append(RenameResult(original=path, target=path, status="保留原名"))

    if not results:
        print(f"OUTPUT_FILE={args.input}")
        print("RENAMED=0")
        print("KEPT=0")
        print("FAILED=0")
        return

    doc_dir = os.path.dirname(os.path.abspath(args.input))
    apply_renames(doc_dir, results)

    # 同步更新 [PROD_ORI] 中的图片链接（脚本接管，无需 AI write 工具）
    link_count = update_markdown_links(args.input, results)

    renamed_count = sum(1 for r in results if r.status == "已重命名")
    kept_count    = sum(1 for r in results if r.status == "保留原名")
    failed_count  = len(results) - renamed_count - kept_count

    print(f"OUTPUT_FILE={args.input}")
    print(f"RENAMED={renamed_count}")
    print(f"KEPT={kept_count}")
    print(f"FAILED={failed_count}")
    print(f"LINKS_UPDATED={link_count}")


if __name__ == "__main__":
    main()
