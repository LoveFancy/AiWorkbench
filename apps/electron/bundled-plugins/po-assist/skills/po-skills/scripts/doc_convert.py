#!/usr/bin/env python3
"""doc-convert 脚本：Confluence 页面 → 本地 Markdown 文件

支持两种输入方式：
  --url   Confluence 页面 URL 或纯数字 page_id（需要 HTSC_WIKI_TOKEN）
  --file  本地 JSON 文件路径（Confluence API 响应格式，无需 Token）
"""

import os
import sys
import json
import subprocess
import argparse
import requests
from urllib.parse import urlparse, parse_qs

# 确保脚本所在目录在 sys.path 中，以便直接 import 同级模块
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import wiki_fetcher
import image_downloader
import markdowner


def _configure_stdio() -> None:
    """在 Windows/VSCode 终端下尽量稳定 stdout/stderr 的 UTF-8 输出。"""
    for stream_name in ("stdout", "stderr"):
        stream = getattr(sys, stream_name, None)
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")


_configure_stdio()


def extract_page_id(url_or_id: str) -> str:
    """从 URL 或纯数字中提取 page_id。"""
    stripped = url_or_id.strip()
    if stripped.isdigit():
        return stripped
    parsed = urlparse(stripped)
    if parsed.scheme and parsed.netloc:
        params = parse_qs(parsed.query)
        if "pageId" in params:
            page_id = params["pageId"][0]
            if page_id.isdigit():
                return page_id
        raise ValueError(f"URL 中未找到有效的 pageId 参数：{url_or_id!r}")
    raise ValueError(f"无效的 page_id 或 URL：{url_or_id!r}")


def load_from_json(json_path: str) -> tuple[str, str, str]:
    """
    从本地 JSON 文件加载 Confluence 页面数据。

    JSON 格式与 Confluence REST API 响应一致：
      { "title": "...", "body": { "storage": { "value": "<html>..." } } }

    返回 (title, html, page_id)，page_id 从 id 字段读取，缺失时返回空字符串。
    """
    with open(json_path, encoding="utf-8") as f:
        data = json.load(f)

    title = data.get("title", os.path.splitext(os.path.basename(json_path))[0])
    html = data.get("body", {}).get("storage", {}).get("value", "")
    page_id = str(data.get("id", ""))

    if not html:
        raise ValueError(f"JSON 文件中未找到 body.storage.value 字段：{json_path!r}")

    return title, html, page_id


def save_markdown(content: str, title: str, output_dir: str) -> str:
    """保存为 [PROD_ORI]<title>.md，返回完整输出路径。"""
    if not os.path.isdir(output_dir):
        raise FileNotFoundError(f"输出目录不存在：{output_dir}")
    filename = f"[PROD_ORI]{title}.md"
    output_path = os.path.join(output_dir, filename)
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(content)
    return output_path


def _fetch_page_title(token: str, page_id: str) -> str:
    """从 Confluence API 获取页面标题，requests 失败时用 curl 兜底。"""
    import subprocess
    url = f"{wiki_fetcher.BASE_URL}/rest/api/content/{page_id}"
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}

    # 先用 requests（绕过系统代理，与 curl 行为一致）
    try:
        resp = requests.get(url, headers=headers, timeout=10, proxies={"http": None, "https": None})
        if resp.ok and resp.headers.get("Content-Type", "").startswith("application/json"):
            title = resp.json().get("title", "")
            if title:
                return title
    except Exception:
        pass

    # curl 兜底
    try:
        cmd = ["curl", "-s", "-H", f"Authorization: Bearer {token}", url]
        result = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", timeout=15)
        data = json.loads(result.stdout)
        title = data.get("title", "")
        if title:
            return title
    except Exception:
        pass

    return page_id


def main():
    parser = argparse.ArgumentParser(description="Confluence 页面 → 本地 Markdown 文件")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--url", help="Confluence 页面 URL 或纯数字 page_id")
    group.add_argument("--file", help="本地 JSON 文件路径（Confluence API 响应格式）")
    parser.add_argument("--output-dir", default=".", help="输出目录（默认当前目录）")
    args = parser.parse_args()

    if args.file:
        # 本地 JSON 模式：无需 Token
        try:
            title, html, page_id = load_from_json(args.file)
        except (ValueError, json.JSONDecodeError, FileNotFoundError) as e:
            print(f"错误：{e}", file=sys.stderr)
            sys.exit(1)

        # 图片下载：JSON 模式下无 Token，跳过需要认证的图片
        token = os.environ.get("HTSC_WIKI_TOKEN", "")
        html_with_local, failed_urls, image_records = image_downloader.download_images(
            html, args.output_dir, token, page_id=page_id
        )
        markdown = markdowner.to_markdown(html_with_local)
        output_path = save_markdown(markdown, title, args.output_dir)

        print(f"OUTPUT_FILE={output_path}")
        if failed_urls:
            print(f"警告：{len(failed_urls)} 张图片下载失败，已保留原始 URL")
        else:
            print("图片处理：完成")

    else:
        # 远程 URL 模式：需要 Token
        token = os.environ.get("HTSC_WIKI_TOKEN")
        if not token:
            print(
                "环境变量 HTSC_WIKI_TOKEN 未设置。\n"
                "请在 <技能根目录>/.env 中配置：\n"
                "HTSC_WIKI_TOKEN=<你的 Confluence Personal Access Token>\n\n"
                "获取方式：登录 Wiki → 右上角头像 → 个人设置 → 个人访问令牌（Personal Access Tokens）→ 创建并复制 Token。\n"
                "注意：这里需要的是 Wiki Token，不是浏览器 Cookie。",
                file=sys.stderr,
            )
            sys.exit(1)

        try:
            page_id = extract_page_id(args.url)
        except ValueError as e:
            print(str(e), file=sys.stderr)
            sys.exit(1)

        title = _fetch_page_title(token, page_id)

        try:
            html = wiki_fetcher.fetch_wiki_content(token, page_id)
        except wiki_fetcher.WikiFetcherError as e:
            msg = str(e)
            if "认证失败" in msg:
                print("认证失败：Token 无效或无权限", file=sys.stderr)
            elif "不存在" in msg or "无访问权限" in msg:
                print("页面不存在或无访问权限", file=sys.stderr)
            else:
                print(msg, file=sys.stderr)
            sys.exit(1)

        html_with_local, failed_urls, image_records = image_downloader.download_images(
            html, args.output_dir, token, page_id=page_id
        )
        markdown = markdowner.to_markdown(html_with_local)
        output_path = save_markdown(markdown, title, args.output_dir)

        print(f"OUTPUT_FILE={output_path}")
        if failed_urls:
            print(f"警告：{len(failed_urls)} 张图片下载失败，已保留原始 URL")
        else:
            print("图片下载：全部成功")


if __name__ == "__main__":
    main()
