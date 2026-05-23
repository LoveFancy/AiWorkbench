"""DPMP Story creation automation ([STORY_PLAN].csv)."""

import logging
import time
from datetime import datetime
from typing import Any

import requests

from dpmp.api_client import APIClient
from dpmp.cache import QueryCache
from dpmp.config import DPMPConfig
from dpmp.models import StoryData
from dpmp.story_reader import StoryReader


def setup_logger(name: str = "dpmp", level: int = logging.INFO) -> logging.Logger:
    """Configure and return a logger instance."""
    logger = logging.getLogger(name)
    logger.setLevel(level)
    if not logger.handlers:
        handler = logging.StreamHandler()
        formatter = logging.Formatter(
            "%(asctime)s - %(name)s - %(levelname)s - %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
        handler.setFormatter(formatter)
        logger.addHandler(handler)
    return logger


class StoryAutomation:
    """Automation for creating DPMP stories from [STORY_PLAN].csv."""

    def __init__(self, config: DPMPConfig) -> None:
        self.config = config
        self.logger = setup_logger()
        self.cache = QueryCache()
        self.api_client = APIClient(config, self.cache, self.logger)
        self.reader = StoryReader(self.logger)

    def run_mock(self, story_plan_path: str) -> None:
        """Mock 模式：跳过真实 DPMP 创建，生成虚拟 story_id 并回写到 [STORY_PLAN].csv。

        用于网络不通或测试流程时，生成格式为 MOCK-001、MOCK-002 的虚拟 ID。
        Mock 模式不跳过含 ← 请填写 的行，允许在未填写所属需求编号时也能继续。

        Args:
            story_plan_path: Path to the [STORY_PLAN].csv file.
        """
        # Mock 模式：不跳过未填写行
        mock_reader = StoryReader(self.logger, skip_unfilled=False)
        stories = mock_reader.read_stories_from_csv(story_plan_path)
        if not stories:
            self.logger.warning("No valid stories to process")
            return

        pending = [s for s in stories if not s.story_id]
        skipped = [s for s in stories if s.story_id]

        if skipped:
            self.logger.info(f"Skipping {len(skipped)} stories with existing story_id")

        self.logger.info(f"[MOCK] Generating mock story_ids for {len(pending)} stories")

        counter = 1
        for story in pending:
            mock_id = f"MOCK-{counter:03d}"
            counter += 1
            self.logger.info(f"[MOCK] {story.story_name} → {mock_id}")
            try:
                mock_reader.update_story_ids_in_csv(story_plan_path, {story.story_key: mock_id})
            except Exception:
                self.logger.error(f"Failed to write mock story_id for {story.story_key}", exc_info=True)

        self.logger.info(f"[MOCK] Completed. Generated {len(pending)} mock story_ids.")

    def run(self, story_plan_path: str) -> None:
        """Run automation from a [STORY_PLAN].csv file.

        Args:
            story_plan_path: Path to the [STORY_PLAN].csv file.
        """
        self.logger.info("Validating cookie...")
        if not self.api_client.validate_cookie():
            raise ValueError("Cookie validation failed. Please update your cookie.")
        self.logger.info("Cookie is valid")

        stories = self.reader.read_stories_from_csv(story_plan_path)
        if not stories:
            self.logger.warning("No valid stories to process")
            return

        skipped = [s for s in stories if s.story_id]
        pending = [s for s in stories if not s.story_id]

        if skipped:
            self.logger.info(f"Skipping {len(skipped)} stories with existing story_id")

        self.logger.info(
            f"Starting: {len(pending)} pending, {len(skipped)} skipped, "
            f"delay={self.config.request_delay}s"
        )

        success_count = 0
        for idx, story in enumerate(stories):
            if story.story_id:
                self.logger.info(
                    f"[{idx+1}/{len(stories)}] Skipped: {story.story_name} "
                    f"(story_id={story.story_id})"
                )
                success_count += 1
                continue

            self.logger.info(f"[{idx+1}/{len(stories)}] Processing: {story.story_name}")
            success, story_id = self._process_story(story)

            if success:
                success_count += 1
                if story_id:
                    # Incremental writeback
                    try:
                        self.reader.update_story_ids_in_csv(
                            story_plan_path, {story.story_key: story_id}
                        )
                    except Exception:
                        self.logger.error(
                            f"Failed to write back story_id for {story.story_key}",
                            exc_info=True,
                        )

            if idx < len(stories) - 1:
                time.sleep(self.config.request_delay)

        self.logger.info(f"Completed. Success: {success_count}/{len(stories)}")

    def _process_story(self, story: StoryData) -> tuple[bool, str | None]:
        """Process a single story creation.

        Returns:
            Tuple of (success, story_id).
        """
        try:
            iteration = self.api_client.query_iteration(story.iteration_name)
            if not iteration:
                self.logger.error(f"Iteration not found: {story.iteration_name}")
                return False, None

            assignee = self.api_client.query_user(story.assignee_id)
            if not assignee:
                self.logger.error(f"Assignee not found: {story.assignee_id}")
                return False, None

            reporter = self.api_client.query_user(story.reporter_id)
            if not reporter:
                self.logger.error(f"Reporter not found: {story.reporter_id}")
                return False, None

            parent_issue = self.api_client.query_parent_issue(story.requirement_code)
            if not parent_issue:
                self.logger.error(f"Parent issue not found: {story.requirement_code}")
                return False, None

            release_version = None
            if story.release_version:
                release_version = self.api_client.query_release_version(story.release_version)
                if not release_version:
                    self.logger.error(f"Release version not found: {story.release_version}")
                    return False, None

            payload = self._build_payload(
                story,
                iteration,
                assignee,
                reporter,
                parent_issue,
                release_version=release_version,
            )
            result = self._create_story(payload)

            if result:
                story_id = self._extract_story_id(result)
                self.logger.info(f"Created: {story.story_name} (story_id={story_id})")
                return True, story_id
            else:
                self.logger.error(f"Failed to create: {story.story_name}")
                return False, None

        except requests.exceptions.RequestException as e:
            self.logger.error(f"Request error: {e}")
            return False, None

    def _create_story(self, payload: dict[str, Any]) -> dict[str, Any] | None:
        url = f"{self.config.base_url}/v2/project/{self.config.project_id}/demand"
        resp = self.api_client._make_request("POST", url, payload, request_kind="create")
        if resp.get("returnCode") == "000000":
            return resp
        self.logger.error(f"API error: {resp.get('returnMsg', 'Unknown')}")
        return None

    def _extract_story_id(self, response: dict[str, Any]) -> str | None:
        data = response.get("data", {})
        for key in ("code", "story_id", "storyId", "id"):
            value = data.get(key)
            if value:
                return str(value)
        return None

    def _build_payload(
        self, story: StoryData, iteration: dict, assignee: dict,
        reporter: dict, parent_issue: dict, release_version: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        custom_fields: list[dict[str, Any]] = [
            {"fieldKey": "priorityLevel", "value": {"id": 2013, "name": "高(一般)", "type": "default"}},
            {"fieldKey": "reporter", "value": reporter.get("id")},
        ]

        if release_version:
            custom_fields.append({"fieldKey": "version", "value": [release_version]})

        dev_end = self._parse_datetime_ms(story.plan_dev_end)
        if dev_end is not None:
            custom_fields.append({"fieldKey": "fieldkey2051", "value": dev_end})

        test_end = self._parse_datetime_ms(story.test_plan_end)
        if test_end is not None:
            custom_fields.append({"fieldKey": "testPlanEnd", "value": test_end})

        plan_end = self._parse_datetime_ms(story.plan_end)
        if plan_end is not None:
            custom_fields.append({"fieldKey": "planEnd", "value": plan_end})

        return {
            "customFields": custom_fields,
            "name": story.story_name,
            "description": f"<p>{story.story_description}</p>",
            "parentId": self._build_parent_payload(parent_issue),
            "assignee": self._build_assignee_payload(assignee),
            "iterationId": iteration.get("id"),
            "planWorkTime": None,
            "projectId": self.config.project_id,
            "taskTypeId": self.config.task_type_id,
        }

    @staticmethod
    def _parse_datetime_ms(value: str) -> int | None:
        if not value:
            return None
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%Y/%m/%d %H:%M:%S", "%Y/%m/%d"):
            try:
                return int(datetime.strptime(value, fmt).timestamp() * 1000)
            except ValueError:
                continue
        return None

    @staticmethod
    def _build_parent_payload(parent_issue: dict) -> dict[str, Any]:
        return {k: parent_issue.get(k) for k in (
            "id", "name", "disabled", "url", "type", "appId",
            "unitTypeId", "code", "displayName", "versionPlanReTime",
            "actualPublishTime", "suffix",
        )}

    @staticmethod
    def _build_assignee_payload(assignee: dict) -> dict[str, Any]:
        return {k: assignee.get(k) for k in (
            "adAccount", "code", "departmentId", "departmentTreeName",
            "displayName", "email", "id", "isDisable", "leader",
            "name", "projectTp", "suffix", "url",
        )}
