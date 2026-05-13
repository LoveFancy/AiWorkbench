#!/usr/bin/env python3
"""
po-skills 本地执行入口

位置：${CLAUDE_PLUGIN_ROOT}/skills/po-skills/run.py（与 SKILL.md 同目录）
执行方式（始终从项目根目录执行，不需要 cd）：
  python3 ${CLAUDE_PLUGIN_ROOT}/skills/po-skills/run.py <命令> [参数]
  python3 ${CLAUDE_PLUGIN_ROOT}/skills/po-skills/run.py <命令> --help

十步以内工作流核心脚本：
  doc-convert      Wiki/JSON → 干净 Markdown（[PROD_ORI] 前缀）+ 图片分析

独立工具（可选）：
  doc-to-md     将本地文档（doc/docx/pdf）转换为 Markdown
  wiki-export   批量导出 Wiki 页面 / 页面树 / Space
  story-create  [STORY_PLAN] → DPMP 批量创建 Story，并将真实 ID 回写所有文件
  quick-story   直接从自然语言描述创建单条 DPMP Story
  fetch-title   获取 Confluence 页面标题

示例：
  python3 ${CLAUDE_PLUGIN_ROOT}/skills/po-skills/run.py doc-convert --url "http://wiki.../pageId=123456" --output-dir ./TAILOR-124/1.产品设计
  python3 ${CLAUDE_PLUGIN_ROOT}/skills/po-skills/run.py doc-to-md --file ./data/spec.pdf
  python3 ${CLAUDE_PLUGIN_ROOT}/skills/po-skills/run.py wiki-export --mode pages "http://wiki.../pageId=123456"
  python3 ${CLAUDE_PLUGIN_ROOT}/skills/po-skills/run.py story-create --story-plan "./TAILOR-124/1.产品设计/[STORY_PLAN]xxx.csv"
"""

import sys
import os
import re
import uuid
import io
from contextlib import redirect_stdout


def _configure_stdio() -> None:
    """在 Windows/VSCode 终端下尽量稳定 stdout/stderr 的 UTF-8 输出。"""
    for stream_name in ("stdout", "stderr"):
        stream = getattr(sys, stream_name, None)
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")


_configure_stdio()


# 自动加载 .env 文件（po-skills 目录下的 .env）
def _load_env_file(path: str) -> None:
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, _, val = line.partition("=")
                    os.environ.setdefault(key.strip(), val.strip())

_SKILL_DIR = os.path.dirname(os.path.abspath(__file__))


def _find_project_root() -> str:
    """确定项目根目录。

    优先级：CLAUDE_PROJECT_DIR > CWD（含 .git）> skill 目录向上查找 .git > skill 目录。
    注意：.env 加载会额外优先读取当前工作目录，即使 CWD 不是 git 仓库。
    """
    # 1) CLAUDE_PROJECT_DIR：Claude Code 部分版本在 Bash 中注入此变量
    cc_project = os.environ.get("CLAUDE_PROJECT_DIR", "").strip()
    if cc_project and os.path.isdir(cc_project):
        return cc_project

    # 2) 当前工作目录：Claude Code 运行 Bash 时 CWD 通常为项目根
    cwd = os.getcwd()
    if os.path.isdir(os.path.join(cwd, ".git")):
        return cwd

    # 3) 从 skill 目录向上查找 .git
    cur = os.path.abspath(_SKILL_DIR)
    while True:
        if os.path.isdir(os.path.join(cur, ".git")):
            return cur
        parent = os.path.dirname(cur)
        if parent == cur:
            break
        cur = parent

    # 4) 回退到 skill 目录
    return _SKILL_DIR


# .env 加载顺序：项目根目录优先，skill 目录作为兜底
_project_root = _find_project_root()
_load_env_file(os.path.join(os.getcwd(), ".env"))
_load_env_file(os.path.join(_project_root, ".env"))
_load_env_file(os.path.join(_SKILL_DIR, ".env"))


def _normalize_confluence_env() -> None:
    """兼容通用 Confluence .env 命名，内部仍统一读取 HTSC_WIKI_TOKEN。"""
    if not os.environ.get("HTSC_WIKI_TOKEN") and os.environ.get("CONFLUENCE_TOKEN"):
        os.environ["HTSC_WIKI_TOKEN"] = os.environ["CONFLUENCE_TOKEN"]


