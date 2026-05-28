"""
DPMP脚本集成测试 - 从创建REQ到查询STORY状态的完整流程
"""

import pytest
import sys
import os
import uuid
from datetime import datetime
from dotenv import load_dotenv

# Load .env file before imports
env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env')
load_dotenv(env_path)

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from scripts.create_req import main as create_req_main
from scripts.query_req import main as query_req_main
from scripts.update_req import main as update_req_main
from scripts.create_story import main as create_story_main
from scripts.query_story import main as query_story_main
from scripts.update_story import main as update_story_main
from scripts.update_status import main as update_status_main


# Test configuration from .env
PRODUCT_KEY = "S0305"
PROJECT_KEY = "TEST0408"
REPORTER = "012950"
ASSIGNEE = "012950"


@pytest.fixture(scope="module")
def test_data():
    """Generate unique test data for each test run."""
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    unique_id = str(uuid.uuid4())[:8]
    
    return {
        "req_name": f"AI-DEV测试需求-{timestamp}-{unique_id}",
        "req_desc": f"这是自动化测试创建的需求，时间戳: {timestamp}",
        "story_name": f"AI-DEV测试任务-{timestamp}-{unique_id}",
        "story_desc": f"这是自动化测试创建的任务，时间戳: {timestamp}",
        "priority": "高(一般)",
        "product_key": PRODUCT_KEY,
        "project_key": PROJECT_KEY,
        "reporter": REPORTER,
        "assignee": ASSIGNEE,
        "req_code": None,  # Will be set after creation
        "story_code": None,  # Will be set after creation
    }


RUN_INTEGRATION = os.getenv("DPMP_RUN_INTEGRATION_TESTS", "").lower() in ("1", "true", "yes")

