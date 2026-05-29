#!/usr/bin/env python3
"""lark-doc-to-md 脚本：飞书文档 → 本地 Markdown + images。"""

from __future__ import annotations

import argparse
import json
import mimetypes
import os
import re
import subprocess
import sys
from dataclasses import dataclass
from html import unescape
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen


def _configure_stdio() -> None:
    """在 Windows/VSCode 终端下尽量稳定 stdout/stderr 的 UTF-8 输出。"""
    for stream_name in ("stdout", "stderr"):
        stream = getattr(sys, stream_name, None)
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")


_configure_stdio()


INTERNAL_IMAGE_HOST = "internal-api-drive-stream.feishu.cn"
_IMG_TAG_RE = re.compile(r"<img\b(?P<attrs>[^>]*)/?>", re.IGNORECASE | re.DOTALL)
_ATTR_RE = re.compile(
    r"(?P<name>[\w:-]+)\s*=\s*(?P<quote>['\"])(?P<value>.*?)(?P=quote)",
    re.DOTALL,
)
_MD_IMAGE_RE = re.compile(r"!\[(?P<alt>[^\]]*)\]\((?P<url>https?://[^)\s]+)\)")


@dataclass(frozen=True)
class LocalizeResult:
    content: str
    downloaded: int
    skipped: int


@dataclass(frozen=True)
class ConvertResult:
    output_file: Path
    downloaded: int
    skipped: int


def is_lark_doc_url(value: str) -> bool:
    parsed = urlparse(value.strip())
    if parsed.scheme not in {"http", "https"}:
        return False
    host = parsed.netloc.lower()
    if not (host.endswith(".feishu.cn") or host.endswith(".larksuite.com")):
        return False
    return parsed.path.startswith("/docx/") or parsed.path.startswith("/wiki/")


def _is_internal_image_url(url: str) -> bool:
    parsed = urlparse(unescape(url))
    return parsed.scheme in {"http", "https"} and parsed.netloc.lower() == INTERNAL_IMAGE_HOST


def _parse_attrs(raw_attrs: str) -> dict[str, str]:
    return {match.group("name").lower(): unescape(match.group("value")) for match in _ATTR_RE.finditer(raw_attrs)}


def _extension_from_content_type(content_type: str) -> str:
    media_type = content_type.split(";", 1)[0].strip().lower()
    if media_type == "image/jpeg":
        return ".jpg"
    guessed = mimetypes.guess_extension(media_type)
    return guessed or ".bin"


def download_image_url(url: str, output_base: Path) -> Path:
    request = Request(url, headers={"User-Agent": "po-skill/1.0"})
    with urlopen(request, timeout=30) as response:
        status = getattr(response, "status", 200)
        if status != 200:
            raise RuntimeError(f"图片下载失败：HTTP {status}")
        content_type = response.headers.get("Content-Type", "")
        if not content_type.lower().startswith("image/"):
            raise RuntimeError(f"图片响应不是 image/*：{content_type}")
        ext = _extension_from_content_type(content_type)
        output_path = output_base.with_suffix(ext)
        output_path.write_bytes(response.read())
        return output_path


def _relative_image_ref(path: Path, output_dir: Path) -> str:
    return "./" + path.relative_to(output_dir).as_posix()