_normalize_confluence_env()

# 将 scripts/ 目录加入 sys.path
SCRIPTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "scripts")
REFS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "references")
sys.path.insert(0, SCRIPTS_DIR)


def _read_ref(filename: str) -> str:
    path = os.path.join(REFS_DIR, filename)
    with open(path, encoding="utf-8") as f:
        return f.read()



def _derive_doc_convert_output_dir(opts, dc) -> str:
    """为 doc-convert 推导默认输出目录。"""
    if opts.output_dir:
        return opts.output_dir

    if opts.file:
        req_name = os.path.splitext(os.path.basename(opts.file))[0]
    else:
        try:
            page_id = dc.extract_page_id(opts.url)
            req_name = f"REQ-{page_id}"
        except Exception:
            req_name = f"REQ-{uuid.uuid4().hex[:8]}"

    return os.path.join(req_name, "1.产品设计")


def _emit_enhance_marker(enabled: bool, output_file: str) -> None:
    if enabled and output_file:
        print("ENHANCE_CONTENT=true")
        print(f"ENHANCE_INPUT={output_file}")


def _run_and_capture_output(main_func) -> str:
    stream = io.StringIO()
    with redirect_stdout(stream):
        main_func()
    output = stream.getvalue()
    print(output, end="")
    match = re.search(r"^OUTPUT_FILE=(.+)$", output, re.MULTILINE)
    return match.group(1).strip() if match else ""


# ---------------------------------------------------------------------------
# 步骤一：doc-convert
# ---------------------------------------------------------------------------

def cmd_doc_convert(args):
    """步骤一：Wiki/JSON → 干净 Markdown（[NL] 前缀）"""
    import argparse
    import doc_convert as dc

    parser = argparse.ArgumentParser(
        prog="run.py doc-convert",
        description="步骤一：将 Confluence 页面或本地 JSON 转换为干净的 Markdown 文件",
    )
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--url", help="Confluence 页面 URL 或纯数字 page_id（需要 HTSC_WIKI_TOKEN）")
    group.add_argument("--file", help="本地 JSON 文件路径（Confluence API 响应格式，无需 Token）")
    parser.add_argument("--output-dir", default=None,
                        help="输出目录（默认自动创建 <需求名>/1.产品设计/ 目录结构）")
    parser.add_argument(
        "--enhance-content",
        action="store_true",
        help="转换完成后由 skill 继续执行 enhance-content",
    )
    opts = parser.parse_args(args)

    output_dir = _derive_doc_convert_output_dir(opts, dc)

    # 创建完整目录结构（只创建 1.产品设计/，不再创建 5.STORYS/）
    os.makedirs(output_dir, exist_ok=True)
    print(f"输出目录：{output_dir}")

    argv = ["doc_convert.py", "--output-dir", output_dir]
    if opts.file:
        argv += ["--file", opts.file]
    else:
        argv += ["--url", opts.url]

    sys.argv = argv
    output_file = _run_and_capture_output(dc.main)
    _emit_enhance_marker(opts.enhance_content, output_file)


def cmd_doc_to_md(args):
    """工具：本地文档 → 干净 Markdown（[PROD_ORI] 前缀）"""
    import argparse
    import doc_to_md as dtm

    parser = argparse.ArgumentParser(
        prog="run.py doc-to-md",
        description="工具：将本地文档转换为干净的 Markdown 文件",
    )
    parser.add_argument("--file", required=True, help="本地文档路径，如 doc/docx/pdf")
    parser.add_argument(
        "--output-dir",
        default=None,
        help="输出目录（默认自动创建 <文档名>/1.产品设计/ 目录结构）",
    )
    parser.add_argument(
        "--enhance-content",
        action="store_true",
        help="转换完成后由 skill 继续执行 enhance-content",
    )
    opts = parser.parse_args(args)

    if opts.output_dir:
        output_dir = opts.output_dir
    else:
        doc_name = os.path.splitext(os.path.basename(opts.file))[0]
        output_dir = os.path.join(doc_name, "1.产品设计")

    os.makedirs(output_dir, exist_ok=True)
    print(f"输出目录：{output_dir}")

    sys.argv = ["doc_to_md.py", "--output-dir", output_dir, "--file", opts.file]
    output_file = _run_and_capture_output(dtm.main)
    _emit_enhance_marker(opts.enhance_content, output_file)


