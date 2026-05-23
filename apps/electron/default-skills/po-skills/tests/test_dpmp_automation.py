import os
import sys


SCRIPTS_DIR = os.path.join(os.path.dirname(__file__), "..", "scripts")
sys.path.insert(0, os.path.abspath(SCRIPTS_DIR))

from dpmp.automation import StoryAutomation
from dpmp.config import DPMPConfig
from dpmp.models import StoryData


def make_story(release_version: str = "") -> StoryData:
    return StoryData(
        story_key="S-01",
        story_name="客户全景视图",
        story_description="客户全景视图改版",
        iteration_name="2024-Q2-Sprint3",
        requirement_code="TAILOR-124",
        requirement_name="客户全景需求",
        release_version=release_version,
        assignee_id="012950",
        assignee_name="秦晓",
        reporter_id="012950",
        plan_dev_end="",
        test_plan_end="",
        plan_end="",
    )


def make_automation() -> StoryAutomation:
    return StoryAutomation(DPMPConfig(cookie="cookie"))


def field_keys(payload: dict) -> list[str]:
    return [field["fieldKey"] for field in payload["customFields"]]


def test_build_payload_omits_release_version_when_empty():
    payload = make_automation()._build_payload(
        make_story(),
        iteration={"id": 1001},
        assignee={"id": 2001, "displayName": "秦晓"},
        reporter={"id": 2001},
        parent_issue={"id": 3001, "code": "TAILOR-124", "name": "客户全景需求"},
    )

    assert "version" not in field_keys(payload)


def test_build_payload_includes_release_version_when_resolved():
    release_version = {"id": 434910, "name": "COSMOS-13-32.1332.2099-FOREVER", "disabled": False}

    payload = make_automation()._build_payload(
        make_story("COSMOS-13-32.1332.2099-FOREVER"),
        iteration={"id": 1001},
        assignee={"id": 2001, "displayName": "秦晓"},
        reporter={"id": 2001},
        parent_issue={"id": 3001, "code": "TAILOR-124", "name": "客户全景需求"},
        release_version=release_version,
    )

    version_fields = [
        field for field in payload["customFields"]
        if field["fieldKey"] == "version"
    ]
    assert version_fields == [{"fieldKey": "version", "value": [release_version]}]


def test_process_story_queries_release_version_when_present(monkeypatch):
    automation = make_automation()
    release_version = {"id": 434910, "name": "COSMOS-13-32.1332.2099-FOREVER", "disabled": False}
    captured = {}

    monkeypatch.setattr(automation.api_client, "query_iteration", lambda name: {"id": 1001})
    monkeypatch.setattr(automation.api_client, "query_user", lambda user_id: {"id": 2001, "adAccount": user_id})
    monkeypatch.setattr(
        automation.api_client,
        "query_parent_issue",
        lambda code: {"id": 3001, "code": code, "name": "客户全景需求"},
    )
    monkeypatch.setattr(automation.api_client, "query_release_version", lambda name: release_version)

    def fake_create(payload):
        captured["payload"] = payload
        return {"data": {"code": "DPMP-1001"}}

    monkeypatch.setattr(automation, "_create_story", fake_create)

    success, story_id = automation._process_story(make_story("COSMOS-13-32.1332.2099-FOREVER"))

    assert success is True
    assert story_id == "DPMP-1001"
    version_fields = [
        field for field in captured["payload"]["customFields"]
        if field["fieldKey"] == "version"
    ]
    assert version_fields == [{"fieldKey": "version", "value": [release_version]}]


def test_process_story_fails_when_release_version_not_found(monkeypatch):
    automation = make_automation()

    monkeypatch.setattr(automation.api_client, "query_iteration", lambda name: {"id": 1001})
    monkeypatch.setattr(automation.api_client, "query_user", lambda user_id: {"id": 2001, "adAccount": user_id})
    monkeypatch.setattr(
        automation.api_client,
        "query_parent_issue",
        lambda code: {"id": 3001, "code": code, "name": "客户全景需求"},
    )
    monkeypatch.setattr(automation.api_client, "query_release_version", lambda name: None)

    def fail_create(payload):
        raise AssertionError("Story should not be created when release version is missing")

    monkeypatch.setattr(automation, "_create_story", fail_create)

    success, story_id = automation._process_story(make_story("missing-version"))

    assert success is False
    assert story_id is None
