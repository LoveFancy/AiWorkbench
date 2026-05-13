#!/usr/bin/env python3
"""doc-to-md 脚本：本地文档 → 本地 Markdown 文件。"""

import argparse
import base64
import binascii
import os
import re
import sys


def _configure_stdio() -> None:
    """在 Windows/VSCode 终端下尽量稳定 stdout/stderr 的 UTF-8 输出。"""
    for stream_name in ("stdout", "stderr"):
        stream = getattr(sys, stream_name, None)
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")


_configure_stdio()

# ---------------------------------------------------------------------------
# MIME 类型 → 扩展名映射
# ---------------------------------------------------------------------------

MIME_TO_EXT = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/bmp": "bmp",
    "image/svg+xml": "svg",
}

# ---------------------------------------------------------------------------
# 正则：Markdown 内联图片 + HTML <img> 标签
# ---------------------------------------------------------------------------

_MD_IMAGE_RE = re.compile(
    r"!\[(?P<alt>[^\]]*)\]"
    r"\(\s*"
    r"data:"
    r"(?P<mime>image/[-+\w]+)"       # MIME 类型，如 image/png
    r";base64,"
    r"(?P<data>[^)\s]+)"             # base64 数据（不含空白和右括号）
    r"\s*\)",
    re.VERBOSE | re.IGNORECASE,
)

_HTML_IMG_RE = re.compile(
    r"<img"
    r"(?P<before>[^>]*?)"            # src 之前的属性（含空白前缀）
    r"\s+src\s*=\s*\""
    r"data:"
    r"(?P<mime>image/[-+\w]+)"       # MIME 类型，如 image/png
    r";base64,"
    r"(?P<data>[^\"\s]+)"            # base64 数据（不含双引号和空白）
    r"\""
    r"(?P<after>[^>]*?)"             # src 之后的属性
    r"/?>",                          # 结尾 > 或 />
    re.VERBOSE | re.DOTALL | re.IGNORECASE,
)


# ---------------------------------------------------------------------------
# 文件名递增逻辑
# ---------------------------------------------------------------------------

def _scan_existing_counters(images_dir: str) -> dict[str, int]:
    """扫描 images/ 目录，返回每个扩展名下一个可用的编号。"""
    counters: dict[str, int] = {ext: 1 for ext in MIME_TO_EXT.values()}
    if not os.path.isdir(images_dir):
        return counters

    pattern = re.compile(r"^image-(\d+)\.(.+)$")
    for fname in os.listdir(images_dir):
        m = pattern.match(fname)
        if m:
            num = int(m.group(1))
            ext = m.group(2)
            if ext in counters:
                counters[ext] = max(counters[ext], num + 1)
    return counters


def _next_name(counters: dict[str, int], ext: str) -> str:
    """分配下一个文件名，并递增计数器。"""
    num = counters[ext]
    name = f"image-{num:03d}.{ext}"
    counters[ext] = num + 1
    return name


# ---------------------------------------------------------------------------
# 内联图片提取
# ---------------------------------------------------------------------------

def extract_inline_images(markdown: str, output_dir: str) -> tuple[str, int, int]:
    """提取 Markdown 中的内联 base64 图片到 images/ 目录。

    Returns:
        (cleaned_markdown, extracted_count, skipped_count)
    """
    images_dir = os.path.join(output_dir, "images")
    os.makedirs(images_dir, exist_ok=True)

    counters = _scan_existing_counters(images_dir)
    extracted = 0
    skipped = 0

    def _replace_md(match: re.Match) -> str:
        nonlocal extracted, skipped
        mime = match.group("mime")
        data_str = match.group("data")
        alt = match.group("alt")

        ext = MIME_TO_EXT.get(mime)
        if ext is None:
            skipped += 1
            print(f"[WARN] 不支持的 MIME 类型: {mime}（已保留原文）", file=sys.stderr)
            return match.group(0)

        try:
            raw_bytes = base64.b64decode(data_str.encode("ascii"))
        except (binascii.Error, UnicodeEncodeError):
            skipped += 1
            print("[WARN] base64 解码失败（已保留原文）", file=sys.stderr)
            return match.group(0)

        filename = _next_name(counters, ext)
        filepath = os.path.join(images_dir, filename)
        with open(filepath, "wb") as f:
            f.write(raw_bytes)

        extracted += 1
        return f"![{alt}](./images/{filename})"

    def _replace_html(match: re.Match) -> str:
        nonlocal extracted, skipped
        mime = match.group("mime")
        data_str = match.group("data")
        before = match.group("before")
        after = match.group("after")

        ext = MIME_TO_EXT.get(mime)
        if ext is None:
            skipped += 1
            print(f"[WARN] 不支持的 MIME 类型: {mime}（已保留原文）", file=sys.stderr)
            return match.group(0)

        try:
            raw_bytes = base64.b64decode(data_str.encode("ascii"))
        except (binascii.Error, UnicodeEncodeError):
            skipped += 1
            print("[WARN] base64 解码失败（已保留原文）", file=sys.stderr)
            return match.group(0)

        filename = _next_name(counters, ext)
        filepath = os.path.join(images_dir, filename)
        with open(filepath, "wb") as f:
            f.write(raw_bytes)

        extracted += 1
        return f'<img{before} src="./images/{filename}"{after}>'

    # 第一遍：Markdown 图片
    markdown = _MD_IMAGE_RE.sub(_replace_md, markdown)
    # 第二遍：HTML <img> 标签
    markdown = _HTML_IMG_RE.sub(_replace_html, markdown)

    return markdown, extracted, skipped


# ---------------------------------------------------------------------------
# 核心函数
# ---------------------------------------------------------------------------

def convert_document(input_path: str) -> str:
    """使用 markitdown Python API 将本地文档转换为 Markdown。"""
    try:
        from markitdown import MarkItDown
    except ImportError as exc:
        raise RuntimeError(
            "未安装 markitdown。请先执行: pip install -r po-skills/requirements.txt"
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


# ---------------------------------------------------------------------------
# CLI 入口
# ---------------------------------------------------------------------------

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
        output_path = save_markdown(markdown, args.file, args.output_dir)
    except Exception as exc:
        print(f"错误：{exc}", file=sys.stderr)
        sys.exit(1)

    print(f"OUTPUT_FILE={output_path}")
    print(f"INLINE_IMAGES_EXTRACTED={extracted}")
    print(f"INLINE_IMAGES_SKIPPED={skipped}")


if __name__ == "__main__":
    main()
