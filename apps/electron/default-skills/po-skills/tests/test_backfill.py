"""
tests/test_backfill.py

测试 run._backfill_story_ids() 的各种替换逻辑：
  - [PROD_ORI].md 附录内容替换
  - [PROD_FORMAT].md 仅附录分析表中的 story_key 替换
  - [STORY_FORMAT][S-xx] 文件重命名
  - 边界条件：空 story_id、仅部分替换
"""

import csv
import os
import sys

ROOT_DIR = os.path.join(os.path.dirname(__file__), "..")
sys.path.insert(0, os.path.abspath(ROOT_DIR))

from run import _backfill_story_ids


# ── 辅助函数 ─────────────────────────────────────────────────────────────────

def _write_story_plan(tmp_path, rows: list[dict]) -> str:
    """写入 [STORY_PLAN].csv，返回路径字符串。"""
    path = tmp_path / "[STORY_PLAN]需求.csv"
    fieldnames = ["story_key", "story_id", "story名称", "所属需求编号"]
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    return str(path)


# ── [PROD_ORI].md ─────────────────────────────────────────────────────────────

def test_prod_ori_md_story_key_replaced(tmp_path):
    """[PROD_ORI].md 表格中的 S-01 应被替换为真实 story_id。"""
    plan = _write_story_plan(tmp_path, [
        {"story_key": "S-01", "story_id": "TAILOR-124-3456",
         "story名称": "客户全景视图", "所属需求编号": "TAILOR-124"},
    ])
    proc = tmp_path / "[PROD_ORI]需求.md"
    proc.write_text(
        "## 附录：Story 结构分析\n\n"
        "| story_key | feature_key | muc_key | Story |\n"
        "|-----------|-------------|---------|-------|\n"
        "| S-01 | F-01 | MUC-01 | Story 1：客户全景视图 |\n"
        "| S-01 | F-01 | MUC-02 |  |\n",
        encoding="utf-8",
    )

    stats = _backfill_story_ids(plan)

    content = proc.read_text(encoding="utf-8")
    assert "TAILOR-124-3456" in content
    assert "| S-01 |" not in content
    assert stats["process"] == 1


def test_prod_ori_md_compact_story_column_replaced(tmp_path):
    """新版合并列中 Story 列开头的 S-01 应被替换为真实 story_id。"""
    plan = _write_story_plan(tmp_path, [
        {"story_key": "S-01", "story_id": "TAILOR-124-3456",
         "story名称": "客户全景视图", "所属需求编号": "TAILOR-124"},
    ])
    proc = tmp_path / "[PROD_ORI]需求.md"
    proc.write_text(
        "## 附录：Story-Feature-MUC 结构分析\n\n"
        "| Story | Feature | MUC | 类型识别 | 变更类型 | 端侧 | 影响说明 |\n"
        "|-------|---------|-----|----------|----------|------|----------|\n"
        "| S-01 客户全景视图 | F-01 交易数据捕获 | MUC-01 Calypso文件接收 | 数据 | 新增 | PC | 影响说明 |\n"
        "| S-01 客户全景视图 | F-01 交易数据捕获 | MUC-02 部门筛选 | 数据 | 新增 | PC | 影响说明 |\n",
        encoding="utf-8",
    )

    stats = _backfill_story_ids(plan)

    content = proc.read_text(encoding="utf-8")
    assert "TAILOR-124-3456 客户全景视图" in content
    assert "| S-01 客户全景视图 |" not in content
    assert stats["process"] == 1


