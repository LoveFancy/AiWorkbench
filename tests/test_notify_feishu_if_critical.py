import importlib.util
import json
import pathlib
import tempfile
import unittest
from unittest import mock


SCRIPT_PATH = pathlib.Path(__file__).resolve().parents[1] / "scripts" / "notify_feishu_if_critical.py"


def load_module():
    spec = importlib.util.spec_from_file_location("notify_feishu_if_critical", SCRIPT_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class NotifyFeishuIfCriticalTest(unittest.TestCase):
    def test_extracts_critical_findings_from_nested_ocr_json(self):
        module = load_module()
        review = {
            "reviews": [
                {
                    "file": "apps/electron/src/main/ipc.ts",
                    "comments": [
                        {
                            "level": "critical",
                            "line": 88,
                            "title": "IPC 缺少权限校验",
                            "detail": "renderer 可以触发敏感主进程能力。",
                        },
                        {
                            "level": "medium",
                            "line": 120,
                            "message": "普通可维护性问题",
                        },
                    ],
                }
            ]
        }

        findings = module.extract_critical_findings(review)

        self.assertEqual(
            findings,
            [
                {
                    "severity": "critical",
                    "file": "apps/electron/src/main/ipc.ts",
                    "line": 88,
                    "title": "IPC 缺少权限校验",
                    "detail": "renderer 可以触发敏感主进程能力。",
                }
            ],
        )

    def test_extracts_critical_findings_from_common_issue_keys(self):
        module = load_module()
        review = {
            "issues": [
                {
                    "severity": "blocker",
                    "path": "apps/electron/src/auth/renderer.ts",
                    "start_line": 41,
                    "summary": "疑似明文 token",
                    "description": "不应把敏感凭据写入代码。",
                },
                {"severity": "low", "path": "README.md", "message": "措辞建议"},
            ]
        }

        findings = module.extract_critical_findings(review)

        self.assertEqual(
            findings,
            [
                {
                    "severity": "blocker",
                    "file": "apps/electron/src/auth/renderer.ts",
                    "line": 41,
                    "title": "疑似明文 token",
                    "detail": "不应把敏感凭据写入代码。",
                }
            ],
        )

    def test_builds_feishu_payload_with_pr_context_and_sign(self):
        module = load_module()
        findings = [
            {
                "severity": "critical",
                "file": "apps/electron/src/main/ipc.ts",
                "line": 88,
                "title": "IPC 缺少权限校验",
                "detail": "renderer 可以触发敏感主进程能力。",
            }
        ]

        payload = module.build_feishu_payload(
            findings,
            repo="LoveFancy/AiWorkbench",
            pr_title="Add risky ipc",
            pr_url="https://github.com/LoveFancy/AiWorkbench/pull/1",
            secret="secret",
            timestamp="1770000000",
        )

        self.assertEqual(payload["msg_type"], "text")
        self.assertEqual(payload["timestamp"], "1770000000")
        self.assertTrue(payload["sign"])
        text = payload["content"]["text"]
        self.assertIn("AiWorkbench PR 发现严重代码风险", text)
        self.assertIn("LoveFancy/AiWorkbench", text)
        self.assertIn("https://github.com/LoveFancy/AiWorkbench/pull/1", text)
        self.assertIn("apps/electron/src/main/ipc.ts:88", text)
        self.assertIn("IPC 缺少权限校验", text)

    def test_cli_does_not_notify_when_no_critical_findings(self):
        module = load_module()
        with tempfile.TemporaryDirectory(dir="/private/tmp") as tmp_dir:
            review_path = pathlib.Path(tmp_dir) / "review.json"
            review_path.write_text(json.dumps({"issues": [{"severity": "medium", "message": "普通问题"}]}), encoding="utf-8")

            with mock.patch.dict("os.environ", {"FEISHU_WEBHOOK": "https://example.invalid/webhook"}):
                exit_code = module.main([str(review_path)])

        self.assertEqual(exit_code, 0)


if __name__ == "__main__":
    unittest.main()