def cmd_wiki_export(args):
    """工具：批量导出 Wiki Markdown 知识库。"""
    import wiki_export as we

    def is_url(value: str) -> bool:
        return bool(re.match(r"^https?://", value, re.IGNORECASE))

    def infer_mode(text: str) -> str:
        if re.search(r"(整个\s*Space|全部空间|整个空间|space)", text, re.IGNORECASE):
            return "space"
        if re.search(r"(子页面|页面树|目录树|下级页面|所有内容|下载所有内容|tree)", text, re.IGNORECASE):
            return "tree"
        return "pages"

    mode = None
    output_dir = None
    base_url = None
    urls = []
    hints = []
    i = 0
    while i < len(args):
        value = args[i]
        if value == "--mode" and i + 1 < len(args):
            mode = args[i + 1]
            i += 2
            continue
        if value == "--output-dir" and i + 1 < len(args):
            output_dir = args[i + 1]
            i += 2
            continue
        if value == "--base-url" and i + 1 < len(args):
            base_url = args[i + 1]
            i += 2
            continue
        if is_url(value):
            urls.append(value)
        else:
            hints.append(value)
        i += 1

    normalized = ["wiki_export.py", "--mode", mode or infer_mode(" ".join(hints))]
    if output_dir:
        normalized += ["--output-dir", output_dir]
    if base_url:
        normalized += ["--base-url", base_url]
    normalized += urls

    sys.argv = normalized
    we.main()


def cmd_enhance_content(args):
    """步骤二：按 AI 输出的 --rename/--keep 参数或映射文件执行图片重命名并生成过程记录。"""
    import argparse
    import content_enhancer as ce

    parser = argparse.ArgumentParser(
        prog="run.py enhance-content",
        description="步骤二：按映射文件执行图片重命名并生成过程记录",
    )
    parser.add_argument("--input", required=True, help="[PROD_ORI] Markdown 文件路径")
    parser.add_argument(
        "--rename",
        nargs=2,
        metavar=("OLD", "NEW"),
        action="append",
        default=[],
        help="重命名条目（可重复）：--rename 旧路径 新路径",
    )
    parser.add_argument(
        "--keep",
        metavar="PATH",
        action="append",
        default=[],
        help="保留原名（可重复）：--keep 路径",
    )
    opts = parser.parse_args(args)

    # 构造透传给 content_enhancer 的 argv
    ce_argv = ["content_enhancer.py", "--input", opts.input]
    for old, new in opts.rename:
        ce_argv += ["--rename", old, new]
    for path in opts.keep:
        ce_argv += ["--keep", path]

    sys.argv = ce_argv
    ce.main()


# ---------------------------------------------------------------------------
# 工具命令：fetch-title
# ---------------------------------------------------------------------------

def cmd_fetch_title(args):
    """工具：从 Confluence URL 或 page_id 获取页面标题"""
    import argparse
    from doc_convert import extract_page_id, _fetch_page_title

    parser = argparse.ArgumentParser(
        prog="run.py fetch-title",
        description="从 Confluence URL 或 page_id 获取页面标题",
    )
    parser.add_argument("--url", required=True, help="Confluence 页面 URL 或纯数字 page_id")
    opts = parser.parse_args(args)

    token = os.environ.get("HTSC_WIKI_TOKEN")
    if not token:
        print("环境变量 HTSC_WIKI_TOKEN 未设置", file=sys.stderr)
        sys.exit(1)

    try:
        page_id = extract_page_id(opts.url)
    except ValueError as e:
        print(str(e), file=sys.stderr)
        sys.exit(1)

    title = _fetch_page_title(token, page_id)
    sys.stdout.reconfigure(encoding="utf-8")
    print(f"PAGE_TITLE={title}")


# ---------------------------------------------------------------------------
# 工具命令：init-story
# ---------------------------------------------------------------------------

