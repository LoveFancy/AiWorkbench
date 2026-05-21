"""单元测试：doc_to_md.py 本地文档转 Markdown。"""

import io
import os
import sys
import types
import importlib
import pytest
import zipfile
from contextlib import redirect_stdout


SCRIPTS_DIR = os.path.join(os.path.dirname(__file__), "..", "scripts")
sys.path.insert(0, os.path.abspath(SCRIPTS_DIR))


def _load_doc_to_md_with_fake_markitdown(monkeypatch, markdown_text: str):
    class FakeMarkItDown:
        def convert(self, source):
            return types.SimpleNamespace(text_content=markdown_text, title="忽略此标题")

    fake_module = types.SimpleNamespace(MarkItDown=FakeMarkItDown)
    monkeypatch.setitem(sys.modules, "markitdown", fake_module)
    sys.modules.pop("doc_to_md", None)
    return importlib.import_module("doc_to_md")


def test_convert_document_uses_markitdown_python_api(monkeypatch, tmp_path):
    input_file = tmp_path / "sample.pdf"
    input_file.write_bytes(b"%PDF-1.4")

    doc_to_md = _load_doc_to_md_with_fake_markitdown(monkeypatch, "# 文档标题\n\n转换内容\n")

    markdown = doc_to_md.convert_document(str(input_file))

    assert markdown == "# 文档标题\n\n转换内容\n"


def test_detects_mhtml_disguised_as_doc_before_markitdown(monkeypatch, tmp_path):
    input_file = tmp_path / "CLINE云桌面安装指引.doc"
    input_file.write_text(
        "MIME-Version: 1.0\n"
        "Content-Type: multipart/related; boundary=\"----=_NextPart\"\n\n"
        "------=_NextPart\n"
        "Content-Type: text/html; charset=\"utf-8\"\n\n"
        "<html><body><img src=\"cid:image001.png\"></body></html>\n",
        encoding="utf-8",
    )

    doc_to_md = _load_doc_to_md_with_fake_markitdown(monkeypatch, "# 不应执行\n")

    with pytest.raises(ValueError) as excinfo:
        doc_to_md.convert_document(str(input_file))

    message = str(excinfo.value)
    assert "Confluence/Wiki 导出的 MHTML/HTML 包装文件" in message
    assert "请优先使用 Wiki URL 执行 doc-convert" in message


def test_detects_html_disguised_as_doc_before_markitdown(monkeypatch, tmp_path):
    input_file = tmp_path / "导出页面.doc"
    input_file.write_text(
        "<!DOCTYPE html><html><body><img src=\"image2025-4-22_13-32-33.png\"></body></html>",
        encoding="utf-8",
    )

    doc_to_md = _load_doc_to_md_with_fake_markitdown(monkeypatch, "# 不应执行\n")

    with pytest.raises(ValueError) as excinfo:
        doc_to_md.convert_document(str(input_file))

    assert "Confluence/Wiki 导出的 MHTML/HTML 包装文件" in str(excinfo.value)


def test_main_writes_prod_ori_markdown_and_prints_output_file(monkeypatch, tmp_path):
    input_file = tmp_path / "需求说明.docx"
    input_file.write_bytes(b"fake-docx")
    output_dir = tmp_path / "out"
    output_dir.mkdir()

    doc_to_md = _load_doc_to_md_with_fake_markitdown(monkeypatch, "# 需求说明\n\n正文\n")
    monkeypatch.setattr(
        sys,
        "argv",
        ["doc_to_md.py", "--file", str(input_file), "--output-dir", str(output_dir)],
    )

    stdout = io.StringIO()
    with redirect_stdout(stdout):
        doc_to_md.main()

    output = stdout.getvalue()
    output_file = output_dir / "[PROD_ORI]需求说明.md"
    assert f"OUTPUT_FILE={output_file}" in output
    assert "INLINE_IMAGES_EXTRACTED=0" in output
    assert "INLINE_IMAGES_SKIPPED=0" in output
    assert output_file.read_text(encoding="utf-8") == "# 需求说明\n\n正文\n"


def test_main_extracts_docx_media_for_truncated_data_uri_placeholders(monkeypatch, tmp_path):
    input_file = tmp_path / "需求说明.docx"
    with zipfile.ZipFile(input_file, "w") as docx:
        docx.writestr("word/media/image1.png", b"png-1")
        docx.writestr("word/media/image2.png", b"png-2")
    output_dir = tmp_path / "out"

    markdown = (
        "# 需求说明\n\n"
        "![](data:image/png;base64...)\n\n"
        "![](data:image/png;base64...)"
    )
    doc_to_md = _load_doc_to_md_with_fake_markitdown(monkeypatch, markdown)
    monkeypatch.setattr(
        sys,
        "argv",
        ["doc_to_md.py", "--file", str(input_file), "--output-dir", str(output_dir)],
    )

    stdout = io.StringIO()
    with redirect_stdout(stdout):
        doc_to_md.main()

    output = stdout.getvalue()
    output_file = output_dir / "[PROD_ORI]需求说明.md"
    content = output_file.read_text(encoding="utf-8")
    assert "INLINE_IMAGES_EXTRACTED=2" in output
    assert "INLINE_IMAGES_SKIPPED=0" in output
    assert content.count("./images/") == 2
    assert "data:image" not in content
    assert (output_dir / "images" / "image-001.png").read_bytes() == b"png-1"
    assert (output_dir / "images" / "image-002.png").read_bytes() == b"png-2"
