import os
import sys
import json
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))

import wiki_export


def test_default_output_dir_uses_tmp_prefix():
    now = datetime(2026, 5, 5, 15, 30, 1)

    assert wiki_export.default_output_dir(now) == "./tmp-wiki-export-20260505-153001"


def test_load_runtime_token_from_cwd_env_file(tmp_path, monkeypatch):
    (tmp_path / ".env").write_text("HTSC_WIKI_TOKEN=from_cwd_env\n", encoding="utf-8")

    monkeypatch.chdir(tmp_path)
    monkeypatch.delenv("HTSC_WIKI_TOKEN", raising=False)
    monkeypatch.delenv("CONFLUENCE_TOKEN", raising=False)
    monkeypatch.delenv("CLAUDE_PROJECT_DIR", raising=False)

    token = wiki_export.load_runtime_token()

    assert token == "from_cwd_env"
    assert os.environ["HTSC_WIKI_TOKEN"] == "from_cwd_env"


def test_load_runtime_token_uses_python_dotenv_syntax(tmp_path, monkeypatch):
    (tmp_path / ".env").write_text(
        'export HTSC_WIKI_TOKEN="from dotenv" # inline comment\n',
        encoding="utf-8",
    )

    monkeypatch.chdir(tmp_path)
    monkeypatch.delenv("HTSC_WIKI_TOKEN", raising=False)
    monkeypatch.delenv("CONFLUENCE_TOKEN", raising=False)
    monkeypatch.delenv("CLAUDE_PROJECT_DIR", raising=False)

    token = wiki_export.load_runtime_token()

    assert token == "from dotenv"
    assert os.environ["HTSC_WIKI_TOKEN"] == "from dotenv"


def test_load_runtime_token_maps_confluence_token(tmp_path, monkeypatch):
    (tmp_path / ".env").write_text("CONFLUENCE_TOKEN=from_confluence_env\n", encoding="utf-8")

    monkeypatch.chdir(tmp_path)
    monkeypatch.delenv("HTSC_WIKI_TOKEN", raising=False)
    monkeypatch.delenv("CONFLUENCE_TOKEN", raising=False)
    monkeypatch.delenv("CLAUDE_PROJECT_DIR", raising=False)

    token = wiki_export.load_runtime_token()

    assert token == "from_confluence_env"
    assert os.environ["HTSC_WIKI_TOKEN"] == "from_confluence_env"


def test_command_for_pages_accepts_multiple_urls(tmp_path):
    calls = []
    config_existed_during_run = []
    generated_config = {}

    def fake_runner(cmd, **kwargs):
        calls.append((cmd, kwargs))
        config_path = Path(kwargs["env"]["CME_CONFIG_PATH"])
        config_existed_during_run.append(config_path.is_file())
        generated_config.update(json.loads(config_path.read_text(encoding="utf-8")))
        return SimpleNamespace(returncode=0, stdout="ok", stderr="")

    result = wiki_export.run_export(
        urls=["http://wiki.example.com/pages/viewpage.action?pageId=1", "http://wiki.example.com/pages/viewpage.action?pageId=2"],
        mode="pages",
        output_dir=str(tmp_path),
        token="token123",
        runner=fake_runner,
        executable_finder=lambda name: "/usr/local/bin/cme" if name == "cme" else None,
    )

    assert calls[0][0] == [
        "/usr/local/bin/cme",
        "pages",
        "http://wiki.example.com/pages/viewpage.action?pageId=1",
        "http://wiki.example.com/pages/viewpage.action?pageId=2",
    ]
    env = calls[0][1]["env"]
    assert env["CME_EXPORT__OUTPUT_PATH"] == str(tmp_path)
    assert env["CME_EXPORT__ATTACHMENT_HREF"] == "relative"
    assert env["CME_EXPORT__ATTACHMENT_EXPORT_ALL"] == "false"
    assert env["PYTHONIOENCODING"] == "utf-8"
    assert env["PYTHONUTF8"] == "1"
    assert config_existed_during_run == [True]
    assert generated_config["connection_config"]["timeout"] == 60
    assert generated_config["connection_config"]["max_workers"] == 5
    assert generated_config["auth"]["confluence"]["http://wiki.htzq.htsc.com.cn"]["pat"] == "token123"
    assert result.mode == "pages"
    assert result.output_dir == str(tmp_path)


