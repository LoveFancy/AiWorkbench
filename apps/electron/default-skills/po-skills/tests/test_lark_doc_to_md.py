"""单元测试：lark_doc_to_md.py 飞书文档转本地 Markdown。"""

import importlib
import json
import os
import sys
from pathlib import Path


SCRIPTS_DIR = os.path.join(os.path.dirname(__file__), "..", "scripts")
sys.path.insert(0, os.path.abspath(SCRIPTS_DIR))


def _load_lark_doc_to_md():
    sys.modules.pop("lark_doc_to_md", None)
    return importlib.import_module("lark_doc_to_md")


def test_is_lark_doc_url_detects_docx_and_wiki():
    module = _load_lark_doc_to_md()

    assert module.is_lark_doc_url("https://example.feishu.cn/docx/abc")
    assert module.is_lark_doc_url("https://example.feishu.cn/wiki/abc")
    assert module.is_lark_doc_url("https://example.larksuite.com/docx/abc")
    assert not module.is_lark_doc_url("https://wiki.example.com/pages/viewpage.action?pageId=1")


def test_localize_html_img_href_downloads_and_rewrites(tmp_path):
    module = _load_lark_doc_to_md()
    content = (
        '<table><tr><td><img name="image.png" '
        'href="https://internal-api-drive-stream.feishu.cn/space/api/box/stream/download/authcode/?code=abc" '
        'mime="image/png" src="token"/></td></tr></table>'
    )
    calls = []

    def fake_downloader(url, output_base):
        calls.append((url, output_base))
        path = Path(str(output_base) + ".png")
        path.write_bytes(b"png")
        return path

    result = module.localize_images(content, tmp_path, fake_downloader)

    assert calls[0][0].endswith("code=abc")
    assert result.downloaded == 1
    assert result.skipped == 0
    assert "](./images/image-001.png)" in result.content
    assert "<img" not in result.content


def test_localize_markdown_internal_image_downloads_and_rewrites(tmp_path):
    module = _load_lark_doc_to_md()
    content = (
        "技术实现\n\n"
        "![](https://internal-api-drive-stream.feishu.cn/space/api/box/stream/download/authcode/?code=def)"
    )

    def fake_downloader(url, output_base):
        path = Path(str(output_base) + ".jpg")
        path.write_bytes(b"jpg")
        return path

    result = module.localize_images(content, tmp_path, fake_downloader)

    assert result.downloaded == 1
    assert "![image-001](./images/image-001.jpg)" in result.content
    assert "internal-api-drive-stream" not in result.content


def test_localize_external_markdown_image_is_preserved(tmp_path):
    module = _load_lark_doc_to_md()
    content = "![](https://example.com/a.png)"

    result = module.localize_images(content, tmp_path, lambda _url, _output: None)

    assert result.downloaded == 0
    assert result.skipped == 0
    assert result.content == content


def test_convert_lark_doc_writes_prod_ori_and_images(monkeypatch, tmp_path):
    module = _load_lark_doc_to_md()
    fetch_output = {
        "ok": True,
        "data": {
            "document": {
                "content": "# 飞书标题\n\n![](https://internal-api-drive-stream.feishu.cn/x?code=1)"
            }
        },
    }
    calls = []

    def fake_run(command):
        calls.append(command)
        return json.dumps(fetch_output, ensure_ascii=False)

    def fake_download(_url, output_base):
        path = Path(str(output_base) + ".png")
        path.write_bytes(b"png")
        return path

    monkeypatch.setattr(module, "_run_command", fake_run)
    result = module.convert_lark_doc_to_markdown(
        "https://example.feishu.cn/docx/abc",
        tmp_path,
        download_url=fake_download,
    )

    assert calls[0] == [
        "lark-cli",
        "docs",
        "+fetch",
        "--api-version",
        "v2",
        "--doc",
        "https://example.feishu.cn/docx/abc",
        "--doc-format",
        "markdown",
    ]
    assert result.output_file.name == "[PROD_ORI]飞书标题.md"
    assert "](./images/image-001.png)" in result.output_file.read_text(encoding="utf-8")
    assert result.downloaded == 1
