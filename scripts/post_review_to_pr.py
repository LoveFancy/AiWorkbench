#!/usr/bin/env python3
"""Post OCR review results as a PR comment and auto-close if critical issues found."""

import argparse
import json
import os
import re
import subprocess
import sys
import textwrap

CRITICAL_LEVELS = {"critical", "blocker", "security-critical", "严重", "致命", "阻塞"}

_CONTENT_SEVERITY_RE = re.compile(
    r"\*{1,2}"
    r"\s*"
    r"(Critical|Blocker|Security[-\s]Critical|严重|致命|阻塞|Warning|Info|建议|提示)"
    r"\s*"
    r"(?::|：|\*)",
    re.IGNORECASE,
)

MAX_BODY_BYTES = 60000


def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        content = f.read().strip()
    if not content:
        return {}
    return json.loads(content)


def extract_severity(comment):
    content = comment.get("content", "")
    m = _CONTENT_SEVERITY_RE.search(content)
    if m:
        return m.group(1).lower().replace(" ", "-").replace("：", "").replace(":", "")
    return ""


def is_critical_severity(severity: str) -> bool:
    return severity.lower() in CRITICAL_LEVELS


def build_comment_body(comments, summary):
    parts = ["## Open Code Review 结果", ""]

    if summary:
        files_reviewed = summary.get("files_reviewed", 0)
        total_comments = summary.get("comments", len(comments))
        elapsed = summary.get("elapsed", "")
        parts.append(f"审查了 **{files_reviewed}** 个文件，共 **{total_comments}** 条意见" + (f"（耗时 {elapsed}）" if elapsed else ""))
        parts.append("")

    if not comments:
        parts.extend([
            "未发现代码风险。",
        ])
        return "\n".join(parts)

    has_critical = any(is_critical_severity(extract_severity(c)) for c in comments)

    parts.append("| 文件 | 行 | 摘要 |")
    parts.append("|------|-----|------|")

    for c in comments:
        path = c.get("path", "?")
        start = c.get("start_line", "")
        end = c.get("end_line", "")
        line_str = f"{start}-{end}" if end and end != start else str(start) if start else "-"
        content = c.get("content", "")
        # 截取第一行作为摘要
        first_line = content.split("\n")[0].strip()
        # 去除 markdown bold 标记
        first_line = re.sub(r"\*{1,2}", "", first_line).strip(":： ")
        if len(first_line) > 120:
            first_line = first_line[:117] + "..."

        parts.append(f"| `{path}` | {line_str} | {first_line} |")

    parts.append("")

    if has_critical:
        parts.append("> 发现严重代码风险，PR 已自动关闭。")

    body = "\n".join(parts)
    if len(body.encode("utf-8")) > MAX_BODY_BYTES:
        body = "\n".join(parts[: len(parts) - (len(comments) // 2)])
        body += "\n\n> 内容过长已截断，完整结果请查看 GitHub Actions artifact。"
    return body


def build_close_comment(comments):
    critical_comments = [c for c in comments if is_critical_severity(extract_severity(c))]
    parts = [
        "发现严重代码风险，PR 已自动关闭：",
        "",
    ]
    for i, c in enumerate(critical_comments[:5], 1):
        path = c.get("path", "?")
        content = c.get("content", "")
        first_line = content.split("\n")[0].strip()
        first_line = re.sub(r"\*{1,2}", "", first_line).strip(":： ")
        parts.append(f"{i}. `{path}` — {first_line}")

    if len(critical_comments) > 5:
        parts.append(f"\n... 还有 {len(critical_comments) - 5} 个严重问题")

    return "\n".join(parts)


def run_gh(args):
    """Run gh CLI command, return True on success."""
    try:
        result = subprocess.run(
            ["gh"] + args,
            capture_output=True,
            text=True,
            timeout=30,
        )
        if result.returncode != 0:
            print(f"gh {' '.join(args)} failed: {result.stderr}", file=sys.stderr)
            return False
        print(result.stdout)
        return True
    except (subprocess.TimeoutExpired, FileNotFoundError) as exc:
        print(f"gh command failed: {exc}", file=sys.stderr)
        return False


def parse_args(argv):
    parser = argparse.ArgumentParser(description="Post OCR review results to PR.")
    parser.add_argument("review_json", help="Path to ocr-review.json")
    parser.add_argument("--dry-run", action="store_true", help="Print comment body without posting")
    return parser.parse_args(argv)


def main(argv=None):
    args = parse_args(argv or sys.argv[1:])

    pr_url = os.environ.get("PR_URL", "").strip()
    if not pr_url and not args.dry_run:
        print("PR_URL env var not set, skipping.", file=sys.stderr)
        return 0

    data = load_json(args.review_json)
    comments = data.get("comments", [])
    summary = data.get("summary", {})

    body = build_comment_body(comments, summary)

    if args.dry_run:
        print(body)
        return 0

    # 1. Always post review comment
    if not run_gh(["pr", "comment", pr_url, "--body", body]):
        print("Failed to post review comment.", file=sys.stderr)
        return 2

    # 2. Close PR if critical issues found
    if any(is_critical_severity(extract_severity(c)) for c in comments):
        print("Critical issues found, closing PR...")
        close_body = build_close_comment(comments)
        if run_gh(["pr", "close", pr_url, "--comment", close_body]):
            print("PR closed.")
        else:
            print("Failed to close PR.", file=sys.stderr)
            return 2

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