def test_prod_ori_md_multiple_stories_replaced(tmp_path):
    """[PROD_ORI].md 里多个 story_key 都应被替换。"""
    plan = _write_story_plan(tmp_path, [
        {"story_key": "S-01", "story_id": "DPMP-101",
         "story名称": "Story1", "所属需求编号": "REQ-1"},
        {"story_key": "S-02", "story_id": "DPMP-102",
         "story名称": "Story2", "所属需求编号": "REQ-1"},
    ])
    proc = tmp_path / "[PROD_ORI]需求.md"
    proc.write_text(
        "## 附录：Story 结构分析\n\n"
        "| story_key | feature_key | muc_key | Story |\n"
        "|-----------|-------------|---------|-------|\n"
        "| S-01 | F-01 | MUC-01 | Story 1 |\n"
        "| S-02 | F-02 | MUC-02 | Story 2 |\n",
        encoding="utf-8",
    )

    _backfill_story_ids(plan)

    content = proc.read_text(encoding="utf-8")
    assert "DPMP-101" in content
    assert "DPMP-102" in content
    assert "S-01" not in content
    assert "S-02" not in content


# ── [PROD_FORMAT].md ─────────────────────────────────────────────────────────

def test_prd_appendix_story_key_replaced_only(tmp_path):
    """PRD 仅附录分析表中的 story_key 应被替换，正文标题保持不动。"""
    plan = _write_story_plan(tmp_path, [
        {"story_key": "S-01", "story_id": "TAILOR-124-3456",
         "story名称": "标题", "所属需求编号": "TAILOR-124"},
    ])
    prd = tmp_path / "[PROD_FORMAT]需求.md"
    prd.write_text(
        "### 2.2 客户全景视图\n\n"
        "内容段落...\n\n"
        "## 附录：Story-Feature-MUC 结构分析\n\n"
        "| story_key | feature_key | muc_key | Story |\n"
        "|-----------|-------------|---------|-------|\n"
        "| S-01 | F-01 | MUC-01 | 客户全景视图 |\n",
        encoding="utf-8",
    )

    stats = _backfill_story_ids(plan)

    content = prd.read_text(encoding="utf-8")
    assert "### 2.2 客户全景视图" in content
    assert "| TAILOR-124-3456 | F-01 | MUC-01 | 客户全景视图 |" in content
    assert stats["format"] == 1


def test_prd_multiple_appendix_story_keys_replaced(tmp_path):
    """PRD 中多个 Story 的附录表 story_key 都应被替换。"""
    plan = _write_story_plan(tmp_path, [
        {"story_key": "S-01", "story_id": "TAILOR-124-101",
         "story名称": "Story1", "所属需求编号": "TAILOR-124"},
        {"story_key": "S-02", "story_id": "TAILOR-124-102",
         "story名称": "Story2", "所属需求编号": "TAILOR-124"},
    ])
    prd = tmp_path / "[PROD_FORMAT]需求.md"
    prd.write_text(
        "### 2.2 Story一\n\n"
        "### 2.3 Story二\n\n"
        "## 附录：Story-Feature-MUC 结构分析\n\n"
        "| story_key | feature_key | muc_key | Story |\n"
        "|-----------|-------------|---------|-------|\n"
        "| S-01 | F-01 | MUC-01 | Story一 |\n"
        "| S-02 | F-02 | MUC-02 | Story二 |\n",
        encoding="utf-8",
    )

    _backfill_story_ids(plan)

    content = prd.read_text(encoding="utf-8")
    assert "| TAILOR-124-101 | F-01 | MUC-01 | Story一 |" in content
    assert "| TAILOR-124-102 | F-02 | MUC-02 | Story二 |" in content


# ── [STORY_FORMAT] 文件重命名 ─────────────────────────────────────────────────

def test_story_format_single_file_renamed(tmp_path):
    """[STORY_FORMAT][S-01]标题.md 应被重命名为带真实 ID 的文件名。"""
    plan = _write_story_plan(tmp_path, [
        {"story_key": "S-01", "story_id": "TAILOR-124-3456",
         "story名称": "客户全景视图", "所属需求编号": "TAILOR-124"},
    ])
    old_file = tmp_path / "[STORY_FORMAT][S-01]客户全景视图.md"
    old_file.write_text("# Story 内容\n", encoding="utf-8")

    stats = _backfill_story_ids(plan)

    assert not old_file.exists(), "旧文件应已被删除（重命名）"
    new_file = tmp_path / "[STORY_FORMAT][TAILOR-124-3456]客户全景视图.md"
    assert new_file.exists(), "新文件名应存在"
    assert new_file.read_text(encoding="utf-8") == "# Story 内容\n"
    assert stats["story"] == 1