@pytest.mark.skipif(not RUN_INTEGRATION, reason="set DPMP_RUN_INTEGRATION_TESTS=1 to run real API tests")
class TestDPMPWorkflow:
    """Integration test for complete DPMP workflow. Requires DPMP_RUN_INTEGRATION_TESTS=1 env var."""

    def test_01_create_req(self, test_data, capsys):
        """Step 1: Create a new REQ."""
        args = [
            "--name", test_data["req_name"],
            "--desc", test_data["req_desc"],
            "--priority", test_data["priority"],
            "--product-key", test_data["product_key"],
            "--reporter", test_data["reporter"],
            "--assignee", test_data["assignee"],
            "--demand-originator", test_data["reporter"],
            "--req-doc-url", "https://example.com/req-doc",
            "--req-doc-type", "PRD",
        ]
        
        create_req_main(args)
        captured = capsys.readouterr()
        
        # Verify success message
        assert "REQ 创建成功" in captured.out or "✅" in captured.out
        
        # Extract REQ code from output
        output_lines = captured.out.split("\n")
        for line in output_lines:
            if "编号:" in line:
                # Parse code like "编号: S0305-XX"
                code = line.split("编号:")[-1].strip()
                if code and code != "未知":
                    test_data["req_code"] = code
                    break
        
        assert test_data["req_code"] is not None, "Failed to extract REQ code from output"
        print(f"[TEST] Created REQ: {test_data['req_code']}")

    def test_02_query_req_by_code(self, test_data, capsys):
        """Step 2: Query the created REQ by code."""
        assert test_data["req_code"] is not None, "REQ code not available"
        
        args = ["--code", test_data["req_code"]]
        query_req_main(args)
        captured = capsys.readouterr()
        
        # Verify query success
        assert "REQ 详情" in captured.out
        assert test_data["req_code"] in captured.out
        assert test_data["req_name"] in captured.out
        
        # Verify nested field parsing
        assert "优先级:" in captured.out
        assert "状态:" in captured.out
        assert "产品空间:" in captured.out
        
        print(f"[TEST] Queried REQ: {test_data['req_code']}")

    def test_03_update_req(self, test_data, capsys):
        """Step 3: Update the REQ."""
        assert test_data["req_code"] is not None, "REQ code not available"
        
        updated_name = f"{test_data['req_name']}-已更新"
        args = [
            "--code", test_data["req_code"],
            "--name", updated_name,
            "--desc", f"{test_data['req_desc']} - 更新后",
        ]
        
        update_req_main(args)
        captured = capsys.readouterr()
        
        # Verify update success
        assert "REQ 更新成功" in captured.out or "✅" in captured.out
        
        print(f"[TEST] Updated REQ: {test_data['req_code']}")

    def test_04_update_req_status(self, test_data, capsys):
        """Step 4: Update REQ status."""
        assert test_data["req_code"] is not None, "REQ code not available"
        
        args = [
            "--code", test_data["req_code"],
            "--status", "分析中",
            "--type", "req",
        ]
        
        update_status_main(args)
        captured = capsys.readouterr()
        
        # Verify status update success
        assert "状态更新成功" in captured.out or "✅" in captured.out
        
        print(f"[TEST] Updated REQ status: {test_data['req_code']}")

    def test_05_create_story(self, test_data, capsys):
        """Step 5: Create a new STORY linked to the REQ."""
        assert test_data["req_code"] is not None, "REQ code not available"
        
        args = [
            "--name", test_data["story_name"],
            "--desc", test_data["story_desc"],
            "--priority", test_data["priority"],
            "--project-key", test_data["project_key"],
            "--req-code", test_data["req_code"],
            "--reporter", test_data["reporter"],
            "--assignee", test_data["assignee"],
            "--plan-end", "2026-06-30",
        ]
        
        create_story_main(args)
        captured = capsys.readouterr()
        
        # Verify success message
        assert "STORY 创建成功" in captured.out or "✅" in captured.out
        
        # Extract STORY code from output
        output_lines = captured.out.split("\n")
        for line in output_lines:
            if "编号:" in line:
                code = line.split("编号:")[-1].strip()
                if code and code != "未知":
                    test_data["story_code"] = code
                    break
        
        assert test_data["story_code"] is not None, "Failed to extract STORY code from output"
        print(f"[TEST] Created STORY: {test_data['story_code']}")

    def test_06_query_story_by_code(self, test_data, capsys):
        """Step 6: Query the created STORY by code."""
        assert test_data["story_code"] is not None, "STORY code not available"
        
        args = ["--code", test_data["story_code"]]
        query_story_main(args)
        captured = capsys.readouterr()
        
        # Verify query success
        assert "STORY 详情" in captured.out
        assert test_data["story_code"] in captured.out
        assert test_data["story_name"] in captured.out
        
        # Verify nested field parsing
        assert "优先级:" in captured.out
        assert "状态:" in captured.out
        assert "项目空间:" in captured.out
        assert "计划完成日期:" in captured.out
        
        print(f"[TEST] Queried STORY: {test_data['story_code']}")

    def test_07_update_story(self, test_data, capsys):
        """Step 7: Update the STORY."""
        assert test_data["story_code"] is not None, "STORY code not available"
        
        updated_name = f"{test_data['story_name']}-已更新"
        args = [
            "--code", test_data["story_code"],
            "--name", updated_name,
            "--desc", f"{test_data['story_desc']} - 更新后",
        ]
        
        update_story_main(args)
        captured = capsys.readouterr()
        
        # Verify update success
        assert "STORY 更新成功" in captured.out or "✅" in captured.out
        
        print(f"[TEST] Updated STORY: {test_data['story_code']}")

    def test_08_update_story_status(self, test_data, capsys):
        """Step 8: Update STORY status."""
        assert test_data["story_code"] is not None, "STORY code not available"
        
        args = [
            "--code", test_data["story_code"],
            "--status", "开发中",
            "--type", "story",
        ]
        
        update_status_main(args)
        captured = capsys.readouterr()
        
        # Verify status update success
        assert "状态更新成功" in captured.out or "✅" in captured.out
        
        print(f"[TEST] Updated STORY status: {test_data['story_code']}")

    def test_09_query_story_final_state(self, test_data, capsys):
        """Step 9: Query STORY to verify final state."""
        assert test_data["story_code"] is not None, "STORY code not available"
        
        args = ["--code", test_data["story_code"], "--format", "json"]
        query_story_main(args)
        captured = capsys.readouterr()
        
        # Verify JSON output contains expected fields
        assert test_data["story_code"] in captured.out
        
        print(f"[TEST] Final STORY state verified: {test_data['story_code']}")