def localize_images(content: str, output_dir: Path, downloader=download_image_url) -> LocalizeResult:
    output_dir = Path(output_dir)
    images_dir = output_dir / "images"
    images_dir.mkdir(parents=True, exist_ok=True)
    downloaded = 0
    skipped = 0
    counter = 1

    def next_base() -> Path:
        nonlocal counter
        base = images_dir / f"image-{counter:03d}"
        counter += 1
        return base

    def replace_with_local(url: str, alt: str, original: str) -> str:
        nonlocal downloaded, skipped
        if not _is_internal_image_url(url):
            return original
        try:
            local_path = downloader(url, next_base())
        except Exception:
            skipped += 1
            return original
        downloaded += 1
        return f"![{alt}]({_relative_image_ref(local_path, output_dir)})"

    def replace_img_tag(match: re.Match) -> str:
        attrs = _parse_attrs(match.group("attrs"))
        href = attrs.get("href", "")
        alt = attrs.get("name") or Path(urlparse(href).path).name or "image"
        return replace_with_local(href, alt, match.group(0))

    content = _IMG_TAG_RE.sub(replace_img_tag, content)

    def replace_md_image(match: re.Match) -> str:
        alt = match.group("alt") or f"image-{counter:03d}"
        return replace_with_local(match.group("url"), alt, match.group(0))

    content = _MD_IMAGE_RE.sub(replace_md_image, content)
    return LocalizeResult(content=content, downloaded=downloaded, skipped=skipped)


def _run_command(command: list[str]) -> str:
    try:
        completed = subprocess.run(command, check=True, text=True, capture_output=True)
    except FileNotFoundError as exc:
        raise RuntimeError(f"命令不可用：{command[0]}") from exc
    except subprocess.CalledProcessError as exc:
        stderr = exc.stderr.strip()
        stdout = exc.stdout.strip()
        detail = stderr or stdout or f"exit code {exc.returncode}"
        raise RuntimeError(f"命令执行失败：{' '.join(command)}\n{detail}") from exc
    return completed.stdout


def _extract_content(fetch_stdout: str) -> str:
    payload = json.loads(fetch_stdout)
    content = payload.get("data", {}).get("document", {}).get("content", "")
    if not content.strip():
        raise ValueError("飞书文档内容为空")
    return content


def _derive_title(content: str, fallback: str) -> str:
    for line in content.splitlines():
        stripped = line.strip()
        if stripped.startswith("# "):
            return stripped[2:].strip() or fallback
        if stripped.startswith("<title>") and stripped.endswith("</title>"):
            return re.sub(r"</?title>", "", stripped).strip() or fallback
    return fallback


def _safe_filename(value: str) -> str:
    cleaned = re.sub(r'[\\/:*?"<>|]', "", value).strip()
    return cleaned or "飞书文档"


def fetch_lark_doc_title(doc: str, fallback: str = "飞书文档") -> str:
    stdout = _run_command(
        [
            "lark-cli",
            "docs",
            "+fetch",
            "--api-version",
            "v2",
            "--doc",
            doc,
            "--doc-format",
            "markdown",
        ]
    )
    content = _extract_content(stdout)
    return _safe_filename(_derive_title(content, fallback))


def convert_lark_doc_to_markdown(
    doc: str,
    output_dir: Path,
    *,
    download_url=download_image_url,
) -> ConvertResult:
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    stdout = _run_command(
        [
            "lark-cli",
            "docs",
            "+fetch",
            "--api-version",
            "v2",
            "--doc",
            doc,
            "--doc-format",
            "markdown",
        ]
    )
    content = _extract_content(stdout)
    localized = localize_images(content, output_dir, download_url)
    title = _safe_filename(_derive_title(localized.content, "飞书文档"))
    output_file = output_dir / f"[PROD_ORI]{title}.md"
    output_file.write_text(localized.content, encoding="utf-8")
    return ConvertResult(
        output_file=output_file,
        downloaded=localized.downloaded,
        skipped=localized.skipped,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="飞书文档 → 本地 Markdown + images")
    parser.add_argument("--doc", required=True, help="飞书 docx/wiki URL")
    parser.add_argument("--output-dir", required=True, help="输出目录")
    opts = parser.parse_args()

    try:
        result = convert_lark_doc_to_markdown(opts.doc, Path(opts.output_dir))
    except Exception as exc:
        print(f"错误：{exc}", file=sys.stderr)
        sys.exit(1)

    print(f"OUTPUT_FILE={result.output_file}")
    print(f"MEDIA_DOWNLOADED={result.downloaded}")
    print(f"MEDIA_SKIPPED={result.skipped}")


if __name__ == "__main__":
    main()
