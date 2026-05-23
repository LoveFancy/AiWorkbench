import logging
import os
import sys


SCRIPTS_DIR = os.path.join(os.path.dirname(__file__), "..", "scripts")
sys.path.insert(0, os.path.abspath(SCRIPTS_DIR))

from dpmp.story_reader import StoryReader


CSV_CONTENT = """story_key,story_id,story名称,story描述,所属完整迭代名,所属需求编号,所属需求名称,经办人工号,经办人姓名,创建人工号,计划开发完成日期,计划测试完成日期,计划完成日期
S-01,,【前后端】客户全景视图,客户全景视图改版,2024-Q2-Sprint3,TAILOR-124,,012950,秦晓,012950,,,
S-02,,【前后端】客户标签管理,客户标签管理改版,2024-Q2-Sprint3,← 请填写,,012950,秦晓,012950,,,
"""

CSV_CONTENT_WITH_RELEASE_VERSION = """story_key,story_id,story名称,story描述,所属完整迭代名,所属需求编号,所属需求名称,发布版本,经办人工号,经办人姓名,创建人工号,计划开发完成日期,计划测试完成日期,计划完成日期
S-01,,【前后端】客户全景视图,客户全景视图改版,2024-Q2-Sprint3,TAILOR-124,,COSMOS-13-32.1332.2099-FOREVER,012950,秦晓,012950,,,
"""


def test_read_stories_from_csv_skips_unfilled_rows_by_default(tmp_path):
    file_path = tmp_path / "[STORY_PLAN]需求.csv"
    file_path.write_text(CSV_CONTENT, encoding="utf-8")

    reader = StoryReader(logging.getLogger("test"))
    stories = reader.read_stories_from_csv(str(file_path))

    assert len(stories) == 1
    assert stories[0].story_key == "S-01"
    assert stories[0].story_name == "【前后端】客户全景视图"


def test_read_stories_from_csv_maps_release_version(tmp_path):
    file_path = tmp_path / "[STORY_PLAN]需求.csv"
    file_path.write_text(CSV_CONTENT_WITH_RELEASE_VERSION, encoding="utf-8")

    reader = StoryReader(logging.getLogger("test"))
    stories = reader.read_stories_from_csv(str(file_path))

    assert len(stories) == 1
    assert stories[0].release_version == "COSMOS-13-32.1332.2099-FOREVER"


def test_read_stories_from_csv_keeps_unfilled_rows_in_mock_mode(tmp_path):
    file_path = tmp_path / "[STORY_PLAN]需求.csv"
    file_path.write_text(CSV_CONTENT, encoding="utf-8")

    reader = StoryReader(logging.getLogger("test"), skip_unfilled=False)
    stories = reader.read_stories_from_csv(str(file_path))

    assert len(stories) == 2
    assert stories[1].story_key == "S-02"


def test_update_story_ids_in_csv_updates_matching_story_key(tmp_path):
    file_path = tmp_path / "[STORY_PLAN]需求.csv"
    file_path.write_text(CSV_CONTENT, encoding="utf-8")

    reader = StoryReader(logging.getLogger("test"))
    reader.update_story_ids_in_csv(str(file_path), {"S-01": "DPMP-1001"})

    content = file_path.read_text(encoding="utf-8")
    assert "S-01,DPMP-1001,【前后端】客户全景视图" in content
    assert "S-02,,【前后端】客户标签管理" in content