def cmd_init_story(args):
    """工具：从 PRD 文件读取 Story 列表，一次性创建所有目录结构"""
    import argparse
    import re

    parser = argparse.ArgumentParser(
        prog="run.py init-story",
        description="从 PRD 文件读取 Story 列表，创建 5.STORYS 目录结构",
    )
    parser.add_argument("--prd", required=True, help="[PRD] 文件路径")
    parser.add_argument(
        "--prefix", default="",
        help="Story ID 前缀，如 TAILOR-124（默认从 PRD 文件名推断）"
    )
    opts = parser.parse_args(args)

    prd_path = os.path.abspath(opts.prd)
    if not os.path.exists(prd_path):
        print(f"错误：文件不存在：{prd_path}", file=sys.stderr)
        sys.exit(1)

    # 推断需求根目录（1.产品设计 的上级）
    design_dir = os.path.dirname(prd_path)
    req_root = os.path.dirname(design_dir)

    # 推断 Story ID 前缀
    prefix = opts.prefix
    if not prefix:
        basename = os.path.basename(prd_path)
        # 尝试从文件名提取，如 [PRD]TAILOR-124-xxx.md → TAILOR-124
        m = re.search(r'([A-Z]+-\d+)', basename)
        prefix = m.group(1) if m else "STORY"

    # 从 PRD 中提取 Story 列表（匹配 ## 2.x 标题）
    with open(prd_path, encoding="utf-8") as f:
        content = f.read()

    story_pattern = re.compile(r'^#{3,4}\s+2\.(\d+)\s+(.+?)(?:\s*<!--.*?-->)?\s*$', re.MULTILINE)
    stories = story_pattern.findall(content)

    if not stories:
        print("未找到 Story（未匹配到 2.x 章节标题），请检查 PRD 格式", file=sys.stderr)
        sys.exit(1)

    sys.stdout.reconfigure(encoding="utf-8")

    storys_root = os.path.join(req_root, "5.STORYS")
    subdirs = ["images"]

    created = []
    for idx, (num, title) in enumerate(stories, 1):
        # 清理标题中的非法文件名字符
        safe_title = re.sub(r'[\\/:*?"<>|]', '', title.strip())
        story_id = f"{prefix}-{idx:02d}"
        story_dir = os.path.join(storys_root, f"{story_id}-{safe_title}")
        for sub in subdirs:
            full = os.path.join(story_dir, sub)
            os.makedirs(full, exist_ok=True)
        created.append(f"  {story_id}：{safe_title}")
        print(f"CREATED={story_dir}")

    print(f"\n✅ 已创建 {len(created)} 个 Story 目录：")
    for line in created:
        print(line)
    print(f"\n根目录：{storys_root}")


# ---------------------------------------------------------------------------
# 步骤四（可选）：story-create（DPMP 批量创建 Story）+ 回写工具函数
# ---------------------------------------------------------------------------