def test_story_format_multiple_files_renamed(tmp_path):
    """多个 [STORY_FORMAT] 文件都应被正确重命名。"""
    plan = _write_story_plan(tmp_path, [
        {"story_key": "S-01", "story_id": "DPMP-201",
         "story名称": "功能A", "所属需求编号": "REQ-1"},
        {"story_key": "S-02", "story_id": "DPMP-202",
         "story名称": "功能B", "所属需求编号": "REQ-1"},
    ])
    (tmp_path / "[STORY_FORMAT][S-01]功能A.md").write_text("A", encoding="utf-8")
    (tmp_path / "[STORY_FORMAT][S-02]功能B.md").write_text("B", encoding="utf-8")

    stats = _backfill_story_ids(plan)

    assert (tmp_path / "[STORY_FORMAT][DPMP-201]功能A.md").exists()
    assert (tmp_path / "[STORY_FORMAT][DPMP-202]功能B.md").exists()
    assert stats["story"] == 2


# ── 边界条件 ─────────────────────────────────────────────────────────────────

def test_skip_when_all_story_ids_empty(tmp_path):
    """所有 story_id 为空时，应返回 no_real_id，不做任何替换。"""
    plan = _write_story_plan(tmp_path, [
        {"story_key": "S-01", "story_id": "",
         "story名称": "标题", "所属需求编号": "REQ-1"},
    ])
    prd = tmp_path / "[PROD_FORMAT]需求.md"
    prd.write_text("| S-01 | F-01 | MUC-01 | 标题 |\n", encoding="utf-8")

    result = _backfill_story_ids(plan)

    assert result.get("status") == "no_real_id"
    assert "S-01" in prd.read_text(encoding="utf-8")  # 内容未改变


def test_partial_replacement_only_filled_stories(tmp_path):
    """只有有真实 story_id 的 Story 才被替换，空 story_id 的保留原样。"""
    plan = _write_story_plan(tmp_path, [
        {"story_key": "S-01", "story_id": "DPMP-301",
         "story名称": "S1", "所属需求编号": "REQ-1"},
        {"story_key": "S-02", "story_id": "",
         "story名称": "S2", "所属需求编号": "REQ-1"},
    ])
    prd = tmp_path / "[PROD_FORMAT]需求.md"
    prd.write_text(
        "## 附录：Story-Feature-MUC 结构分析\n\n"
        "| story_key | feature_key | muc_key | Story |\n"
        "|-----------|-------------|---------|-------|\n"
        "| S-01 | F-01 | MUC-01 | Story一 |\n"
        "| S-02 | F-02 | MUC-02 | Story二 |\n",
        encoding="utf-8",
    )

    _backfill_story_ids(plan)

    content = prd.read_text(encoding="utf-8")
    assert "| DPMP-301 | F-01 | MUC-01 | Story一 |" in content
    assert "| S-02 | F-02 | MUC-02 | Story二 |" in content


def test_no_story_id_column_handled_gracefully(tmp_path):
    """CSV 没有 story_id 列（旧格式）时不应崩溃，应返回 no_real_id。"""
    plan_path = tmp_path / "[STORY_PLAN]需求.csv"
    plan_path.write_text(
        "story_key,story名称\nS-01,标题\n",
        encoding="utf-8-sig",
    )

    result = _backfill_story_ids(str(plan_path))
    assert result.get("status") == "no_real_id"


def test_no_target_files_returns_zero_stats(tmp_path):
    """目录里没有 [PROD_ORI] / [PROD_FORMAT] / [STORY_FORMAT] 文件时，统计全为 0。"""
    plan = _write_story_plan(tmp_path, [
        {"story_key": "S-01", "story_id": "DPMP-001",
         "story名称": "标题", "所属需求编号": "REQ-1"},
    ])

    stats = _backfill_story_ids(plan)

    assert stats["process"] == 0
    assert stats["format"] == 0
    assert stats["story"] == 0