class TestDPMPMockMode:
    """Test mock mode for all scripts (no real API calls)."""

    def test_create_req_mock(self, capsys):
        """Test create-req in mock mode."""
        args = [
            "--name", "Mock测试需求",
            "--desc", "Mock测试描述",
            "--priority", "高(一般)",
            "--product-key", "TEST",
            "--reporter", "001",
            "--assignee", "001",
            "--demand-originator", "001",
            "--req-doc-url", "https://example.com/doc",
            "--req-doc-type", "PRD",
            "--mock",
        ]
        create_req_main(args)
        captured = capsys.readouterr()
        print("\n[OUTPUT] create-req mock:")
        print(captured.out)
        assert "[Mock]" in captured.out
        assert "创建 REQ 成功" in captured.out

    def test_create_story_mock(self, capsys):
        """Test create-story in mock mode."""
        args = [
            "--name", "Mock测试任务",
            "--desc", "Mock测试描述",
            "--priority", "高(一般)",
            "--project-key", "TEST",
            "--req-code", "REQ-001",
            "--reporter", "001",
            "--assignee", "001",
            "--mock",
        ]
        create_story_main(args)
        captured = capsys.readouterr()
        print("\n[OUTPUT] create-story mock:")
        print(captured.out)
        assert "[Mock]" in captured.out
        assert "创建 STORY 成功" in captured.out

    def test_query_req_mock(self, capsys):
        """Test query-req in mock mode."""
        args = ["--code", "PRODU-1079", "--mock"]
        query_req_main(args)
        captured = capsys.readouterr()
        print("\n[OUTPUT] query-req mock:")
        print(captured.out)
        assert "[Mock]" in captured.out
        assert "REQ编号" in captured.out

    def test_query_story_mock(self, capsys):
        """Test query-story in mock mode."""
        args = ["--code", "STORY-123", "--mock"]
        query_story_main(args)
        captured = capsys.readouterr()
        print("\n[OUTPUT] query-story mock:")
        print(captured.out)
        assert "[Mock]" in captured.out
        assert "STORY编号" in captured.out

    def test_update_req_mock(self, capsys):
        """Test update-req in mock mode."""
        args = ["--code", "PRODU-1079", "--name", "更新后的名称", "--mock"]
        update_req_main(args)
        captured = capsys.readouterr()
        print("\n[OUTPUT] update-req mock:")
        print(captured.out)
        assert "[Mock]" in captured.out
        assert "更新 REQ 成功" in captured.out

    def test_update_story_mock(self, capsys):
        """Test update-story in mock mode."""
        args = ["--code", "STORY-123", "--name", "更新后的名称", "--mock"]
        update_story_main(args)
        captured = capsys.readouterr()
        print("\n[OUTPUT] update-story mock:")
        print(captured.out)
        assert "[Mock]" in captured.out
        assert "更新 STORY 成功" in captured.out

    def test_update_status_mock(self, capsys):
        """Test update-status in mock mode."""
        args = ["--code", "STORY-123", "--status", "开发中", "--type", "story", "--mock"]
        update_status_main(args)
        captured = capsys.readouterr()
        print("\n[OUTPUT] update-status mock:")
        print(captured.out)
        assert "[Mock]" in captured.out
        assert "状态成功" in captured.out


class TestDPMPErrorHandling:
    """Test error handling scenarios."""

    def test_query_req_no_conditions(self, capsys):
        """Test query-req without any conditions."""
        args = []
        query_req_main(args)
        captured = capsys.readouterr()
        assert "错误" in captured.out or "没有提供查询条件" in captured.out

    def test_query_story_no_conditions(self, capsys):
        """Test query-story without any conditions."""
        args = []
        query_story_main(args)
        captured = capsys.readouterr()
        assert "错误" in captured.out or "没有提供查询条件" in captured.out

    def test_update_req_no_fields(self, capsys):
        """Test update-req without update fields."""
        args = ["--code", "PRODU-1079"]
        update_req_main(args)
        captured = capsys.readouterr()
        assert "错误" in captured.out or "没有提供更新字段" in captured.out

    def test_update_story_no_fields(self, capsys):
        """Test update-story without update fields."""
        args = ["--code", "STORY-123"]
        update_story_main(args)
        captured = capsys.readouterr()
        assert "错误" in captured.out or "没有提供更新字段" in captured.out

    def test_create_req_missing_required(self, capsys):
        """Test create-req with missing required fields."""
        args = ["--name", "测试需求"]  # Missing other required fields
        try:
            create_req_main(args)
        except SystemExit:
            pass  # argparse exits on missing required args
        captured = capsys.readouterr()
        # Should show help or error
        assert len(captured.out) > 0 or len(captured.err) > 0

    def test_create_story_missing_required(self, capsys):
        """Test create-story with missing required fields."""
        args = ["--name", "测试任务"]  # Missing other required fields
        try:
            create_story_main(args)
        except SystemExit:
            pass  # argparse exits on missing required args
        captured = capsys.readouterr()
        # Should show help or error
        assert len(captured.out) > 0 or len(captured.err) > 0


class TestTimestampFormatting:
    """Test timestamp formatting utility."""

    def test_format_timestamp_valid(self):
        """Test formatting valid timestamp."""
        from scripts.query_req import format_timestamp
        
        # 2026-05-23 timestamp in milliseconds
        ts = 1779501483704
        result = format_timestamp(ts)
        assert result == "2026-05-23"

    def test_format_timestamp_none(self):
        """Test formatting None timestamp."""
        from scripts.query_req import format_timestamp
        
        result = format_timestamp(None)
        assert result == "未知"

    def test_format_timestamp_zero(self):
        """Test formatting zero timestamp."""
        from scripts.query_req import format_timestamp
        
        result = format_timestamp(0)
        assert result == "未知"

    def test_format_timestamp_invalid(self):
        """Test formatting invalid timestamp."""
        from scripts.query_req import format_timestamp
        
        result = format_timestamp("invalid")
        assert result == "未知"