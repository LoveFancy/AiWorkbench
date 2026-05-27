import importlib.util
import os
from pathlib import Path


def _load_run_module(module_path: Path):
    spec = importlib.util.spec_from_file_location("run_under_test", module_path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def test_loads_env_from_current_working_directory_without_git(tmp_path, monkeypatch):
    skill_dir = tmp_path / "plugin" / "skills" / "po-skills"
    skill_dir.mkdir(parents=True)
    source = Path(__file__).resolve().parents[1] / "run.py"
    run_py = skill_dir / "run.py"
    run_py.write_text(source.read_text(encoding="utf-8"), encoding="utf-8")

    project_dir = tmp_path / "aiworkspace"
    project_dir.mkdir()
    (project_dir / ".env").write_text("HTSC_WIKI_TOKEN=from_cwd\n", encoding="utf-8")

    monkeypatch.chdir(project_dir)
    monkeypatch.delenv("HTSC_WIKI_TOKEN", raising=False)
    monkeypatch.delenv("CLAUDE_PROJECT_DIR", raising=False)

    _load_run_module(run_py)

    assert os.environ["HTSC_WIKI_TOKEN"] == "from_cwd"


def test_records_skill_root_in_current_working_directory_env(tmp_path, monkeypatch):
    skill_dir = tmp_path / "plugin" / "skills" / "po-skills"
    skill_dir.mkdir(parents=True)
    source = Path(__file__).resolve().parents[1] / "run.py"
    run_py = skill_dir / "run.py"
    run_py.write_text(source.read_text(encoding="utf-8"), encoding="utf-8")

    project_dir = tmp_path / "aiworkspace"
    project_dir.mkdir()

    monkeypatch.chdir(project_dir)
    monkeypatch.delenv("PO_PROJECT_DIR", raising=False)
    monkeypatch.delenv("OPENCODE_PROJECT_DIR", raising=False)
    monkeypatch.delenv("CLAUDE_PROJECT_DIR", raising=False)

    _load_run_module(run_py)

    env_text = (project_dir / ".env").read_text(encoding="utf-8")
    assert f"POSKILL_SKILL_ROOT={skill_dir}" in env_text


def test_records_skill_root_in_explicit_project_root_env(tmp_path, monkeypatch):
    skill_dir = tmp_path / "plugin" / "skills" / "po-skills"
    skill_dir.mkdir(parents=True)
    source = Path(__file__).resolve().parents[1] / "run.py"
    run_py = skill_dir / "run.py"
    run_py.write_text(source.read_text(encoding="utf-8"), encoding="utf-8")

    project_dir = tmp_path / "workspace-from-po-project-dir"
    project_dir.mkdir()
    other_dir = tmp_path / "other"
    other_dir.mkdir()

    monkeypatch.chdir(other_dir)
    monkeypatch.setenv("PO_PROJECT_DIR", str(project_dir))

    _load_run_module(run_py)

    assert not (other_dir / ".env").exists()
    env_text = (project_dir / ".env").read_text(encoding="utf-8")
    assert f"POSKILL_SKILL_ROOT={skill_dir}" in env_text


def test_current_working_directory_env_wins_over_skill_fallback_env(tmp_path, monkeypatch):
    skill_dir = tmp_path / "plugin" / "skills" / "po-skills"
    skill_dir.mkdir(parents=True)
    source = Path(__file__).resolve().parents[1] / "run.py"
    run_py = skill_dir / "run.py"
    run_py.write_text(source.read_text(encoding="utf-8"), encoding="utf-8")
    (skill_dir / ".env").write_text("HTSC_WIKI_TOKEN=from_skill_fallback\n", encoding="utf-8")

    project_dir = tmp_path / "aiworkspace"
    project_dir.mkdir()
    (project_dir / ".env").write_text("HTSC_WIKI_TOKEN=from_cwd\n", encoding="utf-8")

    monkeypatch.chdir(project_dir)
    monkeypatch.delenv("HTSC_WIKI_TOKEN", raising=False)
    monkeypatch.delenv("CLAUDE_PROJECT_DIR", raising=False)

    _load_run_module(run_py)

    assert os.environ["HTSC_WIKI_TOKEN"] == "from_cwd"


def test_project_root_env_wins_over_current_working_directory_env(tmp_path, monkeypatch):
    skill_dir = tmp_path / "plugin" / "skills" / "po-skills"
    skill_dir.mkdir(parents=True)
    source = Path(__file__).resolve().parents[1] / "run.py"
    run_py = skill_dir / "run.py"
    run_py.write_text(source.read_text(encoding="utf-8"), encoding="utf-8")

    project_dir = tmp_path / "workspace-from-po-project-dir"
    project_dir.mkdir()
    (project_dir / ".env").write_text("HTSC_WIKI_TOKEN=from_project_root\n", encoding="utf-8")

    other_dir = tmp_path / "other"
    other_dir.mkdir()
    (other_dir / ".env").write_text("HTSC_WIKI_TOKEN=from_cwd\n", encoding="utf-8")

    monkeypatch.chdir(other_dir)
    monkeypatch.delenv("HTSC_WIKI_TOKEN", raising=False)
    monkeypatch.setenv("PO_PROJECT_DIR", str(project_dir))

    _load_run_module(run_py)

    assert os.environ["HTSC_WIKI_TOKEN"] == "from_project_root"


def test_env_file_value_wins_over_existing_environment_value(tmp_path, monkeypatch):
    skill_dir = tmp_path / "plugin" / "skills" / "po-skills"
    skill_dir.mkdir(parents=True)
    source = Path(__file__).resolve().parents[1] / "run.py"
    run_py = skill_dir / "run.py"
    run_py.write_text(source.read_text(encoding="utf-8"), encoding="utf-8")

    project_dir = tmp_path / "aiworkspace"
    project_dir.mkdir()
    (project_dir / ".env").write_text("HTSC_WIKI_TOKEN=from_cwd\n", encoding="utf-8")

    monkeypatch.chdir(project_dir)
    monkeypatch.setenv("HTSC_WIKI_TOKEN", "from_env")

    _load_run_module(run_py)

    assert os.environ["HTSC_WIKI_TOKEN"] == "from_cwd"


def test_loads_env_with_python_dotenv_syntax(tmp_path, monkeypatch):
    skill_dir = tmp_path / "plugin" / "skills" / "po-skills"
    skill_dir.mkdir(parents=True)
    source = Path(__file__).resolve().parents[1] / "run.py"
    run_py = skill_dir / "run.py"
    run_py.write_text(source.read_text(encoding="utf-8"), encoding="utf-8")

    project_dir = tmp_path / "aiworkspace"
    project_dir.mkdir()
    (project_dir / ".env").write_text(
        'export HTSC_WIKI_TOKEN="from dotenv" # inline comment\n',
        encoding="utf-8",
    )

    monkeypatch.chdir(project_dir)
    monkeypatch.delenv("HTSC_WIKI_TOKEN", raising=False)
    monkeypatch.delenv("CLAUDE_PROJECT_DIR", raising=False)

    _load_run_module(run_py)

    assert os.environ["HTSC_WIKI_TOKEN"] == "from dotenv"


def test_loads_env_from_claude_project_dir_when_injected(tmp_path, monkeypatch):
    skill_dir = tmp_path / "plugin" / "skills" / "po-skills"
    skill_dir.mkdir(parents=True)
    source = Path(__file__).resolve().parents[1] / "run.py"
    run_py = skill_dir / "run.py"
    run_py.write_text(source.read_text(encoding="utf-8"), encoding="utf-8")

    project_dir = tmp_path / "workspace-from-claude"
    project_dir.mkdir()
    (project_dir / ".env").write_text("HTSC_WIKI_TOKEN=from_claude_project_dir\n", encoding="utf-8")

    other_dir = tmp_path / "other"
    other_dir.mkdir()
    monkeypatch.chdir(other_dir)
    monkeypatch.delenv("HTSC_WIKI_TOKEN", raising=False)
    monkeypatch.setenv("CLAUDE_PROJECT_DIR", str(project_dir))

    _load_run_module(run_py)

    assert os.environ["HTSC_WIKI_TOKEN"] == "from_claude_project_dir"


def test_loads_env_from_po_project_dir_before_claude_project_dir(tmp_path, monkeypatch):
    skill_dir = tmp_path / "plugin" / "skills" / "po-skills"
    skill_dir.mkdir(parents=True)
    source = Path(__file__).resolve().parents[1] / "run.py"
    run_py = skill_dir / "run.py"
    run_py.write_text(source.read_text(encoding="utf-8"), encoding="utf-8")

    po_project_dir = tmp_path / "workspace-from-po-project-dir"
    po_project_dir.mkdir()
    (po_project_dir / ".env").write_text("HTSC_WIKI_TOKEN=from_po_project_dir\n", encoding="utf-8")

    claude_project_dir = tmp_path / "workspace-from-claude"
    claude_project_dir.mkdir()
    (claude_project_dir / ".env").write_text("HTSC_WIKI_TOKEN=from_claude_project_dir\n", encoding="utf-8")

    other_dir = tmp_path / "other"
    other_dir.mkdir()
    monkeypatch.chdir(other_dir)
    monkeypatch.delenv("HTSC_WIKI_TOKEN", raising=False)
    monkeypatch.setenv("PO_PROJECT_DIR", str(po_project_dir))
    monkeypatch.setenv("CLAUDE_PROJECT_DIR", str(claude_project_dir))

    _load_run_module(run_py)

    assert os.environ["HTSC_WIKI_TOKEN"] == "from_po_project_dir"


def test_maps_confluence_token_env_to_htsc_wiki_token(tmp_path, monkeypatch):
    skill_dir = tmp_path / "plugin" / "skills" / "po-skills"
    skill_dir.mkdir(parents=True)
    source = Path(__file__).resolve().parents[1] / "run.py"
    run_py = skill_dir / "run.py"
    run_py.write_text(source.read_text(encoding="utf-8"), encoding="utf-8")

    project_dir = tmp_path / "aiworkspace"
    project_dir.mkdir()
    (project_dir / ".env").write_text("CONFLUENCE_TOKEN=from_confluence_token\n", encoding="utf-8")

    monkeypatch.chdir(project_dir)
    monkeypatch.delenv("HTSC_WIKI_TOKEN", raising=False)
    monkeypatch.delenv("CONFLUENCE_TOKEN", raising=False)
    monkeypatch.delenv("CLAUDE_PROJECT_DIR", raising=False)

    _load_run_module(run_py)

    assert os.environ["HTSC_WIKI_TOKEN"] == "from_confluence_token"