def test_run_export_bypasses_proxy_for_confluence_host(tmp_path, monkeypatch):
    calls = []
    monkeypatch.setenv("HTTP_PROXY", "http://proxy.example.com:8080")
    monkeypatch.setenv("HTTPS_PROXY", "http://proxy.example.com:8080")
    monkeypatch.setenv("NO_PROXY", "localhost")

    def fake_runner(cmd, **kwargs):
        calls.append((cmd, kwargs))
        return SimpleNamespace(returncode=0, stdout=b"", stderr=b"")

    wiki_export.run_export(
        urls=["http://wiki.htzq.htsc.com.cn/pages/viewpage.action?pageId=1"],
        mode="pages",
        output_dir=str(tmp_path),
        token="token123",
        runner=fake_runner,
        executable_finder=lambda name: "/usr/local/bin/cme" if name == "cme" else None,
        base_url="http://wiki.htzq.htsc.com.cn",
    )

    env = calls[0][1]["env"]
    assert "HTTP_PROXY" not in env
    assert "HTTPS_PROXY" not in env
    assert "http_proxy" not in env
    assert "https_proxy" not in env
    assert env["NO_PROXY"] == "localhost,wiki.htzq.htsc.com.cn"
    assert env["no_proxy"] == "localhost,wiki.htzq.htsc.com.cn"


def test_run_export_emits_diagnostic_logs_without_token(tmp_path, capsys):
    def fake_runner(cmd, **kwargs):
        return SimpleNamespace(returncode=0, stdout="", stderr="")

    wiki_export.run_export(
        urls=["http://wiki.example.com/pages/viewpage.action?pageId=1"],
        mode="pages",
        output_dir=str(tmp_path),
        token="secret-token-123",
        runner=fake_runner,
        executable_finder=lambda name: "/usr/local/bin/cme" if name == "cme" else None,
    )

    captured = capsys.readouterr()
    assert "[wiki-export] start mode=pages" in captured.err
    assert "[wiki-export] cme executable=/usr/local/bin/cme" in captured.err
    assert "[wiki-export] config path=" in captured.err
    assert "[wiki-export] cme return code=0" in captured.err
    assert "secret-token-123" not in captured.err


def test_command_for_tree_and_space(tmp_path):
    commands = []

    def fake_runner(cmd, **kwargs):
        commands.append(cmd)
        return SimpleNamespace(returncode=0, stdout="", stderr="")

    for mode in ("tree", "space"):
        wiki_export.run_export(
            urls=["http://wiki.example.com/display/ABC/Home"],
            mode=mode,
            output_dir=str(tmp_path / mode),
            token="token123",
            runner=fake_runner,
            executable_finder=lambda name: "cme" if name == "cme" else None,
        )

    assert commands[0][1] == "pages-with-descendants"
    assert commands[1][1] == "spaces"


def test_missing_exporter_raises_clear_error(tmp_path):
    with pytest.raises(wiki_export.WikiExportError, match="未安装 confluence-markdown-exporter"):
        wiki_export.run_export(
            urls=["http://wiki.example.com/pages/viewpage.action?pageId=1"],
            mode="pages",
            output_dir=str(tmp_path),
            token="token123",
            executable_finder=lambda name: None,
        )


def test_missing_token_raises_clear_error(tmp_path):
    with pytest.raises(wiki_export.WikiExportError, match="HTSC_WIKI_TOKEN"):
        wiki_export.run_export(
            urls=["http://wiki.example.com/pages/viewpage.action?pageId=1"],
            mode="pages",
            output_dir=str(tmp_path),
            token="",
            executable_finder=lambda name: "cme",
        )


def test_write_index_counts_markdown_and_attachments(tmp_path):
    (tmp_path / "SPACE").mkdir()
    (tmp_path / "SPACE" / "Page.md").write_text("# Page", encoding="utf-8")
    attachments = tmp_path / "SPACE" / "attachments"
    attachments.mkdir()
    (attachments / "img.png").write_bytes(b"fake")
    (attachments / "file.pdf").write_bytes(b"fake")

    index = wiki_export.write_index(
        output_dir=str(tmp_path),
        mode="pages",
        urls=["http://wiki.example.com/pages/viewpage.action?pageId=1"],
        statuses=[{"url": "http://wiki.example.com/pages/viewpage.action?pageId=1", "status": "success"}],
    )

    content = Path(index).read_text(encoding="utf-8")
    assert Path(index).name == "[WIKI_EXPORT_INDEX]导出索引.md"
    assert "导出的 Markdown 文件数量：1" in content
    assert "导出的附件文件数量：2" in content
    assert "SPACE/attachments" in content


def test_cme_error_is_decoded_without_encoding_failure(tmp_path):
    def fake_runner(cmd, **kwargs):
        return SimpleNamespace(returncode=1, stdout="".encode("gb18030"), stderr="中文错误".encode("gb18030"))

    with pytest.raises(wiki_export.WikiExportError, match="cme 执行失败"):
        wiki_export.run_export(
            urls=["http://wiki.example.com/display/AI/周报"],
            mode="pages",
            output_dir=str(tmp_path),
            token="token123",
            runner=fake_runner,
            executable_finder=lambda name: "/usr/local/bin/cme" if name == "cme" else None,
        )


def test_run_py_registers_wiki_export_command():
    skill_root = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(skill_root))
    import run

    assert "wiki-export" in run.COMMANDS
