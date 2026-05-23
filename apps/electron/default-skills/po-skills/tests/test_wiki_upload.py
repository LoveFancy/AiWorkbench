"""单元测试：wiki_upload.py Markdown 上传 Confluence Wiki。"""

import importlib
import os
import subprocess
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
        "/",
        "-a",
        "token",
        "--api-version",
        "v1",
        "--api-url",
        "http://wiki.htzq.htsc.com.cn/",
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
    monkeypatch.setenv("HTTP_PROXY", "http://proxy.example.com:8080")
    monkeypatch.setenv("HTTPS_PROXY", "http://proxy.example.com:8080")
    monkeypatch.setenv("NO_PROXY", "localhost")

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
    assert env["CONFLUENCE_PATH"] == "/"
    assert env["CONFLUENCE_API_KEY"] == "token"
    assert env["CONFLUENCE_API_VERSION"] == "v1"
    assert env["CONFLUENCE_API_URL"] == "http://wiki.htzq.htsc.com.cn/"
    assert "HTTP_PROXY" not in env
    assert "HTTPS_PROXY" not in env
    assert "http_proxy" not in env
    assert "https_proxy" not in env
    assert env["NO_PROXY"] == "localhost,wiki.htzq.htsc.com.cn"
    assert env["no_proxy"] == "localhost,wiki.htzq.htsc.com.cn"
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


def test_publish_markdown_create_mode_strips_stale_page_id_comment(monkeypatch, tmp_path):
    wiki_upload = _load_wiki_upload()
    markdown = tmp_path / "需求说明.md"
    markdown.write_text(
        "# 需求说明\n\n<!-- confluence-page-id: 400854702 -->\n\n正文\n",
        encoding="utf-8",
    )
    captured = {}

    def fake_run(command, *, cwd=None, env=None):
        source = Path(command[1])
        captured["text"] = source.read_text(encoding="utf-8")
        return "created page http://wiki.htzq.htsc.com.cn/pages/viewpage.action?pageId=123"

    monkeypatch.setattr(wiki_upload, "_run_command", fake_run)

    wiki_upload.publish_markdown_to_confluence(
        markdown,
        base_url="http://wiki.htzq.htsc.com.cn",
        token="token",
        space_key="AI",
        root_page_id="387683784",
        title="需求说明",
        mode="create",
    )

    assert "confluence-page-id: 400854702" not in captured["text"]
    assert "<!-- confluence-space-key: AI -->" in captured["text"]


def test_publish_markdown_removes_temp_source_when_md2conf_fails(monkeypatch, tmp_path):
    wiki_upload = _load_wiki_upload()
    markdown = tmp_path / "需求说明.md"
    markdown.write_text("# 需求说明\n", encoding="utf-8")
    captured = {}

    def fake_run(command, *, cwd=None, env=None):
        source = Path(command[1])
        captured["source"] = source
        assert source.exists()
        raise RuntimeError("md2conf failed")

    monkeypatch.setattr(wiki_upload, "_run_command", fake_run)

    try:
        wiki_upload.publish_markdown_to_confluence(
            markdown,
            base_url="http://wiki.htzq.htsc.com.cn",
            token="token",
            space_key="AI",
            root_page_id="387683784",
            title="需求说明",
            mode="create",
        )
    except RuntimeError as exc:
        assert str(exc) == "md2conf failed"
    else:
        raise AssertionError("expected RuntimeError")

    assert captured["source"].name.startswith(".需求说明.wiki-upload-")
    assert not captured["source"].exists()


def test_run_command_summarizes_md2conf_title_conflict(monkeypatch):
    wiki_upload = _load_wiki_upload()

    def fake_run(*args, **kwargs):
        raise subprocess.CalledProcessError(
            1,
            args[0],
            stderr=(
                "md2conf.environment.PageError: expected: page with ID 400854702 "
                "to be a descendant of the root page or one of the pages paired "
                "with a Markdown file using an explicit page ID"
            ),
        )

    monkeypatch.setattr(wiki_upload.subprocess, "run", fake_run)

    try:
        wiki_upload._run_command(["md2conf", "需求说明.md"])
    except RuntimeError as exc:
        message = str(exc)
    else:
        raise AssertionError("expected RuntimeError")

    assert "Wiki 中已存在同名页面" in message
    assert "400854702" in message
    assert "不在当前目标父页面下" in message
    assert "请修改页面标题后重新同步" in message


