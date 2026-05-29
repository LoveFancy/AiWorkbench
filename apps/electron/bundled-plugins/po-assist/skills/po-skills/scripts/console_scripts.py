"""Resolve Python console scripts installed by pip across shells and platforms."""

from __future__ import annotations

import os
import site
import sys
import sysconfig
from pathlib import Path
from typing import Callable


def _candidate_names(name: str) -> list[str]:
    suffixes = (".exe", ".cmd", ".bat", "")
    names = []
    for suffix in suffixes:
        candidate = f"{name}{suffix}"
        if candidate not in names:
            names.append(candidate)
    return names


def _candidate_dirs() -> list[Path]:
    dirs: list[Path] = []
    scripts_path = sysconfig.get_path("scripts")
    if scripts_path:
        dirs.append(Path(scripts_path))

    python_dir = Path(sys.executable).resolve().parent
    dirs.extend(
        [
            python_dir,
            python_dir / "Scripts",
            python_dir.parent / "Scripts",
            python_dir.parent / "bin",
        ]
    )

    user_base = site.getuserbase()
    if user_base:
        dirs.extend([Path(user_base) / "Scripts", Path(user_base) / "bin"])

    seen = set()
    unique_dirs = []
    for directory in dirs:
        key = os.path.normcase(str(directory))
        if key in seen:
            continue
        seen.add(key)
        unique_dirs.append(directory)
    return unique_dirs


def _prefer_sibling_executable(path: Path, name: str) -> Path:
    if path.suffix.lower() in {".exe", ".cmd", ".bat"}:
        return path
    for candidate_name in _candidate_names(name):
        candidate = path.with_name(candidate_name)
        if candidate.is_file():
            return candidate
    return path


def resolve_console_script(
    name: str,
    *,
    executable_finder: Callable[[str], str | None],
) -> str | None:
    found = executable_finder(name)
    if found:
        return str(_prefer_sibling_executable(Path(found), name))

    for directory in _candidate_dirs():
        for candidate_name in _candidate_names(name):
            candidate = directory / candidate_name
            if candidate.is_file():
                return str(candidate)
    return None
