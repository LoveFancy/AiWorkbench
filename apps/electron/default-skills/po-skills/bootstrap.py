#!/usr/bin/env python3
"""Poskill runtime environment self-check.

This script assumes a Python interpreter is already available. It installs the
skill Python dependencies once per plugin version directory and records the
state in `.poskill-env.json`.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path


SCHEMA_VERSION = 1
MIN_PYTHON = (3, 11)
PYTHON_HELP_URL = "http://eip.htsc.com.cn/huatech/practices/124061#heading-0"


def _configure_stdio() -> None:
    """Keep Chinese output readable in Windows terminals when supported."""
    for stream_name in ("stdout", "stderr"):
        stream = getattr(sys, stream_name, None)
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")


_configure_stdio()


def hash_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            digest.update(chunk)
    return "sha256:" + digest.hexdigest()


def _load_state(path: Path) -> dict:
    if not path.is_file():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def _state_matches(
    state: dict,
    python_executable: str,
    python_version: str,
    requirements_hash: str,
) -> bool:
    return (
        state.get("schema_version") == SCHEMA_VERSION
        and state.get("python") == python_executable
        and state.get("python_version") == python_version
        and state.get("requirements_hash") == requirements_hash
    )


def _write_state(
    path: Path,
    python_executable: str,
    python_version: str,
    requirements_hash: str,
) -> None:
    payload = {
        "schema_version": SCHEMA_VERSION,
        "python": python_executable,
        "python_version": python_version,
        "requirements_hash": requirements_hash,
        "last_checked_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _default_runner(cmd: list[str]) -> None:
    subprocess.run(cmd, check=True)


def _default_skill_dir() -> Path:
    return Path(__file__).resolve().parent


def _initialize_env_file(path: Path) -> bool:
    if path.exists():
        return False
    template = "\n".join(
        [
            "# Poskill 配置",
            "# Wiki Personal Access Token。需要下载或上传 Wiki 时填写。",
            "HTSC_WIKI_TOKEN=",
            "",
            "# Wiki 上传默认目标。可选，后续上传时可按需填写。",
            "HTSC_WIKI_SPACE_KEY=",
            "HTSC_WIKI_PARENT_PAGE_ID=",
            "HTSC_WIKI_PARENT_PAGE_URL=",
            "",
        ]
    )
    path.write_text(template, encoding="utf-8")
    return True


def ensure_environment(
    *,
    skill_dir: Path,
    requirements_path: Path,
    state_path: Path,
    python_executable: str,
    python_version: str,
    runner=_default_runner,
) -> bool:
    """Ensure Python dependencies are installed.

    Returns True when installation was executed, False when existing state was reused.
    """
    requirements_hash = hash_file(requirements_path)
    state = _load_state(state_path)
    if _state_matches(state, python_executable, python_version, requirements_hash):
        return False

    runner([python_executable, "-m", "pip", "install", "-r", str(requirements_path)])
    _write_state(state_path, python_executable, python_version, requirements_hash)
    return True


def _current_python_version() -> str:
    return ".".join(str(part) for part in sys.version_info[:3])


def _validate_python_version() -> None:
    if sys.version_info < MIN_PYTHON:
        required = ".".join(str(part) for part in MIN_PYTHON)
        current = _current_python_version()
        print(
            f"Poskill 需要 Python {required}+，当前 Python 是 {current}。\n"
            f"请先参考文档安装或配置 Python：{PYTHON_HELP_URL}",
            file=sys.stderr,
        )
        raise SystemExit(1)


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Poskill 环境自检")
    parser.add_argument("--force", action="store_true", help="忽略状态文件，强制重新安装依赖")
    parser.add_argument("command", nargs=argparse.REMAINDER, help="自检完成后执行的命令")
    args = parser.parse_args(argv)

    _validate_python_version()

    skill_dir = _default_skill_dir()
    requirements_path = skill_dir / "requirements.txt"
    state_path = skill_dir / ".poskill-env.json"
    if args.force and state_path.exists():
        state_path.unlink()

    first_run = not state_path.exists()
    if first_run:
        print("检测到你是第一次使用 Poskill，正在进行环境自检。")
        print("首次自检会安装 Poskill 所需的 Python 依赖，后续同版本目录下不会重复执行。")
        print("正在安装 Python 依赖，请稍候...")
        if _initialize_env_file(skill_dir / ".env"):
            print("已初始化 Poskill 配置文件 .env。")
            print("如需使用 Wiki 下载或上传，请补充 HTSC_WIKI_TOKEN；其他配置可后续用到时再填写。")

    installed = ensure_environment(
        skill_dir=skill_dir,
        requirements_path=requirements_path,
        state_path=state_path,
        python_executable=sys.executable,
        python_version=_current_python_version(),
        runner=_default_runner,
    )
    command = args.command
    if command and command[0] == "--":
        command = command[1:]
    if command:
        _default_runner(command)
        return

    print("POSKILL_ENV_READY=true")
    print(f"POSKILL_ENV_STATE={state_path}")
    print(f"POSKILL_ENV_INSTALLED={'true' if installed else 'false'}")


if __name__ == "__main__":
    main()
