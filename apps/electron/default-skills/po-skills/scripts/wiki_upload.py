#!/usr/bin/env python3
"""wiki-upload 脚本：Markdown -> md2conf -> Confluence Wiki 页面。"""

from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse

from wiki_network import build_confluence_env


_PAGE_ID_RE = re.compile(r"(?:pageId=|confluence-page-id[:=]\s*)(\d+)", re.IGNORECASE)
_PAGE_URL_RE = re.compile(r"https?://\S+pages/viewpage\.action\?pageId=(\d+)", re.IGNORECASE)
_CONFLUENCE_META_COMMENT_RE = re.compile(
    r"^\s*<!--\s*confluence-(?:page-id|space-key)\s*:\s*.*?-->\s*$",
    re.IGNORECASE | re.MULTILINE,
)
_MD2CONF_DESCENDANT_PAGE_ERROR_RE = re.compile(
    r"expected:\s*page with ID\s+(\d+)\s+to be a descendant of the root page",
    re.IGNORECASE,
)
DEFAULT_CONFLUENCE_BASE_URL = "http://wiki.htzq.htsc.com.cn"


def _configure_stdio() -> None:
    """在 Windows/VSCode 终端下尽量稳定 stdout/stderr 的 UTF-8 输出。"""
    for stream_name in ("stdout", "stderr"):
        stream = getattr(sys, stream_name, None)
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")


_configure_stdio()


@dataclass(frozen=True)
class WikiUploadResult:
    markdown_path: Path
    sync_path: Path
    page_id: str
    page_title: str
    page_url: str
    mode: str
    command_output: str


def _default_page_url(base_url: str, page_id: str) -> str:
    if not page_id:
        return ""
    return f"{base_url.rstrip('/')}/pages/viewpage.action?pageId={page_id}"


def _normalize_confluence_base_url(base_url: str) -> tuple[str, str]:
    parsed = urlparse(base_url)
    if not parsed.scheme or not parsed.netloc:
        raise ValueError(f"无效的 Confluence base URL：{base_url}")
    path = parsed.path or "/"
    return parsed.netloc, path.rstrip("/") + "/"


def _confluence_api_url(base_url: str) -> str:
    parsed = urlparse(base_url)
    if not parsed.scheme or not parsed.netloc:
        raise ValueError(f"无效的 Confluence base URL：{base_url}")
    root = f"{parsed.scheme}://{parsed.netloc}{(parsed.path or '').rstrip('/')}"
    return root.rstrip("/") + "/"


def _split_front_matter(text: str) -> tuple[str, str]:
    if not text.startswith("---\n"):
        return "", text
    lines = text.splitlines(keepends=True)
    for idx in range(1, len(lines)):
        if lines[idx].strip() == "---":
            return "".join(lines[: idx + 1]), "".join(lines[idx + 1 :])
    return "", text


def _merge_title_into_front_matter(front_matter: str, title: str) -> str:
    body = front_matter.splitlines()
    if len(body) < 2:
        return front_matter
    for idx in range(1, len(body) - 1):
        if re.match(r"^\s*title\s*:", body[idx]):
            body[idx] = f'title: "{title}"'
            return "\n".join(body) + "\n"
    body.insert(1, f'title: "{title}"')
    return "\n".join(body) + "\n"


def _prepare_sync_source(
    markdown_path: Path,
    *,
    title: str = "",
    page_id: str = "",
    space_key: str = "",
) -> tuple[Path, bool]:
    content = markdown_path.read_text(encoding="utf-8")
    front_matter, body = _split_front_matter(content)
    body = _CONFLUENCE_META_COMMENT_RE.sub("", body)

    if title:
        if front_matter:
            front_matter = _merge_title_into_front_matter(front_matter, title)
        else:
            front_matter = f'---\ntitle: "{title}"\n---\n'

    comments = []
    if page_id:
        comments.append(f"<!-- confluence-page-id: {page_id} -->")
    if space_key:
        comments.append(f"<!-- confluence-space-key: {space_key} -->")

    pieces = []
    if front_matter:
        pieces.append(front_matter.rstrip("\n"))
    if comments:
        pieces.append("\n".join(comments))
    if body:
        pieces.append(body.lstrip("\n"))

    rendered = "\n\n".join(piece for piece in pieces if piece).rstrip() + "\n"

    with tempfile.NamedTemporaryFile(
        mode="w",
        encoding="utf-8",
        suffix=markdown_path.suffix,
        prefix=f".{markdown_path.stem}.wiki-upload-",
        dir=str(markdown_path.parent),
        delete=False,
    ) as handle:
        handle.write(rendered)
        return Path(handle.name), True


