#!/usr/bin/env python3
"""doc-to-md 脚本：本地文档 → 本地 Markdown 文件。"""

import argparse
import base64
import binascii
import os
import re
import sys
import zipfile


def _configure_stdio() -> None:
    """在 Windows/VSCode 终端下尽量稳定 stdout/stderr 的 UTF-8 输出。"""
    for stream_name in ("stdout", "stderr"):
        stream = getattr(sys, stream_name, None)
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")


_configure_stdio()


MIME_TO_EXT = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/bmp": "bmp",
    "image/svg+xml": "svg",
}

_MD_IMAGE_RE = re.compile(
    r"!\[(?P<alt>[^\]]*)\]"
    r"\(\s*"
    r"data:"
    r"(?P<mime>image/[-+\w]+)"
    r";base64,"
    r"(?P<data>[^)\s]+)"
    r"\s*\)",
    re.VERBOSE | re.IGNORECASE,
)

_HTML_IMG_RE = re.compile(
    r"<img"
    r"(?P<before>[^>]*?)"
    r"\s+src\s*=\s*\""
    r"data:"
    r"(?P<mime>image/[-+\w]+)"
    r";base64,"
    r"(?P<data>[^\"\s]+)"
    r"\""
    r"(?P<after>[^>]*?)"
    r"/?>",
    re.VERBOSE | re.DOTALL | re.IGNORECASE,
)

_TRUNCATED_DATA_IMAGE_RE = re.compile(
    r"!\[(?P<alt>[^\]]*)\]\(\s*data:(?P<mime>image/[-+\w]+);?base64(?:,)?\.{3}\s*\)",
    re.IGNORECASE,
)


def _looks_like_html_wrapped_doc(input_path: str) -> bool:
    """识别被保存成 .doc 的 Wiki HTML/MHTML 包装文件。"""
    try:
        with open(input_path, "rb") as f:
            sample = f.read(16384)
    except OSError:
        return False

    lowered = sample.lower()
    stripped = lowered.lstrip()
    if stripped.startswith(b"<!doctype html") or stripped.startswith(b"<html"):
        return True
    return (
        b"mime-version:" in lowered
        and b"multipart/related" in lowered
        and b"text/html" in lowered
    )


def _reject_html_wrapped_doc(input_path: str) -> None:
    if not _looks_like_html_wrapped_doc(input_path):
        return
    raise ValueError(
        "检测到 Confluence/Wiki 导出的 MHTML/HTML 包装文件。"
        "请优先使用 Wiki URL 执行 doc-convert，避免本地导出的 .doc 丢失图片和结构。"
    )


def _scan_existing_counters(images_dir: str) -> dict[str, int]:
    """扫描 images/ 目录，返回每个扩展名下一个可用的编号。"""
    counters: dict[str, int] = {ext: 1 for ext in MIME_TO_EXT.values()}
    if not os.path.isdir(images_dir):
        return counters

    pattern = re.compile(r"^image-(\d+)\.(.+)$")
    for fname in os.listdir(images_dir):
        match = pattern.match(fname)
        if not match:
            continue
        num = int(match.group(1))
        ext = match.group(2)
        if ext in counters:
            counters[ext] = max(counters[ext], num + 1)
    return counters


def _next_name(counters: dict[str, int], ext: str) -> str:
    """分配下一个文件名，并递增计数器。"""
    num = counters[ext]
    counters[ext] = num + 1
    return f"image-{num:03d}.{ext}"


def extract_inline_images(markdown: str, output_dir: str) -> tuple[str, int, int]:
    """提取 Markdown 中的内联 base64 图片到 images/ 目录。"""
    images_dir = os.path.join(output_dir, "images")
    os.makedirs(images_dir, exist_ok=True)

    counters = _scan_existing_counters(images_dir)
    extracted = 0
    skipped = 0

    def _write_image(mime: str, data_str: str) -> str | None:
        nonlocal extracted, skipped
        ext = MIME_TO_EXT.get(mime.lower())
        if ext is None:
            skipped += 1
            print(f"[WARN] 不支持的 MIME 类型: {mime}（已保留原文）", file=sys.stderr)
            return None

        try:
            raw_bytes = base64.b64decode(data_str.encode("ascii"))
        except (binascii.Error, UnicodeEncodeError):
            skipped += 1
            print("[WARN] base64 解码失败（已保留原文）", file=sys.stderr)
            return None

        filename = _next_name(counters, ext)
        filepath = os.path.join(images_dir, filename)
        with open(filepath, "wb") as f:
            f.write(raw_bytes)
        extracted += 1
        return filename

    def _replace_md(match: re.Match) -> str:
        filename = _write_image(match.group("mime"), match.group("data"))
        if filename is None:
            return match.group(0)
        return f"![{match.group('alt')}](./images/{filename})"

    def _replace_html(match: re.Match) -> str:
        filename = _write_image(match.group("mime"), match.group("data"))
        if filename is None:
            return match.group(0)
        return f'<img{match.group("before")} src="./images/{filename}"{match.group("after")}>'

    markdown = _MD_IMAGE_RE.sub(_replace_md, markdown)
    markdown = _HTML_IMG_RE.sub(_replace_html, markdown)
    return markdown, extracted, skipped


