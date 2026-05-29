import importlib.util
import json
from pathlib import Path


BOOTSTRAP_PY = Path(__file__).resolve().parents[1] / "bootstrap.py"


def load_bootstrap_module():
    spec = importlib.util.spec_from_file_location("bootstrap_under_test", BOOTSTRAP_PY)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def test_ensure_environment_installs_requirements_and_writes_state(tmp_path):
    bootstrap = load_bootstrap_module()
    requirements = tmp_path / "requirements.txt"
    requirements.write_text("requests>=2.28.0\n", encoding="utf-8")
    state_file = tmp_path / ".poskill-env.json"
    calls = []

    def fake_run(cmd):
        calls.append(cmd)

    bootstrap.ensure_environment(
        skill_dir=tmp_path,
        requirements_path=requirements,
        state_path=state_file,
        python_executable="/usr/bin/python3.14",
        python_version="3.14.2",
        runner=fake_run,
    )

    assert calls == [
        [
            "/usr/bin/python3.14",
            "-m",
            "pip",
            "install",
            "-i",
            bootstrap.PIP_INDEX_URL,
            "--trusted-host",
            bootstrap.PIP_TRUSTED_HOST,
            "-r",
            str(requirements),
        ]
    ]
    state = json.loads(state_file.read_text(encoding="utf-8"))
    assert state["python"] == "/usr/bin/python3.14"
    assert state["python_version"] == "3.14.2"
    assert state["requirements_hash"] == bootstrap.hash_file(requirements)


def test_validate_python_version_accepts_python_3_11(monkeypatch):
    bootstrap = load_bootstrap_module()
    monkeypatch.setattr(bootstrap.sys, "version_info", (3, 11, 0))

    bootstrap._validate_python_version()


def test_validate_python_version_rejects_python_3_10(monkeypatch, capsys):
    bootstrap = load_bootstrap_module()
    monkeypatch.setattr(bootstrap.sys, "version_info", (3, 10, 9))

    try:
        bootstrap._validate_python_version()
    except SystemExit as exc:
        assert exc.code == 1
    else:
        raise AssertionError("Expected Python 3.10 to be rejected")

    err = capsys.readouterr().err
    assert "Python 3.11+" in err
    assert "3.10.9" in err


def test_main_explains_first_run_self_check(tmp_path, monkeypatch, capsys):
    bootstrap = load_bootstrap_module()
    requirements = tmp_path / "requirements.txt"
    requirements.write_text("requests>=2.28.0\n", encoding="utf-8")
    monkeypatch.setattr(bootstrap, "_validate_python_version", lambda: None)
    monkeypatch.setattr(bootstrap, "_current_python_version", lambda: "3.14.2")
    monkeypatch.setattr(bootstrap.sys, "executable", "/usr/bin/python3.14")
    monkeypatch.setattr(bootstrap, "_default_skill_dir", lambda: tmp_path)
    monkeypatch.setattr(bootstrap, "_default_runner", lambda cmd: None)

    bootstrap.main([])

    out = capsys.readouterr().out
    assert "第一次使用 Poskill" in out
    assert "正在进行环境自检" in out
    assert "正在使用清华 PyPI 镜像安装 Python 依赖" in out


def test_main_initializes_env_template_on_first_run(tmp_path, monkeypatch, capsys):
    bootstrap = load_bootstrap_module()
    requirements = tmp_path / "requirements.txt"
    requirements.write_text("requests>=2.28.0\n", encoding="utf-8")
    monkeypatch.setattr(bootstrap, "_validate_python_version", lambda: None)
    monkeypatch.setattr(bootstrap, "_current_python_version", lambda: "3.14.2")
    monkeypatch.setattr(bootstrap.sys, "executable", "/usr/bin/python3.14")
    monkeypatch.setattr(bootstrap, "_default_skill_dir", lambda: tmp_path)
    monkeypatch.setattr(bootstrap, "_default_runner", lambda cmd: None)

    bootstrap.main([])

    env_file = tmp_path / ".env"
    assert env_file.is_file()
    env_text = env_file.read_text(encoding="utf-8")
    assert "HTSC_WIKI_TOKEN=" in env_text
    assert "HTSC_WIKI_SPACE_KEY=" in env_text
    assert "HTSC_WIKI_PARENT_PAGE_ID=" in env_text
    out = capsys.readouterr().out
    assert "已初始化 Poskill 配置文件" in out
    assert "HTSC_WIKI_TOKEN" in out


def test_main_preserves_existing_env_file(tmp_path, monkeypatch):
    bootstrap = load_bootstrap_module()
    requirements = tmp_path / "requirements.txt"
    requirements.write_text("requests>=2.28.0\n", encoding="utf-8")
    env_file = tmp_path / ".env"
    env_file.write_text("HTSC_WIKI_TOKEN=existing\n", encoding="utf-8")
    monkeypatch.setattr(bootstrap, "_validate_python_version", lambda: None)
    monkeypatch.setattr(bootstrap, "_current_python_version", lambda: "3.14.2")
    monkeypatch.setattr(bootstrap.sys, "executable", "/usr/bin/python3.14")
    monkeypatch.setattr(bootstrap, "_default_skill_dir", lambda: tmp_path)
    monkeypatch.setattr(bootstrap, "_default_runner", lambda cmd: None)

    bootstrap.main([])

    assert env_file.read_text(encoding="utf-8") == "HTSC_WIKI_TOKEN=existing\n"


