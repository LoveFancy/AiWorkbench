"""Data models for DPMP Story creation."""

import math
from dataclasses import dataclass
from typing import Any, ClassVar


def _normalize_str(value: Any) -> str:
    """Normalize value to string, handling None, NaN, and empty values."""
    if value is None:
        return ""
    if isinstance(value, float):
        if math.isnan(value):
            return ""
    result = str(value).strip()
    if result.lower() in ("nan", "none", "null", ""):
        return ""
    return result


@dataclass
class StoryData:
    """Story data model with Markdown header mapping support."""

    story_key: str
    story_name: str
    story_description: str
    iteration_name: str
    requirement_code: str
    requirement_name: str
    release_version: str
    assignee_id: str
    assignee_name: str
    reporter_id: str
    plan_dev_end: str
    test_plan_end: str
    plan_end: str
    story_id: str = ""

    _MD_HEADER_MAP: ClassVar[dict[str, str]] = {
        "story_key": "story_key",
        "story名称": "story_name",
        "story描述": "story_description",
        "所属完整迭代名": "iteration_name",
        "所属需求编号": "requirement_code",
        "所属需求名称": "requirement_name",
        "发布版本": "release_version",
        "经办人工号": "assignee_id",
        "经办人姓名": "assignee_name",
        "创建人工号": "reporter_id",
        "计划开发完成日期": "plan_dev_end",
        "计划测试完成日期": "test_plan_end",
        "计划完成日期": "plan_end",
        "story_id": "story_id",
    }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "StoryData":
        """Create StoryData from a Markdown-header-keyed dictionary.

        Args:
            data: Dictionary whose keys are Markdown table headers.

        Returns:
            StoryData instance
        """
        kwargs: dict[str, str] = {}
        for md_header, field_name in cls._MD_HEADER_MAP.items():
            kwargs[field_name] = _normalize_str(data.get(md_header, ""))
        return cls(**kwargs)

    def is_valid(self) -> bool:
        """Check if story data has all required fields.

        Returns:
            True if all required fields are present
        """
        return bool(
            self.story_key
            and self.story_name
            and self.story_description
            and self.iteration_name
            and self.requirement_code
            and self.assignee_id
            and self.reporter_id
        )