def _build_env(
    *,
    base_url: str,
    token: str,
    username: str = "",
    space_key: str = "",
    api_version: str = "v1",
) -> dict[str, str]:
    env = build_confluence_env(base_url)
    domain, path = _normalize_confluence_base_url(base_url)
    env["CONFLUENCE_DOMAIN"] = domain
    env["CONFLUENCE_PATH"] = path
    env["CONFLUENCE_API_KEY"] = token
    env["CONFLUENCE_API_VERSION"] = api_version
    env["CONFLUENCE_API_URL"] = _confluence_api_url(base_url)
    if username:
        env["CONFLUENCE_USER_NAME"] = username
    if space_key:
        env["CONFLUENCE_SPACE_KEY"] = space_key
    return env


def build_md2conf_command(
    source_path: Path,
    *,
    base_url: str,
    token: str,
    md2conf_bin: str = "md2conf",
    space_key: str = "",
    root_page_id: str = "",
    username: str = "",
    api_version: str = "v1",
) -> list[str]:
    domain, path = _normalize_confluence_base_url(base_url)
    command = [
        md2conf_bin,
        str(source_path),
        "-d",
        domain,
        "-p",
        path,
        "-a",
        token,
        "--api-version",
        api_version,
        "--api-url",
        _confluence_api_url(base_url),
    ]
    if username:
        command += ["-u", username]
    if space_key:
        command += ["-s", space_key]
    if root_page_id:
        command += ["-r", root_page_id]
    return command


def _run_command(command: list[str], *, cwd: Path | None = None, env: dict[str, str] | None = None) -> str:
    try:
        completed = subprocess.run(
            command,
            cwd=str(cwd) if cwd else None,
            env=env,
            check=True,
            text=True,
            capture_output=True,
        )
    except FileNotFoundError as exc:
        raise RuntimeError(f"命令不可用：{command[0]}") from exc
    except subprocess.CalledProcessError as exc:
        stderr = (exc.stderr or "").strip()
        stdout = (exc.stdout or "").strip()
        detail = stderr or stdout or f"exit code {exc.returncode}"
        detail = _summarize_md2conf_error(detail)
        raise RuntimeError(f"命令执行失败：{' '.join(command)}\n{detail}") from exc
    return "\n".join(part for part in (completed.stdout.strip(), completed.stderr.strip()) if part).strip()


def _summarize_md2conf_error(detail: str) -> str:
    match = _MD2CONF_DESCENDANT_PAGE_ERROR_RE.search(detail)
    if match and "PageError" in detail:
        page_id = match.group(1)
        return (
            f"Wiki 中已存在同名页面（页面 ID：{page_id}），但该页面不在当前目标父页面下。"
            "请修改页面标题后重新同步，或改用 update 模式指定正确页面 ID。"
        )
    return detail


def _extract_page_id(command_output: str) -> str:
    for pattern in (_PAGE_URL_RE, _PAGE_ID_RE):
        match = pattern.search(command_output)
        if match:
            return match.group(1)
    return ""


def _normalize_page_id(value: str) -> str:
    value = value.strip()
    if not value:
        return ""
    match = _PAGE_ID_RE.search(value) or _PAGE_URL_RE.search(value)
    if match:
        return match.group(1)
    if value.isdigit():
        return value
    raise ValueError(f"无效的页面 ID 或 URL：{value}")