def test_main_runs_wrapped_command_after_self_check(tmp_path, monkeypatch, capsys):
    bootstrap = load_bootstrap_module()
    requirements = tmp_path / "requirements.txt"
    requirements.write_text("requests>=2.28.0\n", encoding="utf-8")
    monkeypatch.setattr(bootstrap, "_validate_python_version", lambda: None)
    monkeypatch.setattr(bootstrap, "_current_python_version", lambda: "3.11.11")
    monkeypatch.setattr(bootstrap.sys, "executable", "/usr/bin/python3.11")
    monkeypatch.setattr(bootstrap, "_default_skill_dir", lambda: tmp_path)
    calls = []

    def fake_runner(cmd):
        calls.append(cmd)

    monkeypatch.setattr(bootstrap, "_default_runner", fake_runner)

    bootstrap.main(["--", "python", "run.py", "init-workspace"])

    assert calls == [
        [
            "/usr/bin/python3.11",
            "-m",
            "pip",
            "install",
            "-i",
            bootstrap.PIP_INDEX_URL,
            "--trusted-host",
            bootstrap.PIP_TRUSTED_HOST,
            "-r",
            str(requirements),
        ],
        ["python", "run.py", "init-workspace"],
    ]
    out = capsys.readouterr().out
    assert "POSKILL_ENV_READY=true" not in out
    assert "POSKILL_ENV_STATE=" not in out


def test_ensure_environment_skips_install_when_state_matches(tmp_path):
    bootstrap = load_bootstrap_module()
    requirements = tmp_path / "requirements.txt"
    requirements.write_text("requests>=2.28.0\n", encoding="utf-8")
    state_file = tmp_path / ".poskill-env.json"
    state_file.write_text(
        json.dumps(
            {
                "schema_version": 1,
                "python": "/usr/bin/python3.14",
                "python_version": "3.14.2",
                "requirements_hash": bootstrap.hash_file(requirements),
            }
        ),
        encoding="utf-8",
    )
    calls = []

    bootstrap.ensure_environment(
        skill_dir=tmp_path,
        requirements_path=requirements,
        state_path=state_file,
        python_executable="/usr/bin/python3.14",
        python_version="3.14.2",
        runner=lambda cmd: calls.append(cmd),
    )

    assert calls == []


def test_main_keeps_output_short_when_state_matches(tmp_path, monkeypatch, capsys):
    bootstrap = load_bootstrap_module()
    requirements = tmp_path / "requirements.txt"
    requirements.write_text("requests>=2.28.0\n", encoding="utf-8")
    state_file = tmp_path / ".poskill-env.json"
    state_file.write_text(
        json.dumps(
            {
                "schema_version": 1,
                "python": "/usr/bin/python3.14",
                "python_version": "3.14.2",
                "requirements_hash": bootstrap.hash_file(requirements),
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(bootstrap, "_validate_python_version", lambda: None)
    monkeypatch.setattr(bootstrap, "_current_python_version", lambda: "3.14.2")
    monkeypatch.setattr(bootstrap.sys, "executable", "/usr/bin/python3.14")
    monkeypatch.setattr(bootstrap, "_default_skill_dir", lambda: tmp_path)
    monkeypatch.setattr(bootstrap, "_default_runner", lambda cmd: None)

    bootstrap.main([])

    out = capsys.readouterr().out
    assert "第一次使用 Poskill" not in out
    assert "正在安装 Python 依赖" not in out
    assert "POSKILL_ENV_INSTALLED=false" in out


def test_ensure_environment_reinstalls_when_requirements_change(tmp_path):
    bootstrap = load_bootstrap_module()
    requirements = tmp_path / "requirements.txt"
    requirements.write_text("requests>=2.28.0\n", encoding="utf-8")
    state_file = tmp_path / ".poskill-env.json"
    state_file.write_text(
        json.dumps(
            {
                "schema_version": 1,
                "python": "/usr/bin/python3.14",
                "python_version": "3.14.2",
                "requirements_hash": "sha256:old",
            }
        ),
        encoding="utf-8",
    )
    calls = []

    bootstrap.ensure_environment(
        skill_dir=tmp_path,
        requirements_path=requirements,
        state_path=state_file,
        python_executable="/usr/bin/python3.14",
        python_version="3.14.2",
        runner=lambda cmd: calls.append(cmd),
    )

    assert calls == [
        [
            "/usr/bin/python3.14",
            "-m",
            "pip",
            "install",
            "-i",
            bootstrap.PIP_INDEX_URL,
            "--trusted-host",
            bootstrap.PIP_TRUSTED_HOST,
            "-r",
            str(requirements),
        ]
    ]