def _backfill_story_ids(story_plan_path: str) -> dict:
    """story-create 完成后，将 story_key（S-01）替换为真实    此函数由 `cmd_story_create` 在自动化成功后调用。
    回写范围：
    1. [PROD_ORI].md   — 替换末尾附录中 story_key 列的值
    2. [PROD_FORMAT].md — 替换正文中的 <!-- STORY_KEY: S-XX --> 以及各级标题中的 S-XX
    3. [STORY_FORMAT].md— 重命名文件 [STORY_FORMAT][S-XX]... -> [STORY_FORMAT][真实ID]...
    """
    stats = {
        "process": 0,  # now refers to PROD_ORI
        "format": 0,
        "story": 0,
        "warnings": []
    }
    import csv as _csv
    import re as _re
    from pathlib import Path

    plan_dir = os.path.dirname(os.path.abspath(story_plan_path))
    id_map: dict[str, str] = {}
    with open(story_plan_path, encoding="utf-8-sig", newline="") as f:
        reader = _csv.DictReader(f)
        for row in reader:
            skey = (row.get("story_key") or "").strip()
            sid  = (row.get("story_id")  or "").strip()
            if skey and sid and sid != skey:
                id_map[skey] = sid

    if not id_map:
        return {"status": "no_real_id"}

    def _list_files(prefix: str) -> list[Path]:
        return [
            Path(plan_dir) / name
            for name in sorted(os.listdir(plan_dir))
            if name.startswith(prefix) and name.endswith(".md")
        ]

    # ── 1. 回写 [PROD_ORI].md (末尾的附录表格) ──────────────────────────────────
    for proc_file in _list_files("[PROD_ORI]"):
        content = proc_file.read_text(encoding="utf-8")
        new_content = content
        for s_key, true_id in id_map.items():
            pattern = _re.compile(rf"\b{_re.escape(s_key)}\b")
            new_content = pattern.sub(str(true_id), new_content)
        
        if new_content != content:
            proc_file.write_text(new_content, encoding="utf-8")
            stats["process"] += 1

    # ── 2. 回写 [PROD_FORMAT].md ─────────────────────────────────────────────
    for prd_file in _list_files("[PROD_FORMAT]"):
        original = prd_file.read_text(encoding="utf-8")
        updated = original
        for old, new in id_map.items():
            updated = _re.sub(rf'(?<!\w){_re.escape(old)}(?!\w)', new, updated)
        if updated != original:
            prd_file.write_text(updated, encoding="utf-8")
            stats["format"] += 1

    # ── 3. 重命名 [STORY_FORMAT][S-xx]*.md ───────────────────────────────────
    for story_file in _list_files("[STORY_FORMAT]"):
        basename = story_file.name
        new_basename = basename
        for old, new in id_map.items():
            new_basename = new_basename.replace(f"[{old}]", f"[{new}]")
        if new_basename != basename:
            story_file.rename(story_file.parent / new_basename)
            stats["story"] += 1

    # ── 4. 回写后检查：是否有遗留的 S-xx 未被替换 ─────────────────────────────────
    unreplaced_pattern = _re.compile(r'\bS-\d{2,}\b')
    for f_path in _list_files("[PROD_ORI]") + _list_files("[PROD_FORMAT]"):
        content = f_path.read_text(encoding="utf-8")
        leftovers = set(unreplaced_pattern.findall(content))
        # 排除可能真的是以 S-xx 命名的真实数据（极少情况），只要匹配出来就提醒
        if leftovers:
            stats["warnings"].append(f"文件 {f_path.name} 中疑似有未替换的 Story Key: {', '.join(leftovers)}")

    return stats



