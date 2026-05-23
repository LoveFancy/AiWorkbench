import importlib.util
import sys
from pathlib import Path

import pytest


RUN_PY = Path(__file__).resolve().parents[1] / "run.py"


def load_run_module(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    sys.modules.pop("run_under_test", None)
    spec = importlib.util.spec_from_file_location("run_under_test", RUN_PY)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def parse_stdout(stdout: str) -> dict[str, str]:
    values = {}
    for line in stdout.splitlines():
        if "=" in line:
            key, value = line.split("=", 1)
            values[key] = value
    return values


def test_init_workspace_creates_global_dirs_index_and_readmes(monkeypatch, tmp_path, capsys):
    run = load_run_module(monkeypatch, tmp_path)

    run.cmd_init_workspace([])

    out = parse_stdout(capsys.readouterr().out)
    assert out["RAW_DIR"] == "raw"
    assert out["WIKI_DIR"] == "wiki"
    assert out["NEWREQ_DIR"] == "newreq"
    assert out["REQ_INDEX"] == "newreq/req.index"
    assert out["CREATED"] == "true"
    assert (tmp_path / "raw" / "README.md").is_file()
    assert (tmp_path / "wiki" / "README.md").is_file()
    assert (tmp_path / "newreq" / "README.md").is_file()
    index_text = (tmp_path / "newreq" / "req.index").read_text(encoding="utf-8")
    assert index_text.startswith("# req.index")
    assert "当前记录：" in index_text


def test_output_path_prefix_overrides_workspace_root(monkeypatch, tmp_path, capsys):
    output_root = tmp_path / "session" / "OUTPUT"
    cwd = tmp_path / "repo"
    cwd.mkdir()
    monkeypatch.setenv("OUTPUT_PATH_PREFIX", str(output_root))
    run = load_run_module(monkeypatch, cwd)

    run.cmd_newreq(["--reqid", "REQ-004", "--title", "即时查询SQL执行优化需求"])

    out = parse_stdout(capsys.readouterr().out)
    assert out["REQ_ROOT"] == f"{output_root}/newreq/REQ-004"
    assert out["DESIGN_DIR"] == f"{output_root}/newreq/REQ-004/1.产品设计"
    assert out["IMAGES_DIR"] == f"{output_root}/newreq/REQ-004/1.产品设计/images"
    assert out["REFERENCES_DIR"] == f"{output_root}/newreq/REQ-004/references"
    assert out["REFERENCE_IMAGES_DIR"] == f"{output_root}/newreq/REQ-004/references/images"
    assert out["RAW_DIR"] == f"{output_root}/raw"
    assert out["WIKI_DIR"] == f"{output_root}/wiki"
    assert out["REQ_INDEX"] == f"{output_root}/newreq/req.index"
    assert (output_root / "newreq" / "REQ-004" / "1.产品设计" / "images").is_dir()
    assert not (cwd / "newreq").exists()


def test_init_workspace_force_accepts_flag(monkeypatch, tmp_path, capsys):
    run = load_run_module(monkeypatch, tmp_path)

    run.cmd_init_workspace(["--force"])

    out = parse_stdout(capsys.readouterr().out)
    assert out["CREATED"] == "true"
    assert (tmp_path / "raw" / "README.md").is_file()
    assert (tmp_path / "wiki" / "README.md").is_file()
    assert (tmp_path / "newreq" / "README.md").is_file()


def test_newreq_creates_requirement_skeleton_and_index(monkeypatch, tmp_path, capsys):
    run = load_run_module(monkeypatch, tmp_path)

    run.cmd_newreq(["--reqid", "TAILOR-124", "--title", "客户标签优化"])

    out = parse_stdout(capsys.readouterr().out)
    assert out["REQID"] == "TAILOR-124"
    assert out["REQ_ROOT"] == "newreq/TAILOR-124"
    assert out["DESIGN_DIR"] == "newreq/TAILOR-124/1.产品设计"
    assert out["IMAGES_DIR"] == "newreq/TAILOR-124/1.产品设计/images"
    assert out["REFERENCES_DIR"] == "newreq/TAILOR-124/references"
    assert out["REFERENCE_IMAGES_DIR"] == "newreq/TAILOR-124/references/images"
    assert out["NEXT_STEP"] == "prd-write"
    assert out["CREATED"] == "true"
    assert not (tmp_path / "newreq" / "TAILOR-124" / "README.md").exists()
    assert not (tmp_path / "newreq" / "TAILOR-124" / "1.产品设计" / "README.md").exists()
    assert (tmp_path / "newreq" / "TAILOR-124" / "1.产品设计" / "images").is_dir()
    assert not (tmp_path / "newreq" / "TAILOR-124" / "references" / "README.md").exists()
    assert (tmp_path / "newreq" / "TAILOR-124" / "references" / "images").is_dir()
    index_text = (tmp_path / "newreq" / "req.index").read_text(encoding="utf-8")
    assert "## TAILOR-124" in index_text
    assert "- reqid: TAILOR-124" in index_text
    assert "- title: 客户标签优化" in index_text
    assert "- path: newreq/TAILOR-124" in index_text
    assert "- status: initialized" in index_text


def test_newreq_init_only_does_not_emit_prd_next_step(monkeypatch, tmp_path, capsys):
    run = load_run_module(monkeypatch, tmp_path)

    run.cmd_newreq(["--reqid", "TAILOR-125", "--init-only"])

    out = parse_stdout(capsys.readouterr().out)
    assert out["NEXT_STEP"] == ""


def test_newreq_updates_single_markdown_index_row(monkeypatch, tmp_path):
    run = load_run_module(monkeypatch, tmp_path)

    run.cmd_newreq(["--reqid", "TAILOR-124", "--title", "旧标题", "--init-only"])
    run.cmd_newreq(["--reqid", "TAILOR-124", "--title", "新标题", "--init-only"])

    index_text = (tmp_path / "newreq" / "req.index").read_text(encoding="utf-8")
    assert index_text.count("## TAILOR-124") == 1
    assert "- title: 新标题" in index_text
    assert "旧标题" not in index_text


def test_resolve_workspace_from_file_validates_existing_newreq_space(monkeypatch, tmp_path, capsys):
    run = load_run_module(monkeypatch, tmp_path)
    run.cmd_newreq(["--reqid", "TAILOR-124", "--init-only"])
    capsys.readouterr()
    source = tmp_path / "newreq" / "TAILOR-124" / "1.产品设计" / "[PROD_ORI]需求.md"
    source.write_text("content", encoding="utf-8")

    run.cmd_resolve_workspace(["--from-file", str(source)])

    out = parse_stdout(capsys.readouterr().out)
    assert out["REQID"] == "TAILOR-124"
    assert out["REQ_ROOT"] == "newreq/TAILOR-124"
    assert out["DESIGN_DIR"] == "newreq/TAILOR-124/1.产品设计"
    assert out["REFERENCES_DIR"] == "newreq/TAILOR-124/references"
    assert out["REFERENCE_IMAGES_DIR"] == "newreq/TAILOR-124/references/images"
    assert out["RAW_DIR"] == "raw"
    assert out["WIKI_DIR"] == "wiki"
    assert out["REQ_INDEX"] == "newreq/req.index"
    assert (tmp_path / "newreq" / "req.index").read_text(encoding="utf-8").count("## TAILOR-124") == 1


def test_resolve_workspace_rejects_legacy_requirement_path(monkeypatch, tmp_path, capsys):
    run = load_run_module(monkeypatch, tmp_path)
    legacy = tmp_path / "TAILOR-124" / "1.产品设计" / "[PROD_ORI]需求.md"
    legacy.parent.mkdir(parents=True)
    legacy.write_text("content", encoding="utf-8")

    with pytest.raises(SystemExit) as exc:
        run.cmd_resolve_workspace(["--from-file", str(legacy)])

    assert exc.value.code == 1
    assert "newreq/<REQID>" in capsys.readouterr().err


def test_doc_convert_requires_explicit_workspace_target(monkeypatch, tmp_path, capsys):
    run = load_run_module(monkeypatch, tmp_path)

    with pytest.raises(SystemExit) as exc:
        run.cmd_doc_convert(["--url", "1"])

    assert exc.value.code == 2
    assert "--reqid、--raw 或 --output-dir" in capsys.readouterr().err


def test_doc_convert_reqid_uses_existing_design_dir(monkeypatch, tmp_path):
    run = load_run_module(monkeypatch, tmp_path)
    run.cmd_newreq(["--reqid", "TAILOR-124", "--init-only"])

    captured = {}

    class FakeDocConvert:
        @staticmethod
        def main():
            captured["argv"] = list(sys.argv)

    monkeypatch.setitem(sys.modules, "doc_convert", FakeDocConvert)

    run.cmd_doc_convert(["--url", "1", "--reqid", "TAILOR-124"])

    assert captured["argv"] == [
        "doc_convert.py",
        "--output-dir",
        "newreq/TAILOR-124/1.产品设计",
        "--url",
        "1",
    ]


def test_doc_convert_lark_url_routes_to_lark_doc_to_md(monkeypatch, tmp_path):
    run = load_run_module(monkeypatch, tmp_path)
    run.cmd_newreq(["--reqid", "TAILOR-124", "--init-only"])

    captured = {}

    class FakeLarkDocToMd:
        @staticmethod
        def main():
            captured["argv"] = list(sys.argv)
            print("OUTPUT_FILE=newreq/TAILOR-124/1.产品设计/[PROD_ORI]飞书标题.md")

        @staticmethod
        def is_lark_doc_url(value):
            return "feishu.cn/docx/" in value

    monkeypatch.setitem(sys.modules, "lark_doc_to_md", FakeLarkDocToMd)

    run.cmd_doc_convert(["--url", "https://example.feishu.cn/docx/abc", "--reqid", "TAILOR-124"])

    assert captured["argv"] == [
        "lark_doc_to_md.py",
        "--output-dir",
        "newreq/TAILOR-124/1.产品设计",
        "--doc",
        "https://example.feishu.cn/docx/abc",
    ]


def test_doc_convert_lark_url_without_reqid_uses_raw_and_does_not_prompt(monkeypatch, tmp_path):
    run = load_run_module(monkeypatch, tmp_path)

    captured = {}

    class FakeLarkDocToMd:
        @staticmethod
        def main():
            captured["argv"] = list(sys.argv)
            print("OUTPUT_FILE=raw/[PROD_ORI]飞书标题.md")

        @staticmethod
        def is_lark_doc_url(value):
            return "feishu.cn/wiki/" in value

    monkeypatch.setitem(sys.modules, "lark_doc_to_md", FakeLarkDocToMd)

    run.cmd_doc_convert(["--url", "https://my.feishu.cn/wiki/OWqmwAX1ki5GmmkXcOVchtP7noh"])

    assert captured["argv"] == [
        "lark_doc_to_md.py",
        "--output-dir",
        "raw/OWqmwAX1ki5GmmkXcOVchtP7noh",
        "--doc",
        "https://my.feishu.cn/wiki/OWqmwAX1ki5GmmkXcOVchtP7noh",
    ]


def test_doc_convert_wiki_raw_uses_title_subdirectory(monkeypatch, tmp_path):
    run = load_run_module(monkeypatch, tmp_path)
    run.cmd_init_workspace([])

    captured = {}

    class FakeDocConvert:
        @staticmethod
        def main():
            captured["argv"] = list(sys.argv)
            print("OUTPUT_FILE=raw/客户画像/[PROD_ORI]客户画像.md")

        @staticmethod
        def _fetch_page_title(token, page_id):
            return "客户画像"

        @staticmethod
        def extract_page_id(value):
            return "123456"

        @staticmethod
        def load_from_json(path):
            return "ignored", "", ""

    class FakeLarkDocToMd:
        @staticmethod
        def is_lark_doc_url(value):
            return False

    monkeypatch.setenv("HTSC_WIKI_TOKEN", "token")
    monkeypatch.setitem(sys.modules, "doc_convert", FakeDocConvert)
    monkeypatch.setitem(sys.modules, "lark_doc_to_md", FakeLarkDocToMd)

    run.cmd_doc_convert(["--url", "http://wiki/pages/viewpage.action?pageId=123456", "--raw"])

    assert captured["argv"] == [
        "doc_convert.py",
        "--output-dir",
        "raw/客户画像",
        "--url",
        "http://wiki/pages/viewpage.action?pageId=123456",
    ]


def test_doc_convert_json_raw_uses_json_title_subdirectory(monkeypatch, tmp_path):
    run = load_run_module(monkeypatch, tmp_path)
    run.cmd_init_workspace([])
    source = tmp_path / "page.json"
    source.write_text("{}", encoding="utf-8")

    captured = {}

    class FakeDocConvert:
        @staticmethod
        def main():
            captured["argv"] = list(sys.argv)
            print("OUTPUT_FILE=raw/交易台账/[PROD_ORI]交易台账.md")

        @staticmethod
        def _fetch_page_title(token, page_id):
            return "ignored"

        @staticmethod
        def extract_page_id(value):
            return "ignored"

        @staticmethod
        def load_from_json(path):
            return "交易台账", "<p>content</p>", "123"

    class FakeLarkDocToMd:
        @staticmethod
        def is_lark_doc_url(value):
            return False

    monkeypatch.setitem(sys.modules, "doc_convert", FakeDocConvert)
    monkeypatch.setitem(sys.modules, "lark_doc_to_md", FakeLarkDocToMd)

    run.cmd_doc_convert(["--file", str(source), "--raw"])

    assert captured["argv"] == [
        "doc_convert.py",
        "--output-dir",
        "raw/交易台账",
        "--file",
        str(source),
    ]


def test_doc_to_md_requires_output_dir_or_reqid(monkeypatch, tmp_path, capsys):
    run = load_run_module(monkeypatch, tmp_path)
    source = tmp_path / "需求说明.docx"
    source.write_bytes(b"fake")

    with pytest.raises(SystemExit) as exc:
        run.cmd_doc_to_md(["--file", str(source)])

    assert exc.value.code == 2
    assert "--reqid 或 --output-dir" in capsys.readouterr().err


def test_init_story_is_legacy_in_command_help(monkeypatch, tmp_path, capsys):
    run = load_run_module(monkeypatch, tmp_path)

    with pytest.raises(SystemExit):
        run.cmd_init_story(["--help"])

    output = capsys.readouterr().out
    assert "LEGACY" in output
    assert "不推荐新项目使用" in output


def test_wiki_upload_command_is_registered(monkeypatch, tmp_path):
    run = load_run_module(monkeypatch, tmp_path)

    assert "wiki-upload" in run.COMMANDS