def extract_docx_media_for_placeholders(
    markdown: str,
    source_path: str,
    output_dir: str,
) -> tuple[str, int, int]:
    """Replace truncated data:image placeholders with media files from a docx package."""
    if not source_path.lower().endswith(".docx"):
        return markdown, 0, 0
    if not _TRUNCATED_DATA_IMAGE_RE.search(markdown):
        return markdown, 0, 0

    try:
        with zipfile.ZipFile(source_path) as docx:
            media_names = sorted(
                name
                for name in docx.namelist()
                if name.startswith("word/media/") and not name.endswith("/")
            )
            media_items = [(name, docx.read(name)) for name in media_names]
    except (OSError, zipfile.BadZipFile):
        return markdown, 0, 0

    images_dir = os.path.join(output_dir, "images")
    os.makedirs(images_dir, exist_ok=True)
    counters = _scan_existing_counters(images_dir)
    media_iter = iter(media_items)
    extracted = 0
    skipped = 0

    def _replace(match: re.Match) -> str:
        nonlocal extracted, skipped
        try:
            media_name, raw_bytes = next(media_iter)
        except StopIteration:
            skipped += 1
            return match.group(0)

        ext = os.path.splitext(media_name)[1].lstrip(".").lower()
        if not ext:
            ext = MIME_TO_EXT.get(match.group("mime").lower(), "png")
        filename = _next_name(counters, ext)
        filepath = os.path.join(images_dir, filename)
        with open(filepath, "wb") as f:
            f.write(raw_bytes)
        extracted += 1
        return f"![{match.group('alt')}](./images/{filename})"

    return _TRUNCATED_DATA_IMAGE_RE.sub(_replace, markdown), extracted, skipped


def convert_document(input_path: str) -> str:
    """使用 markitdown Python API 将本地文档转换为 Markdown。"""
    _reject_html_wrapped_doc(input_path)

    try:
        from markitdown import MarkItDown
    except ImportError as exc:
        raise RuntimeError(
            "未安装 markitdown。请先执行: pip install -r src/po-skills/requirements.txt"
        ) from exc

    result = MarkItDown().convert(input_path)
    markdown = getattr(result, "text_content", "") or ""
    if not markdown.strip():
        raise ValueError(f"文档转换结果为空：{input_path}")
    return markdown


def save_markdown(content: str, source_path: str, output_dir: str) -> str:
    """保存为 [PROD_ORI]<源文件名>.md，返回完整输出路径。"""
    os.makedirs(output_dir, exist_ok=True)
    title = os.path.splitext(os.path.basename(source_path))[0]
    output_path = os.path.join(output_dir, f"[PROD_ORI]{title}.md")
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(content)
    return output_path


def main():
    parser = argparse.ArgumentParser(description="本地文档 → 本地 Markdown 文件")
    parser.add_argument("--file", required=True, help="本地文档路径，如 doc/docx/pdf")
    parser.add_argument("--output-dir", default=".", help="输出目录（默认当前目录）")
    args = parser.parse_args()

    if not os.path.exists(args.file):
        print(f"错误：文件不存在：{args.file}", file=sys.stderr)
        sys.exit(1)

    try:
        markdown = convert_document(args.file)
        markdown, extracted, skipped = extract_inline_images(markdown, args.output_dir)
        if extracted == 0:
            markdown, fallback_extracted, fallback_skipped = extract_docx_media_for_placeholders(
                markdown,
                args.file,
                args.output_dir,
            )
            extracted += fallback_extracted
            skipped += fallback_skipped
        output_path = save_markdown(markdown, args.file, args.output_dir)
    except Exception as exc:
        print(f"错误：{exc}", file=sys.stderr)
        sys.exit(1)

    print(f"OUTPUT_FILE={output_path}")
    print(f"INLINE_IMAGES_EXTRACTED={extracted}")
    print(f"INLINE_IMAGES_SKIPPED={skipped}")


if __name__ == "__main__":
    main()