def cmd_story_create(args):
    """步骤四：从 [STORY_PLAN].csv 批量创建 DPMP Story"""
    import argparse

    # 将 dpmp 模块目录加入 sys.path
    dpmp_dir = os.path.join(SCRIPTS_DIR, "dpmp")
    if dpmp_dir not in sys.path:
        sys.path.insert(0, SCRIPTS_DIR)

    from dpmp.config import DPMPConfig
    from dpmp.automation import StoryAutomation

    parser = argparse.ArgumentParser(
        prog="run.py story-create",
        description="步骤四：从 [STORY_PLAN].csv 批量创建 DPMP Story。所有配置默认从 .env 文件读取，CLI 参数可覆盖。",
    )
    parser.add_argument("--story-plan", required=True, help="[STORY_PLAN].csv 文件路径")
    parser.add_argument("--cookie", default=None, help="覆盖 .env 中的 DPMP_COOKIE")
    parser.add_argument("--project-id", type=int, default=None, help="覆盖 .env 中的 DPMP_PROJECT_ID")
    parser.add_argument("--task-type-id", type=int, default=None, help="覆盖 .env 中的 DPMP_TASK_TYPE_ID")
    parser.add_argument("--base-url", default=None, help="覆盖 .env 中的 DPMP_BASE_URL")
    parser.add_argument("--delay", type=int, default=None, help="覆盖 .env 中的 DPMP_REQUEST_DELAY")
    parser.add_argument("--mock", action="store_true",
                        help="跳过真实 DPMP 创建，生成虚拟 story_id（格式 MOCK-001）用于测试流程")
    opts = parser.parse_args(args)

    # 所有配置：CLI 参数 > 环境变量（.env 已在启动时自动加载）> 默认值
    cookie = opts.cookie or os.environ.get("DPMP_COOKIE", "")
    project_id = opts.project_id or int(os.environ.get("DPMP_PROJECT_ID", "2232"))
    task_type_id = opts.task_type_id or int(os.environ.get("DPMP_TASK_TYPE_ID", "13"))
    base_url = opts.base_url or os.environ.get("DPMP_BASE_URL", "http://pt.htsc/paas/dc/api")
    delay = opts.delay if opts.delay is not None else int(os.environ.get("DPMP_REQUEST_DELAY", "3"))

    # 调试：打印读取到的配置
    print(f"[DEBUG] .env 路径: {os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env')}")
    print(f"[DEBUG] DPMP_COOKIE: length={len(cookie)}, starts='{cookie[:50]}...'")
    print(f"[DEBUG] DPMP_PROJECT_ID: {project_id}")
    print(f"[DEBUG] DPMP_TASK_TYPE_ID: {task_type_id}")
    print(f"[DEBUG] DPMP_BASE_URL: {base_url}")
    print(f"[DEBUG] DPMP_REQUEST_DELAY: {delay}")

    if not cookie:
        print("错误：未提供 Cookie。请在 .env 文件中设置 DPMP_COOKIE 或通过 --cookie 参数传入。", file=sys.stderr)
        sys.exit(1)

    config = DPMPConfig(
        cookie=cookie,
        project_id=project_id,
        task_type_id=task_type_id,
        base_url=base_url,
        request_delay=delay,
    )

    if opts.mock:
        print("[MOCK] 跳过真实 DPMP 创建，将生成虚拟 story_id（格式 MOCK-001）")
        automation = StoryAutomation(config)
        automation.run_mock(opts.story_plan)
    else:
        config.validate()
        automation = StoryAutomation(config)
        automation.run(opts.story_plan)

    # ── 回写真实 story_id 到 [PROD_ORI] / [PROD_FORMAT] / [STORY_FORMAT] ──────
    print("\n[backfill] 开始回写 story_id 到文档...")
    bf = _backfill_story_ids(opts.story_plan)
    if bf.get("status") == "no_real_id":
        print("[backfill] ⚠️  STORY_PLAN 中无有效 story_id，跳过回写（所有 Story 可能未成功创建）")
    else:
        print(f"[backfill] ✅ 回写完成：")
        print(f"  - [PROD_ORI].md 更新：{bf['process']} 个")
        print(f"  - [PROD_FORMAT].md 更新：{bf['format']} 个")
        print(f"  - [STORY_FORMAT] 文件重命名：{bf['story']} 个")
        
        if bf.get("warnings"):
            print("\n[backfill] ⚠️ 警告：检测到可能有未完全替换的占位符：")
            for w in bf["warnings"]:
                print(f"  - {w}")
            print("  请检查是否由于个别 Story 未成功创建或在 CSV 中被删减导致。")


def cmd_quick_story(args):
    """工具：从自然语言参数直接创建单条 DPMP Story，无需 [STORY_PLAN].csv"""
    import argparse
    import quick_story as qs

    # 直接透传参数给 quick_story.main()
    sys.argv = ["quick_story.py"] + args
    qs.main()


# ---------------------------------------------------------------------------
# 命令注册 & 入口
# ---------------------------------------------------------------------------

COMMANDS = {
    "doc-convert":  (cmd_doc_convert,  "步骤一：Wiki/JSON → 干净 Markdown [NL]"),
    "doc-to-md":    (cmd_doc_to_md,    "工具：本地文档 → 干净 Markdown [PROD_ORI]"),
    "wiki-export":  (cmd_wiki_export,  "工具：批量导出 Wiki Markdown 知识库"),
    "enhance-content": (cmd_enhance_content, "步骤二：图片重命名并生成过程记录"),
    "story-create": (cmd_story_create, "步骤四：[Story规划] → DPMP 批量创建 Story"),
    "quick-story":  (cmd_quick_story,  "工具：从自然语言直接创建单条 DPMP Story"),
    "fetch-title":  (cmd_fetch_title,  "工具：获取 Confluence 页面标题"),
    "init-story":   (cmd_init_story,   "工具：从 PRD 创建 5.STORYS 目录结构"),
}


def main():
    if len(sys.argv) < 2 or sys.argv[1] in ("-h", "--help"):
        print(__doc__)
        print("命令列表：")
        for name, (_, desc) in COMMANDS.items():
            print(f"  {name:<16} {desc}")
        sys.exit(0)

    cmd = sys.argv[1]
    if cmd not in COMMANDS:
        print(f"未知命令：{cmd!r}")
        print(f"可用命令：{', '.join(COMMANDS)}")
        sys.exit(1)

    COMMANDS[cmd][0](sys.argv[2:])


if __name__ == "__main__":
    main()
