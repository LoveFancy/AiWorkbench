"""CSV-based Story reader and writer for [STORY_PLAN].csv."""

from __future__ import annotations

import csv
import logging
from pathlib import Path

from dpmp.models import StoryData


class StoryReader:
    """Reader/writer for [STORY_PLAN].csv files."""

    def __init__(self, logger: logging.Logger, skip_unfilled: bool = True) -> None:
        self.logger = logger
        self.source_file: str = ""
        self.skip_unfilled = skip_unfilled

    def read_stories_from_csv(self, file_path: str) -> list[StoryData]:
        """Parse [STORY_PLAN].csv and return a list of StoryData."""
        self.source_file = file_path
        path = Path(file_path)
        if not path.exists():
            raise FileNotFoundError(f"CSV file not found: {file_path}")

        with path.open(encoding="utf-8-sig", newline="") as f:
            reader = csv.DictReader(f)
            stories: list[StoryData] = []
            for row in reader:
                if not row:
                    continue
                row_dict = {key or "": (value or "").strip() for key, value in row.items()}

                if any("← 请填写" in value for value in row_dict.values()):
                    if self.skip_unfilled:
                        self.logger.warning(f"跳过未填写行: {row_dict.get('story_key', '?')}")
                        continue
                    self.logger.info(f"Mock 模式：保留未填写行: {row_dict.get('story_key', '?')}")

                story = StoryData.from_dict(row_dict)
                if story.story_key:
                    stories.append(story)

        self.logger.info(f"从 CSV 加载 {len(stories)} 条有效 Story")
        return stories

    def update_story_ids_in_csv(self, file_path: str, updates: dict[str, str]) -> None:
        """Update story_id column in [STORY_PLAN].csv by story_key.

        If story_id column does not exist, it is inserted right after story_key.
        """
        if not updates:
            return

        path = Path(file_path)
        with path.open(encoding="utf-8-sig", newline="") as f:
            reader = csv.DictReader(f)
            fieldnames = list(reader.fieldnames or [])
            if "story_key" not in fieldnames:
                self.logger.warning("表头缺少 story_key 列，无法回写 story_id")
                return

            # 动态插入 story_id 列（紧跟 story_key 之后）
            if "story_id" not in fieldnames:
                idx = fieldnames.index("story_key")
                fieldnames.insert(idx + 1, "story_id")
                self.logger.info("story_id 列不存在，已动态插入到 story_key 之后")

            rows = list(reader)

        updated = 0
        for row in rows:
            key = (row.get("story_key") or "").strip()
            if key in updates:
                row["story_id"] = updates[key]
                updated += 1
            elif "story_id" not in row:
                row["story_id"] = ""  # 确保新列有值

        with path.open("w", encoding="utf-8-sig", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(rows)

        self.logger.info(f"已更新 {updated} 条 story_id")

