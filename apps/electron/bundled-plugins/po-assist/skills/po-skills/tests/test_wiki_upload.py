"""单元测试：wiki_upload.py Markdown 上传 Confluence Wiki。"""

import importlib
import os
import sys
from pathlib import Path


SCRIPTS_DIR = os.path.join(os.path.dirname(__file__), "..", "scripts")
sys.path.insert(0, os.path.abspath(SCRIPTS_DIR))


def _load_wiki_upload():
    sys.modules.pop("wiki_upload", None)
    return importlib.import_module("wiki_upload")


def test_build_md2conf_command_uses_real_cli_options(tmp_path):
    wiki_upload = _load_wiki_upload()
    markdown = tmp_path / "[PROD_FORMAT]需求说明.md"

    command = wiki_upload.build_md2conf_command(
        markdown,
        base_url="http://wiki.htzq.htsc.com.cn",
        token="token",
        md2conf_bin="/opt/bin/md2conf",
        space_key="AI",
        root_page_id="456",
        username="user@example.com",
    )

    assert command == [
        "/opt/bin/md2conf",
        str(markdown),
        "-d",
        "wiki.htzq.htsc.com.cn",
        "-p",
        "/wiki/",
        "-a",
        "token",
        "--api-version",
        "v1",
        "-u",
        "user@example.com",
        "-s",
        "AI",
        "-r",
        "456",
    ]


def test_publish_markdown_create_mode_calls_md2conf_with_temp_source(monkeypatch, tmp_path):
    wiki_upload = _load_wiki_upload()
    markdown = tmp_path / "[PROD_FORMAT]需求说明.md"
    markdown.write_text("# 需求说明\n\n![](./images/a.png)\n", encoding="utf-8")
    calls = []

    def fake_run(command, *, cwd=None, env=None):
        calls.append((command, cwd, env))
        source = Path(command[1])
        assert source.name.startswith(".[PROD_FORMAT]需求说明.wiki-upload-")
        source_text = source.read_text(encoding="utf-8")
        assert 'title: "需求说明"' in source_text
        assert "<!-- confluence-space-key: AI -->" in source_text
        assert "![](./images/a.png)" in source_text
        return "created page http://wiki.htzq.htsc.com.cn/pages/viewpage.action?pageId=123"

    monkeypatch.setattr(wiki_upload, "_run_command", fake_run)

    result = wiki_upload.publish_markdown_to_confluence(
        markdown,
        base_url="http://wiki.htzq.htsc.com.cn",
        token="token",
        space_key="AI",
        root_page_id="456",
        title="需求说明",
        mode="create",
    )

    command, cwd, env = calls[0]
    assert command[0] == "md2conf"
    assert command[-4:] == ["-s", "AI", "-r", "456"]
    assert cwd == tmp_path
    assert env["CONFLUENCE_DOMAIN"] == "wiki.htzq.htsc.com.cn"
    assert env["CONFLUENCE_PATH"] == "/wiki/"
    assert env["CONFLUENCE_API_KEY"] == "token"
    assert env["CONFLUENCE_API_VERSION"] == "v1"
    assert result.page_id == "123"
    assert result.page_url == "http://wiki.htzq.htsc.com.cn/pages/viewpage.action?pageId=123"
    assert result.mode == "create"


def test_publish_markdown_update_mode_injects_existing_page_id(monkeypatch, tmp_path):
    wiki_upload = _load_wiki_upload()
    markdown = tmp_path / "需求说明.md"
    markdown.write_text("# 需求说明\n", encoding="utf-8")
    captured = {}

    def fake_run(command, *, cwd=None, env=None):
        source = Path(command[1])
        captured["text"] = source.read_text(encoding="utf-8")
        return ""

    monkeypatch.setattr(wiki_upload, "_run_command", fake_run)

    result = wiki_upload.publish_markdown_to_confluence(
        markdown,
        base_url="http://wiki.htzq.htsc.com.cn",
        token="token",
        page_id="789",
        title="需求说明",
        mode="update",
    )

    assert "<!-- confluence-page-id: 789 -->" in captured["text"]
    assert result.page_id == "789"


def test_normalize_confluence_base_url_keeps_on_prem_root_path():
    wiki_upload = _load_wiki_upload()

    assert wiki_upload._normalize_confluence_base_url("http://wiki.htzq.htsc.com.cn") == (
        "wiki.htzq.htsc.com.cn",
        "/wiki/",
    )
    assert wiki_upload._normalize_confluence_base_url("http://wiki.htzq.htsc.com.cn/") == (
        "wiki.htzq.htsc.com.cn",
        "/wiki/",
    )
    assert wiki_upload._normalize_confluence_base_url("http://wiki.htzq.htsc.com.cn/confluence") == (
        "wiki.htzq.htsc.com.cn",
        "/confluence/",
    )


def test_cli_does_not_expose_base_url(monkeypatch, capsys):
    wiki_upload = _load_wiki_upload()
    monkeypatch.setenv("HTSC_WIKI_TOKEN", "token")
    monkeypatch.setattr(sys, "argv", ["wiki_upload.py", "--help"])

    try:
        wiki_upload.main()
    except SystemExit:
        pass

    assert "--base-url" not in capsys.readouterr().out