def publish_markdown_to_confluence(
    markdown_path: Path,
    *,
    base_url: str,
    token: str,
    space_key: str | None = None,
    root_page_id: str | None = None,
    page_id: str | None = None,
    title: str = "",
    mode: str = "create",
    md2conf_bin: str = "md2conf",
    username: str = "",
) -> WikiUploadResult:
    markdown_path = markdown_path.expanduser().resolve()
    if not markdown_path.is_file():
        raise FileNotFoundError(f"Markdown 文件不存在：{markdown_path}")
    if markdown_path.suffix.lower() not in {".md", ".markdown", ".mark"}:
        raise ValueError(f"仅支持 Markdown 文件：{markdown_path}")

    sync_source, created_temp = _prepare_sync_source(
        markdown_path,
        title=title,
        page_id=page_id or "",
        space_key=space_key or "",
    )
    env = _build_env(
        base_url=base_url,
        token=token,
        username=username,
        space_key=space_key or "",
        api_version="v1",
    )

    try:
        command = build_md2conf_command(
            sync_source,
            base_url=base_url,
            token=token,
            md2conf_bin=md2conf_bin,
            space_key=space_key or "",
            root_page_id=root_page_id or "",
            username=username,
            api_version="v1",
        )
        command_output = _run_command(command, cwd=sync_source.parent, env=env)
        resolved_page_id = page_id or _extract_page_id(command_output) or _extract_page_id(
            sync_source.read_text(encoding="utf-8")
        )
        return WikiUploadResult(
            markdown_path=markdown_path,
            sync_path=sync_source,
            page_id=resolved_page_id,
            page_title=title or markdown_path.stem,
            page_url=_default_page_url(base_url, resolved_page_id),
            mode=mode,
            command_output=command_output,
        )
    finally:
        if created_temp:
            try:
                sync_source.unlink()
            except OSError:
                pass


def main() -> None:
    parser = argparse.ArgumentParser(description="将本地 Markdown 发布到 Confluence Wiki")
    parser.add_argument("--file", required=True, help="本地 Markdown 文件路径")
    parser.add_argument("--mode", choices=("create", "update"), default="create")
    parser.add_argument("--space-key", default="", help="Confluence Space Key")
    parser.add_argument("--parent-page-id", default="", help="父页面 ID 或页面 URL")
    parser.add_argument("--page-id", default="", help="已存在页面 ID")
    parser.add_argument("--title", default="", help="页面标题")
    parser.add_argument("--md2conf-bin", default="md2conf", help="md2conf 可执行文件路径")
    parser.add_argument("--username", default="", help="Confluence 用户名")
    opts = parser.parse_args()

    token = (os.environ.get("HTSC_WIKI_TOKEN") or os.environ.get("CONFLUENCE_API_KEY") or "").strip()
    if not token:
        print("环境变量 HTSC_WIKI_TOKEN 未设置", file=sys.stderr)
        sys.exit(1)

    space_key = opts.space_key.strip() or os.environ.get("HTSC_WIKI_SPACE_KEY", "").strip()
    raw_parent_page = (
        opts.parent_page_id.strip()
        or os.environ.get("HTSC_WIKI_PARENT_PAGE_ID", "").strip()
        or os.environ.get("HTSC_WIKI_PARENT_PAGE_URL", "").strip()
    )
    try:
        parent_page_id = _normalize_page_id(raw_parent_page)
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)

    if opts.mode == "create" and not space_key:
        print("create 模式需要 --space-key", file=sys.stderr)
        sys.exit(1)
    if opts.mode == "update" and not opts.page_id.strip():
        print("update 模式需要 --page-id", file=sys.stderr)
        sys.exit(1)

    try:
        result = publish_markdown_to_confluence(
            Path(opts.file),
            base_url=DEFAULT_CONFLUENCE_BASE_URL,
            token=token,
            space_key=space_key or None,
            root_page_id=parent_page_id or None,
            page_id=opts.page_id.strip() or None,
            title=opts.title.strip(),
            mode=opts.mode,
            md2conf_bin=opts.md2conf_bin.strip() or "md2conf",
            username=opts.username.strip(),
        )
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)

    print(f"CONFLUENCE_PAGE_ID={result.page_id}")
    print(f"CONFLUENCE_PAGE_TITLE={result.page_title}")
    print(f"CONFLUENCE_PAGE_URL={result.page_url}")
    print(f"MODE={result.mode}")
    if result.command_output:
        print("MD2CONF_OUTPUT_BEGIN")
        print(result.command_output)
        print("MD2CONF_OUTPUT_END")


if __name__ == "__main__":
    main()
