#!/usr/bin/env python3
import argparse
import base64
import hashlib
import hmac
import json
import os
import sys
import time
import urllib.error
import urllib.request


CRITICAL_LEVELS = {"critical", "blocker", "security-critical", "严重", "致命", "阻塞"}
MAX_FINDINGS_IN_MESSAGE = 8


def normalize_text(value):
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    return str(value).strip()


import re

_CONTENT_SEVERITY_RE = re.compile(
    r"\*{1,2}"  # ** or * prefix
    r"\s*"
    r"(Critical|Blocker|Security[-\s]Critical|严重|致命|阻塞)"
    r"\s*"
    r"(?::|：|\*)",  # colon or closing * or literal *
    re.IGNORECASE,
)


def _extract_severity_from_content(content: str) -> str:
    m = _CONTENT_SEVERITY_RE.search(content)
    if m:
        return m.group(1).lower().replace(" ", "-").replace("：", "").replace(":", "")
    return ""


def normalize_severity(item):
    severity = (
        item.get("severity")
        or item.get("level")
        or item.get("priority")
        or item.get("risk")
        or item.get("type")
    )
    if severity:
        return normalize_text(severity).lower()

    content = item.get("content") or item.get("description") or item.get("body")
    if content:
        severity = _extract_severity_from_content(normalize_text(content))
        if severity:
            return severity

    return ""


def is_critical(item):
    severity = normalize_severity(item)
    return severity in CRITICAL_LEVELS


def item_file(item, parent=None):
    parent = parent or {}
    return normalize_text(
        item.get("file")
        or item.get("path")
        or item.get("filename")
        or item.get("relative_path")
        or parent.get("file")
        or parent.get("path")
        or parent.get("filename")
    )


def item_line(item):
    return (
        item.get("line")
        or item.get("start_line")
        or item.get("line_number")
        or item.get("position")
        or ""
    )


def item_title(item):
    return normalize_text(
        item.get("title")
        or item.get("summary")
        or item.get("message")
        or item.get("content")
        or item.get("comment")
        or "严重代码风险"
    )


def item_detail(item):
    return normalize_text(
        item.get("detail")
        or item.get("description")
        or item.get("reason")
        or item.get("body")
    )


def normalize_finding(item, parent=None):
    return {
        "severity": normalize_severity(item),
        "file": item_file(item, parent),
        "line": item_line(item),
        "title": item_title(item),
        "detail": item_detail(item),
    }


def walk_review_items(value, parent=None):
    if isinstance(value, list):
        for entry in value:
            yield from walk_review_items(entry, parent)
        return

    if not isinstance(value, dict):
        return

    if is_critical(value):
        yield normalize_finding(value, parent)

    next_parent = value if item_file(value) else parent
    for key in ("findings", "issues", "comments", "reviews", "results", "items", "problems"):
        child = value.get(key)
        if child is not None:
            yield from walk_review_items(child, next_parent)


def extract_critical_findings(review_data):
    seen = set()
    findings = []
    for finding in walk_review_items(review_data):
        identity = (
            finding.get("severity"),
            finding.get("file"),
            finding.get("line"),
            finding.get("title"),
            finding.get("detail"),
        )
        if identity in seen:
            continue
        seen.add(identity)
        findings.append(finding)
    return findings


def feishu_sign(timestamp, secret):
    string_to_sign = f"{timestamp}\n{secret}"
    digest = hmac.new(
        string_to_sign.encode("utf-8"),
        b"",
        digestmod=hashlib.sha256,
    ).digest()
    return base64.b64encode(digest).decode("utf-8")


def build_feishu_payload(findings, repo, pr_title, pr_url, secret="", timestamp=None):
    timestamp = timestamp or str(int(time.time()))
    lines = [
        "AiWorkbench PR 发现严重代码风险",
        "",
        f"仓库：{repo}",
        f"PR：{pr_title}",
        f"链接：{pr_url}",
        "",
        "问题摘要：",
    ]

    for index, item in enumerate(findings[:MAX_FINDINGS_IN_MESSAGE], 1):
        location = item.get("file") or "未知文件"
        if item.get("line"):
            location = f"{location}:{item['line']}"
        lines.append(f"{index}. [{item.get('severity', 'critical')}] {location}")
        lines.append(f"   {item.get('title') or '严重代码风险'}")
        if item.get("detail"):
            lines.append(f"   {item['detail']}")

    if len(findings) > MAX_FINDINGS_IN_MESSAGE:
        lines.append("")
        lines.append(f"还有 {len(findings) - MAX_FINDINGS_IN_MESSAGE} 个严重问题，请查看 GitHub Actions artifact。")

    payload = {
        "msg_type": "text",
        "content": {
            "text": "\n".join(lines),
        },
    }

    if secret:
        payload["timestamp"] = timestamp
        payload["sign"] = feishu_sign(timestamp, secret)

    return payload


def post_feishu(webhook, payload):
    request = urllib.request.Request(
        webhook,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=15) as response:
        return response.status, response.read().decode("utf-8")


def load_json(path):
    with open(path, "r", encoding="utf-8") as file:
        content = file.read().strip()
    if not content:
        return {}
    return json.loads(content)


def parse_args(argv):
    parser = argparse.ArgumentParser(description="Notify Feishu when OCR review has critical findings.")
    parser.add_argument("review_json", help="Path to ocr-review.json")
    parser.add_argument(
        "--fail-on-notify-error",
        action="store_true",
        help="Return non-zero if Feishu notification fails.",
    )
    return parser.parse_args(argv)


def main(argv=None):
    args = parse_args(argv or sys.argv[1:])
    webhook = os.environ.get("FEISHU_WEBHOOK", "").strip()
    secret = os.environ.get("FEISHU_SECRET", "").strip()

    review_data = load_json(args.review_json)
    findings = extract_critical_findings(review_data)
    if not findings:
        print("No critical issues found.")
        return 0

    if not webhook:
        print("Critical issues found, but FEISHU_WEBHOOK is not configured.", file=sys.stderr)
        return 2 if args.fail_on_notify_error else 0

    payload = build_feishu_payload(
        findings,
        repo=os.environ.get("REPO", ""),
        pr_title=os.environ.get("PR_TITLE", ""),
        pr_url=os.environ.get("PR_URL", ""),
        secret=secret,
    )

    try:
        status, body = post_feishu(webhook, payload)
    except (urllib.error.URLError, TimeoutError) as exc:
        print(f"Failed to notify Feishu: {exc}", file=sys.stderr)
        return 2 if args.fail_on_notify_error else 0

    print(f"Feishu notification sent. status={status} body={body}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
