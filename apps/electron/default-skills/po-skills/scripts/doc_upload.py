#!/usr/bin/env python3
"""doc-upload 脚本：Markdown -> docx -> 飞书在线文档。"""

from __future__ import annotations

import argparse
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path


def _configure_stdio() -> None:
    """在 Windows/VSCode 终端下尽量稳定 stdout/stderr 的 UTF-8 输出。"""
    for stream_name in ("stdout", "stderr"):
        stream = getattr(sys, stream_name, None)
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")


_configure_stdio()


@dataclass(frozen=True)
class UploadResult:
    markdown_path: Path
    docx_path: Path
    import_output: str


def build_pandoc_command(markdown_path: Path, output_docx: Path) -> list[str]:
    """构造 pandoc 命令，确保相对图片基于 Markdown 所在目录解析。"""
    return [
        "pandoc",
        str(markdown_path),
        "-o",
        str(output_docx),
        "--resource-path",
        str(markdown_path.parent),
    ]


def build_lark_import_command(
    docx_path: Path,
    *,
    folder_token: str = "",
    name: str = "",
    identity: str = "",
) -> list[str]:
    """构造飞书导入命令。"""
    command = [
        "lark-cli",
        "drive",
        "+import",
        "--file",
        str(docx_path),
        "--type",
        "docx",
    ]
    if folder_token:
        command += ["--folder-token", folder_token]
    if name:
        command += ["--name", name]
    if identity:
        command += ["--as", identity]
    return command


def _run_command(command: list[str]) -> str:
    try:
        completed = subprocess.run(
            command,
            check=True,
            text=True,
            capture_output=True,
        )
    except FileNotFoundError as exc:
        raise RuntimeError(f"命令不可用：{command[0]}") from exc
    except subprocess.CalledProcessError as exc:
        stderr = exc.stderr.strip()
        stdout = exc.stdout.strip()
        detail = stderr or stdout or f"exit code {exc.returncode}"
        raise RuntimeError(f"命令执行失败：{' '.join(command)}\n{detail}") from exc
    return completed.stdout.strip()


def _default_docx_path(markdown_path: Path) -> Path:
    return markdown_path.with_suffix(".docx")


def upload_markdown_to_lark(
    markdown_path: Path,
    *,
    output_docx: Path | None = None,
    folder_token: str = "",
    name: str = "",
    identity: str = "",
) -> UploadResult:
    markdown_path = markdown_path.expanduser().resolve()
    if not markdown_path.is_file():
        raise FileNotFoundError(f"Markdown 文件不存在：{markdown_path}")
    if markdown_path.suffix.lower() not in {".md", ".markdown", ".mark"}:
        raise ValueError(f"仅支持 Markdown 文件：{markdown_path}")

    docx_path = (output_docx or _default_docx_path(markdown_path)).expanduser().resolve()
    docx_path.parent.mkdir(parents=True, exist_ok=True)

    _run_command(build_pandoc_command(markdown_path, docx_path))
    if not docx_path.is_file():
        raise RuntimeError(f"pandoc 未生成 docx 文件：{docx_path}")

    import_output = _run_command(
        build_lark_import_command(
            docx_path,
            folder_token=folder_token,
            name=name,
            identity=identity,
        )
    )
    return UploadResult(
        markdown_path=markdown_path,
        docx_path=docx_path,
        import_output=import_output,
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="将本地 Markdown 先用 pandoc 转成 docx，再导入为飞书在线文档",
    )
    parser.add_argument("--file", required=True, help="本地 Markdown 文件路径")
    parser.add_argument("--output-docx", default="", help="pandoc 生成的临时/中间 docx 路径")
    parser.add_argument("--folder-token", default="", help="飞书云空间目标文件夹 token")
    parser.add_argument("--name", default="", help="导入后的飞书文档名称")
    parser.add_argument("--as", dest="identity", default="", help="lark-cli 身份：user 或 bot")
    opts = parser.parse_args()

    result = upload_markdown_to_lark(
        Path(opts.file),
        output_docx=Path(opts.output_docx) if opts.output_docx else None,
        folder_token=opts.folder_token.strip(),
        name=opts.name.strip(),
        identity=opts.identity.strip(),
    )
    print(f"DOCX_FILE={result.docx_path}")
    print("LARK_IMPORT_OUTPUT_BEGIN")
    print(result.import_output)
    print("LARK_IMPORT_OUTPUT_END")


if __name__ == "__main__":
    main()
