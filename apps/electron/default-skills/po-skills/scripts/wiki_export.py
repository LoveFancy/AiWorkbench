#!/usr/bin/env python3
"""Wiki 批量导出 wrapper：调用 confluence-markdown-exporter 并输出稳定结果。"""

from __future__ import annotations

import argparse
import json
import locale
import os
import re
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv
from wiki_network import build_confluence_env


MODE_COMMANDS = {
    "pages": "pages",
    "tree": "pages-with-descendants",
    "space": "spaces",
}
BASE_CONFIG_PATH = Path(__file__).resolve().parents[1] / "config" / "cme.base.json"
SKILL_DIR = Path(__file__).resolve().parents[1]


class WikiExportError(Exception):
    """用户可读的 Wiki 导出错误。"""


@dataclass
class ExportResult:
    output_dir: str
    index_file: str
    mode: str


def default_output_dir(now: datetime | None = None) -> str:
    current = now or datetime.now()
    return f"./tmp-wiki-export-{current.strftime('%Y%m%d-%H%M%S')}"


def _load_env_file(path: Path) -> bool:
    if not path.is_file():
        return False
    load_dotenv(path, override=False)
    return True


def _project_env_paths() -> list[Path]:
    paths = [Path.cwd() / ".env"]
    claude_project_dir = os.environ.get("CLAUDE_PROJECT_DIR", "").strip()
    if claude_project_dir:
        paths.append(Path(claude_project_dir) / ".env")
    paths.append(SKILL_DIR / ".env")
    return paths


def load_runtime_token() -> str:
    loaded_paths = [str(path) for path in _project_env_paths() if _load_env_file(path)]
    if not os.environ.get("HTSC_WIKI_TOKEN") and os.environ.get("CONFLUENCE_TOKEN"):
        os.environ["HTSC_WIKI_TOKEN"] = os.environ["CONFLUENCE_TOKEN"]
    token = os.environ.get("HTSC_WIKI_TOKEN", "")
    _log(
        "env files loaded="
        + (", ".join(loaded_paths) if loaded_paths else "none")
        + f" token_configured={bool(token)}"
    )
    return token


def _load_base_config() -> dict:
    if not BASE_CONFIG_PATH.is_file():
        return {"auth": {"confluence": {}}}
    with BASE_CONFIG_PATH.open(encoding="utf-8") as f:
        return json.load(f)


