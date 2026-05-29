#!/usr/bin/env python3
"""wiki-upload 脚本：Markdown -> md2conf -> Confluence Wiki 页面。"""

from __future__ import annotations

import argparse
import os
import re
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse

from console_scripts import resolve_console_script
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
_MD2CONF_LEGACY_API_ERROR_PATTERNS = (
    "ScannedDocument",
    "Scanner().scan()",
    "Scanner().parse()",
    "ConfluenceDocument",
    "object has no len()",
)
_STANDALONE_MD_IMAGE_RE = re.compile(r"^(?P<indent>\s*)!\[(?P<alt>[^\]\n]*)\]\((?P<src>[^)\n]+)\)\s*$")
_MERMAID_FENCE_RE = re.compile(r"(?im)^\s*(?:```|~~~)\s*mermaid(?:\s|$)")
DEFAULT_CONFLUENCE_BASE_URL = "http://wiki.htzq.htsc.com.cn"
MERMAID_CLI_PACKAGE = "@mermaid-js/mermaid-cli"


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


def _html_escape_attr(value: str) -> str:
    return (
        value.replace("&", "&amp;")
        .replace('"', "&quot;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def _left_align_standalone_images(markdown: str) -> str:
    lines = markdown.splitlines(keepends=True)
    rendered = []
    in_fence = False
    for line in lines:
        stripped = line.lstrip()
        if stripped.startswith("```") or stripped.startswith("~~~"):
            in_fence = not in_fence
            rendered.append(line)
            continue
        if in_fence:
            rendered.append(line)
            continue

        line_body = line[:-1] if line.endswith("\n") else line
        newline = "\n" if line.endswith("\n") else ""
        match = _STANDALONE_MD_IMAGE_RE.match(line_body)
        if not match:
            rendered.append(line)
            continue

        alt = _html_escape_attr(match.group("alt").strip())
        src = _html_escape_attr(match.group("src").strip())
        rendered.append(f'{match.group("indent")}<p style="text-align: left;"><img src="{src}" alt="{alt}" /></p>{newline}')

    return "".join(rendered)


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
    body = _left_align_standalone_images(body)

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


def _default_skill_dir() -> Path:
    return Path(__file__).resolve().parents[1]


def _local_node_bin_dir(skill_dir: Path) -> Path:
    return skill_dir / "node_modules" / ".bin"


def _local_mermaid_cli_paths(skill_dir: Path) -> list[Path]:
    local_bin = _local_node_bin_dir(skill_dir)
    return [local_bin / "mmdc", local_bin / "mmdc.cmd", local_bin / "mmdc.ps1"]


def _has_mermaid_fence(markdown: str) -> bool:
    return bool(_MERMAID_FENCE_RE.search(markdown))


def _prepend_local_node_bin(env: dict[str, str], skill_dir: Path) -> dict[str, str]:
    updated = dict(env)
    local_bin = str(_local_node_bin_dir(skill_dir))
    current_path = updated.get("PATH", os.environ.get("PATH", ""))
    parts = [part for part in current_path.split(os.pathsep) if part]
    if local_bin not in parts:
        updated["PATH"] = os.pathsep.join([local_bin, *parts])
    else:
        updated["PATH"] = os.pathsep.join(parts)
    return updated


def _mermaid_cli_available(env: dict[str, str], skill_dir: Path) -> bool:
    if any(path.exists() for path in _local_mermaid_cli_paths(skill_dir)):
        return True
    return shutil.which("mmdc", path=env.get("PATH", os.environ.get("PATH", ""))) is not None


def _install_mermaid_cli(command: list[str], *, cwd: Path, env: dict[str, str]) -> str:
    return _run_command(command, cwd=cwd, env=env)


def _ensure_mermaid_cli_for_markdown(
    markdown: str,
    env: dict[str, str],
    *,
    skill_dir: Path | None = None,
) -> dict[str, str]:
    if not _has_mermaid_fence(markdown):
        return env

    resolved_skill_dir = skill_dir or _default_skill_dir()
    env_with_node_bin = _prepend_local_node_bin(env, resolved_skill_dir)
    if _mermaid_cli_available(env_with_node_bin, resolved_skill_dir):
        return env_with_node_bin

    npm = shutil.which("npm", path=os.environ.get("PATH", "")) or "npm"
    command = ["npm", "install", "--prefix", str(resolved_skill_dir), MERMAID_CLI_PACKAGE]
    if npm != "npm":
        command[0] = npm
    _install_mermaid_cli(command, cwd=resolved_skill_dir, env=env_with_node_bin)

    if not _mermaid_cli_available(env_with_node_bin, resolved_skill_dir):
        raise RuntimeError(
            "Mermaid CLI 安装完成后仍未找到 mmdc。请检查 npm 安装输出，或手工确认 "
            f"{_local_node_bin_dir(resolved_skill_dir)} 是否存在 mmdc。"
        )
    return env_with_node_bin


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
    env["PYTHONIOENCODING"] = "utf-8"
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


def _resolve_md2conf_bin(md2conf_bin: str) -> str:
    configured = md2conf_bin.strip() or "md2conf"
    if configured != "md2conf":
        return configured
    return resolve_console_script("md2conf", executable_finder=shutil.which) or configured


def _redact_command(command: list[str]) -> str:
    redacted = []
    redact_next = False
    for part in command:
        if redact_next:
            redacted.append("<redacted>")
            redact_next = False
            continue
        redacted.append(part)
        if part in {"-a", "--api-key", "--token", "--password"}:
            redact_next = True
    return " ".join(redacted)


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
        raise RuntimeError(f"命令执行失败：{_redact_command(command)}\n{detail}") from exc
    return "\n".join(part for part in (completed.stdout.strip(), completed.stderr.strip()) if part).strip()


def _summarize_md2conf_error(detail: str) -> str:
    match = _MD2CONF_DESCENDANT_PAGE_ERROR_RE.search(detail)
    if match and "PageError" in detail:
        page_id = match.group(1)
        return (
            f"Wiki 中已存在同名页面（页面 ID：{page_id}），但该页面不在当前目标父页面下。"
            "请修改页面标题后重新同步，或改用 update 模式指定正确页面 ID。"
        )
    if any(pattern in detail for pattern in _MD2CONF_LEGACY_API_ERROR_PATTERNS):
        return (
            "md2conf 命令来自旧版或冲突包，当前 wiki-upload 需要 "
            "`markdown-to-confluence` 提供的 md2conf CLI。"
            "请卸载旧版 md2conf 包，或确认 PATH 中优先使用 markdown-to-confluence 安装的 md2conf.exe。"
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
    env = _ensure_mermaid_cli_for_markdown(sync_source.read_text(encoding="utf-8"), env)

    try:
        command = build_md2conf_command(
            sync_source,
            base_url=base_url,
            token=token,
            md2conf_bin=_resolve_md2conf_bin(md2conf_bin),
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
        print(
            "环境变量 HTSC_WIKI_TOKEN 未设置。\n"
            "WIKI_TOKEN_REQUIRED=true\n"
            "ENV_FILE=${CLAUDE_PLUGIN_ROOT}/skills/po-skills/.env\n"
            "请向用户索取 Wiki Personal Access Token，并写入或更新 ENV_FILE 中的 HTSC_WIKI_TOKEN。\n"
            "不要在对话中回显 Token 明文；写入后重新执行刚才失败的命令。",
            file=sys.stderr,
        )
        sys.exit(1)

    if opts.mode == "create":
        space_key = opts.space_key.strip() or os.environ.get("HTSC_WIKI_SPACE_KEY", "").strip()
        raw_parent_page = (
            opts.parent_page_id.strip()
            or os.environ.get("HTSC_WIKI_PARENT_PAGE_ID", "").strip()
            or os.environ.get("HTSC_WIKI_PARENT_PAGE_URL", "").strip()
        )
    else:
        space_key = ""
        raw_parent_page = ""
    try:
        parent_page_id = _normalize_page_id(raw_parent_page)
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)

    if opts.mode == "create" and not space_key:
        print("create 模式需要 --space-key，或在项目根目录 .env 配置 HTSC_WIKI_SPACE_KEY", file=sys.stderr)
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