def test_cli_create_mode_uses_wiki_target_defaults_from_environment(monkeypatch, tmp_path, capsys):
    wiki_upload = _load_wiki_upload()
    markdown = tmp_path / "需求说明.md"
    markdown.write_text("# 需求说明\n", encoding="utf-8")
    captured = {}

    def fake_publish(markdown_path, **kwargs):
        captured["markdown_path"] = markdown_path
        captured["kwargs"] = kwargs
        return wiki_upload.WikiUploadResult(
            markdown_path=markdown_path,
            sync_path=markdown_path,
            page_id="123",
            page_title=kwargs["title"] or markdown_path.stem,
            page_url="http://wiki.htzq.htsc.com.cn/pages/viewpage.action?pageId=123",
            mode=kwargs["mode"],
            command_output="",
        )

    monkeypatch.setenv("HTSC_WIKI_TOKEN", "token")
    monkeypatch.setenv("HTSC_WIKI_SPACE_KEY", "AI")
    monkeypatch.setenv("HTSC_WIKI_PARENT_PAGE_ID", "456")
    monkeypatch.setattr(wiki_upload, "publish_markdown_to_confluence", fake_publish)
    monkeypatch.setattr(
        sys,
        "argv",
        ["wiki_upload.py", "--file", str(markdown), "--title", "需求说明"],
    )

    wiki_upload.main()

    assert captured["markdown_path"] == markdown
    assert captured["kwargs"]["space_key"] == "AI"
    assert captured["kwargs"]["root_page_id"] == "456"
    assert "CONFLUENCE_PAGE_ID=123" in capsys.readouterr().out


def test_cli_create_mode_accepts_parent_page_url(monkeypatch, tmp_path):
    wiki_upload = _load_wiki_upload()
    markdown = tmp_path / "需求说明.md"
    markdown.write_text("# 需求说明\n", encoding="utf-8")
    captured = {}

    def fake_publish(markdown_path, **kwargs):
        captured["kwargs"] = kwargs
        return wiki_upload.WikiUploadResult(
            markdown_path=markdown_path,
            sync_path=markdown_path,
            page_id="123",
            page_title=kwargs["title"] or markdown_path.stem,
            page_url="http://wiki.htzq.htsc.com.cn/pages/viewpage.action?pageId=123",
            mode=kwargs["mode"],
            command_output="",
        )

    monkeypatch.setenv("HTSC_WIKI_TOKEN", "token")
    monkeypatch.setattr(wiki_upload, "publish_markdown_to_confluence", fake_publish)
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "wiki_upload.py",
            "--file",
            str(markdown),
            "--space-key",
            "AI",
            "--parent-page-id",
            "http://wiki.htzq.htsc.com.cn/pages/viewpage.action?pageId=387683784",
        ],
    )

    wiki_upload.main()

    assert captured["kwargs"]["root_page_id"] == "387683784"


def test_cli_create_mode_uses_parent_page_url_default_from_environment(monkeypatch, tmp_path):
    wiki_upload = _load_wiki_upload()
    markdown = tmp_path / "需求说明.md"
    markdown.write_text("# 需求说明\n", encoding="utf-8")
    captured = {}

    def fake_publish(markdown_path, **kwargs):
        captured["kwargs"] = kwargs
        return wiki_upload.WikiUploadResult(
            markdown_path=markdown_path,
            sync_path=markdown_path,
            page_id="123",
            page_title=kwargs["title"] or markdown_path.stem,
            page_url="http://wiki.htzq.htsc.com.cn/pages/viewpage.action?pageId=123",
            mode=kwargs["mode"],
            command_output="",
        )

    monkeypatch.setenv("HTSC_WIKI_TOKEN", "token")
    monkeypatch.setenv("HTSC_WIKI_SPACE_KEY", "AI")
    monkeypatch.setenv(
        "HTSC_WIKI_PARENT_PAGE_URL",
        "http://wiki.htzq.htsc.com.cn/pages/viewpage.action?pageId=387683784",
    )
    monkeypatch.setattr(wiki_upload, "publish_markdown_to_confluence", fake_publish)
    monkeypatch.setattr(sys, "argv", ["wiki_upload.py", "--file", str(markdown)])

    wiki_upload.main()

    assert captured["kwargs"]["root_page_id"] == "387683784"


def test_normalize_confluence_base_url_keeps_on_prem_root_path():
    wiki_upload = _load_wiki_upload()

    assert wiki_upload._normalize_confluence_base_url("http://wiki.htzq.htsc.com.cn") == (
        "wiki.htzq.htsc.com.cn",
        "/",
    )
    assert wiki_upload._normalize_confluence_base_url("http://wiki.htzq.htsc.com.cn/") == (
        "wiki.htzq.htsc.com.cn",
        "/",
    )
    assert wiki_upload._normalize_confluence_base_url("http://wiki.htzq.htsc.com.cn/confluence") == (
        "wiki.htzq.htsc.com.cn",
        "/confluence/",
    )


def test_confluence_api_url_uses_http_server_base_url():
    wiki_upload = _load_wiki_upload()

    assert (
        wiki_upload._confluence_api_url("http://wiki.htzq.htsc.com.cn")
        == "http://wiki.htzq.htsc.com.cn/"
    )
    assert (
        wiki_upload._confluence_api_url("http://wiki.htzq.htsc.com.cn/confluence")
        == "http://wiki.htzq.htsc.com.cn/confluence/"
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