def _make_config(token: str, base_url: str, config_dir: str) -> str:
    path = Path(config_dir) / "config.json"
    config = _load_base_config()
    config.setdefault("auth", {}).setdefault("confluence", {})[base_url] = {"pat": token}
    path.write_text(json.dumps(config, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return str(path)


def _decode_output(data: bytes) -> str:
    for encoding in ("utf-8", locale.getpreferredencoding(False), "gb18030", "cp936"):
        if not encoding:
            continue
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            continue
    return data.decode("utf-8", errors="replace")


def _summarize_cme_error(stderr: str, stdout: str) -> str:
    text = (stderr or stdout).strip()
    if not text:
        return "无错误输出"
    text = re.sub(r"\s+", " ", text)
    return text[:1000]


def _log(message: str) -> None:
    print(f"[wiki-export] {message}", file=sys.stderr)


def _collect_files(output_dir: str) -> tuple[list[Path], list[Path], list[Path]]:
    root = Path(output_dir)
    markdown_files = sorted(
        path for path in root.rglob("*.md")
        if path.name != "[WIKI_EXPORT_INDEX]导出索引.md"
    )
    attachment_dirs = sorted(
        path for path in root.rglob("attachments")
        if path.is_dir()
    )
    attachments: list[Path] = []
    for directory in attachment_dirs:
        attachments.extend(path for path in directory.rglob("*") if path.is_file())
    return markdown_files, sorted(attachments), attachment_dirs


def _rel(path: Path, root: Path) -> str:
    try:
        return path.relative_to(root).as_posix()
    except ValueError:
        return path.as_posix()


def write_index(
    output_dir: str,
    mode: str,
    urls: list[str],
    statuses: list[dict[str, str]],
) -> str:
    root = Path(output_dir)
    root.mkdir(parents=True, exist_ok=True)
    markdown_files, attachments, attachment_dirs = _collect_files(output_dir)
    index_path = root / "[WIKI_EXPORT_INDEX]导出索引.md"

    lines = [
        "# Wiki 导出索引",
        "",
        f"- 导出时间：{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        f"- 导出模式：{mode}",
        f"- 输出目录：{output_dir}",
        f"- 导出的 Markdown 文件数量：{len(markdown_files)}",
        f"- 导出的附件文件数量：{len(attachments)}",
        "",
        "## 输入 URL",
        "",
    ]
    lines.extend(f"- {url}" for url in urls)
    lines.extend(["", "## 执行状态", ""])
    lines.extend(f"- {item['status']}: {item['url']}" for item in statuses)
    lines.extend(["", "## 附件目录", ""])
    if attachment_dirs:
        lines.extend(f"- {_rel(path, root)}" for path in attachment_dirs)
    else:
        lines.append("- 无")
    lines.extend(["", "## Markdown 文件", ""])
    if markdown_files:
        lines.extend(f"- {_rel(path, root)}" for path in markdown_files)
    else:
        lines.append("- 无")
    lines.append("")

    index_path.write_text("\n".join(lines), encoding="utf-8")
    return str(index_path)


def run_export(
    urls: list[str],
    mode: str,
    output_dir: str,
    token: str | None,
    *,
    runner=subprocess.run,
    executable_finder=shutil.which,
    base_url: str = "http://wiki.htzq.htsc.com.cn",
) -> ExportResult:
    _log(
        f"start mode={mode} url_count={len(urls)} output_dir={output_dir} base_url={base_url}"
    )
    if not urls:
        raise WikiExportError("URL 缺失：请提供 Wiki 页面或 Space URL")
    if mode not in MODE_COMMANDS:
        raise WikiExportError("mode 不合法：只能是 pages/tree/space")
    if not token:
        raise WikiExportError("未配置 HTSC_WIKI_TOKEN：请配置 Wiki Personal Access Token")
    _log("token status=configured")

    executable = executable_finder("cme")
    if not executable:
        raise WikiExportError("未安装 confluence-markdown-exporter：请先安装依赖并确认 cme 可执行")
    _log(f"cme executable={executable}")

    Path(output_dir).mkdir(parents=True, exist_ok=True)
    _log(f"ensured output dir={output_dir}")

    statuses: list[dict[str, str]] = []
    with tempfile.TemporaryDirectory(prefix="wiki-export-cme-") as config_dir:
        config_path = _make_config(token, base_url, config_dir)
        _log(f"config path={config_path}")
        env = build_confluence_env(base_url)
        env.update(
            {
                "CME_CONFIG_PATH": config_path,
                "CME_EXPORT__OUTPUT_PATH": output_dir,
                "CME_EXPORT__ATTACHMENT_HREF": "relative",
                "CME_EXPORT__ATTACHMENT_EXPORT_ALL": "false",
                "PYTHONIOENCODING": "utf-8",
                "PYTHONUTF8": "1",
            }
        )
        command = [executable, MODE_COMMANDS[mode], *urls]
        _log(f"command={' '.join(command)}")
        completed = runner(
            command,
            env=env,
            capture_output=True,
        )
        _log(f"cme return code={completed.returncode}")
        if completed.returncode != 0:
            stderr = _decode_output(completed.stderr or b"")
            stdout = _decode_output(completed.stdout or b"")
            summary = _summarize_cme_error(stderr, stdout)
            _log(f"cme error summary={summary}")
            raise WikiExportError(f"cme 执行失败：{summary}")
        statuses = [{"url": url, "status": "success"} for url in urls]

    index_file = write_index(output_dir, mode, urls, statuses)
    _log(f"index file={index_file}")
    return ExportResult(output_dir=output_dir, index_file=index_file, mode=mode)


def main() -> None:
    parser = argparse.ArgumentParser(description="批量导出 Confluence Wiki Markdown")
    parser.add_argument("--mode", required=True, choices=sorted(MODE_COMMANDS), help="导出模式：pages/tree/space")
    parser.add_argument("--output-dir", default=None, help="输出目录；未指定时生成 ./tmp-wiki-export-<timestamp>")
    parser.add_argument("--base-url", default="http://wiki.htzq.htsc.com.cn", help="Confluence base URL")
    parser.add_argument("urls", nargs="+", help="一个或多个 Wiki URL")
    args = parser.parse_args()

    output_dir = args.output_dir or default_output_dir()
    try:
        result = run_export(
            urls=args.urls,
            mode=args.mode,
            output_dir=output_dir,
            token=load_runtime_token(),
            base_url=args.base_url,
        )
    except WikiExportError as exc:
        print(f"错误：{exc}", file=sys.stderr)
        sys.exit(1)

    print(f"OUTPUT_DIR={result.output_dir}")
    print(f"INDEX_FILE={result.index_file}")
    print(f"MODE={result.mode}")


if __name__ == "__main__":
    main()
