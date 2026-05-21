#!/usr/bin/env python3
"""Find the newest stable browser-downloaded file that matches an expected title."""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from dataclasses import asdict, dataclass
from pathlib import Path


TEMP_SUFFIXES = (".crdownload", ".download", ".tmp", ".part")


class DownloadTimeout(Exception):
    pass


class DownloadAmbiguous(Exception):
    pass


@dataclass
class FileState:
    size: int
    mtime: float


def default_download_dir() -> Path:
    return Path.home() / "Downloads"


def _norm(value: str) -> str:
    return re.sub(r"[\s【】\[\]()（）_\-.]+", "", value).lower()


def snapshot_download_dir(download_dir: str | Path) -> dict[str, FileState]:
    root = Path(download_dir).expanduser()
    root.mkdir(parents=True, exist_ok=True)
    snapshot: dict[str, FileState] = {}
    for path in root.iterdir():
        if not path.is_file():
            continue
        stat = path.stat()
        snapshot[path.name] = FileState(size=stat.st_size, mtime=stat.st_mtime)
    return snapshot


def _is_stable(path: Path, interval: float) -> bool:
    first = path.stat().st_size
    if interval:
        time.sleep(interval)
    second = path.stat().st_size
    return first == second


def _candidate_score(path: Path, expected_title: str) -> int:
    expected = _norm(Path(expected_title).stem)
    if not expected:
        return 0
    name = _norm(path.stem)
    if expected in name:
        return 3
    if name in expected:
        return 2
    return 0


def _find_candidates(root: Path, expected_title: str) -> list[tuple[int, float, Path]]:
    candidates: list[tuple[int, float, Path]] = []
    for path in root.iterdir():
        if not path.is_file():
            continue
        if path.name.endswith(TEMP_SUFFIXES):
            continue
        stat = path.stat()
        score = _candidate_score(path, expected_title)
        candidates.append((score, stat.st_mtime, path))
    return candidates


def find_downloaded_file(
    download_dir: str | Path,
    expected_title: str,
    timeout_seconds: float = 60,
    poll_interval: float = 1,
) -> Path:
    root = Path(download_dir).expanduser()
    deadline = time.time() + timeout_seconds
    last_candidates: list[tuple[int, float, Path]] = []

    while True:
        candidates = _find_candidates(root, expected_title)
        if candidates:
            candidates.sort(key=lambda item: (item[0], item[1]), reverse=True)
            best = candidates[0]
            tied = [item for item in candidates if item[0] == best[0]]
            if len(tied) > 1 and best[0] == 0:
                raise DownloadAmbiguous(", ".join(str(item[2]) for item in tied[:5]))
            if _is_stable(best[2], min(poll_interval, 1)):
                return best[2]
            last_candidates = candidates

        if time.time() >= deadline:
            if last_candidates:
                raise DownloadTimeout("候选文件未稳定：" + ", ".join(str(item[2]) for item in last_candidates[:5]))
            raise DownloadTimeout("未发现下载后新增或更新的文件")
        if poll_interval:
            time.sleep(poll_interval)


def _snapshot_to_json(snapshot: dict[str, FileState]) -> str:
    return json.dumps({name: asdict(state) for name, state in snapshot.items()}, ensure_ascii=False)


def _snapshot_from_json(value: str) -> dict[str, FileState]:
    raw = json.loads(value)
    return {name: FileState(size=int(state["size"]), mtime=float(state["mtime"])) for name, state in raw.items()}


def main() -> None:
    parser = argparse.ArgumentParser(description="定位浏览器点击下载后的本地文件")
    sub = parser.add_subparsers(dest="command", required=True)

    wait = sub.add_parser("wait", help="等待并输出下载完成文件")
    wait.add_argument("--download-dir", default=str(default_download_dir()))
    wait.add_argument("--expected-title", required=True)
    wait.add_argument("--timeout", type=float, default=60)

    args = parser.parse_args()

    try:
        path = find_downloaded_file(args.download_dir, args.expected_title, timeout_seconds=args.timeout)
    except PermissionError as exc:
        print(f"DOWNLOAD_DIR_PERMISSION_DENIED={exc}", file=sys.stderr)
        sys.exit(4)
    except DownloadAmbiguous as exc:
        print(f"DOWNLOAD_AMBIGUOUS={exc}", file=sys.stderr)
        sys.exit(3)
    except DownloadTimeout as exc:
        print(f"DOWNLOAD_TIMEOUT={exc}", file=sys.stderr)
        sys.exit(2)
    print(f"DOWNLOAD_FILE={path}")


if __name__ == "__main__":
    main()
