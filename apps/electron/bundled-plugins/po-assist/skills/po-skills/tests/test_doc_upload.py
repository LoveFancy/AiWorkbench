"""单元测试：doc_upload.py Markdown 上传飞书文档。"""

import importlib
import os
import sys
from pathlib import Path


SCRIPTS_DIR = os.path.join(os.path.dirname(__file__), "..", "scripts")
sys.path.insert(0, os.path.abspath(SCRIPTS_DIR))


def _load_doc_upload():
    sys.modules.pop("doc_upload", None)
    return importlib.import_module("doc_upload")


def test_build_pandoc_command_uses_markdown_parent_as_resource_path(tmp_path):
    doc_upload = _load_doc_upload()
    markdown = tmp_path / "PRODUCT_DESIGN" / "[PROD_ORI]需求说明.md"
    markdown.parent.mkdir()
    markdown.write_text("# 需求说明\n\n![图](images/a.png)\n", encoding="utf-8")
    output_docx = tmp_path / "out" / "需求说明.docx"

    command = doc_upload.build_pandoc_command(markdown, output_docx)

    assert command == [
        "pandoc",
        str(markdown),
        "-o",
        str(output_docx),
        "--resource-path",
        str(markdown.parent),
    ]


def test_build_lark_import_command_includes_optional_folder_and_name():
    doc_upload = _load_doc_upload()

    command = doc_upload.build_lark_import_command(
        Path("/tmp/需求说明.docx"),
        folder_token="fldcn123",
        name="需求说明",
        identity="user",
    )

    assert command == [
        "lark-cli",
        "drive",
        "+import",
        "--file",
        "./需求说明.docx",
        "--type",
        "docx",
        "--folder-token",
        "fldcn123",
        "--name",
        "需求说明",
        "--as",
        "user",
    ]


def test_upload_markdown_converts_to_docx_then_imports(monkeypatch, tmp_path):
    doc_upload = _load_doc_upload()
    markdown = tmp_path / "[PROD_ORI]需求说明.md"
    markdown.write_text("# 需求说明\n", encoding="utf-8")
    calls = []

    def fake_run(command, cwd=None):
        calls.append((command, cwd))
        if command[0] == "pandoc":
            Path(command[3]).write_bytes(b"docx")
            return ""
        return '{"ok":true,"data":{"url":"https://example.feishu.cn/docx/abc"}}'

    monkeypatch.setattr(doc_upload, "_run_command", fake_run)

    result = doc_upload.upload_markdown_to_lark(
        markdown,
        output_docx=tmp_path / "build" / "需求说明.docx",
        folder_token="fldcn123",
        name="需求说明",
        identity="user",
    )

    assert calls[0][0][0] == "pandoc"
    assert calls[0][1] is None
    assert calls[1][0][:5] == ["lark-cli", "drive", "+import", "--file", "./需求说明.docx"]
    assert calls[1][1] == result.docx_path.parent
    assert result.docx_path.read_bytes() == b"docx"
    assert result.import_output == '{"ok":true,"data":{"url":"https://example.feishu.cn/docx/abc"}}'
