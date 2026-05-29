"""端到端集成测试（mock Confluence API）

对应需求：1.1 ~ 1.8
"""

import os
import sys
import pytest
import types
import importlib
from unittest.mock import patch, MagicMock

# 将 scripts/ 目录加入 sys.path，以便 import 脚本模块
SCRIPTS_DIR = os.path.join(os.path.dirname(__file__), "..", "scripts")
sys.path.insert(0, os.path.abspath(SCRIPTS_DIR))


# ---------------------------------------------------------------------------
# 测试 1：doc_convert.py 完整流程
# ---------------------------------------------------------------------------

class TestDocConvertIntegration:
    """验证 doc_convert.py 完整流程：URL 解析 → 内容获取 → 图片处理 → 文件保存"""

    # 包含一张图片的简单 HTML，用于 mock fetch_wiki_content 返回值
    SAMPLE_HTML = (
        '<h1>测试页面</h1>'
        '<p>这是正文内容。</p>'
        '<img src="http://wiki.htzq.htsc.com.cn/download/attachments/12345/test.png" />'
    )

    def test_full_pipeline_creates_file_with_nl_prefix(self, tmp_path, monkeypatch):
        """完整流程：输出文件存在，文件名以 [NL] 开头，内容非空。

        对应需求：1.1、1.2、1.3、1.4、1.5
        """
        monkeypatch.setenv("HTSC_WIKI_TOKEN", "test-token-123")

        # mock fetch_wiki_content 返回包含图片的 HTML
        mock_html = self.SAMPLE_HTML

        # mock requests.get 用于图片下载（返回 200 + 假图片字节）
        mock_img_response = MagicMock()
        mock_img_response.status_code = 200
        mock_img_response.raise_for_status = MagicMock()
        mock_img_response.iter_content = MagicMock(return_value=[b"fake-image-bytes"])

        with patch("wiki_fetcher.fetch_wiki_content", return_value=mock_html) as mock_fetch, \
             patch("requests.get", return_value=mock_img_response), \
             patch("doc_convert._fetch_page_title", return_value="测试页面标题"), \
             patch("markdowner.to_markdown", return_value="# 测试页面标题\n\n这是正文内容。\n"):

            import doc_convert

            test_args = [
                "doc_convert.py",
                "--url", "http://wiki.htzq.htsc.com.cn/pages/viewpage.action?pageId=12345",
                "--output-dir", str(tmp_path),
            ]
            monkeypatch.setattr(sys, "argv", test_args)

            doc_convert.main()

        # 验证 fetch_wiki_content 被调用
        mock_fetch.assert_called_once()

        # 验证输出文件存在，文件名以 [PROD_ORI] 开头
        output_files = list(tmp_path.glob("*.md"))
        assert len(output_files) == 1, f"期望 1 个 .md 文件，实际找到：{output_files}"

        output_file = output_files[0]
        assert output_file.name.startswith("[PROD_ORI]"), (
            f"文件名应以 [PROD_ORI] 开头，实际：{output_file.name}"
        )
        assert output_file.suffix == ".md"

        # 验证文件内容非空
        content = output_file.read_text(encoding="utf-8")
        assert len(content) > 0, "输出文件内容不应为空"

    def test_full_pipeline_with_pure_page_id(self, tmp_path, monkeypatch):
        """使用纯数字 page_id 调用，流程同样正常完成。

        对应需求：1.1
        """
        monkeypatch.setenv("HTSC_WIKI_TOKEN", "test-token-456")

        mock_html = "<h1>纯数字页面</h1><p>内容。</p>"

        with patch("wiki_fetcher.fetch_wiki_content", return_value=mock_html), \
             patch("doc_convert._fetch_page_title", return_value="纯数字页面"), \
             patch("markdowner.to_markdown", return_value="# 纯数字页面\n\n内容。\n"):

            import doc_convert

            monkeypatch.setattr(sys, "argv", [
                "doc_convert.py",
                "--url", "99999",
                "--output-dir", str(tmp_path),
            ])

            doc_convert.main()

        output_files = list(tmp_path.glob("*.md"))
        assert len(output_files) == 1
        assert output_files[0].name.startswith("[PROD_ORI]")
        assert len(output_files[0].read_text(encoding="utf-8")) > 0

    def test_image_download_failure_keeps_original_url(self, tmp_path, monkeypatch):
        """图片下载失败时，输出文件仍然生成，原始 URL 被保留。

        对应需求：1.8
        """
        monkeypatch.setenv("HTSC_WIKI_TOKEN", "test-token-789")

        original_img_url = "http://wiki.htzq.htsc.com.cn/download/attachments/99/fail.png"
        mock_html = f'<h1>图片失败页面</h1><img src="{original_img_url}" />'

        # 模拟图片下载失败
        mock_fail_response = MagicMock()
        mock_fail_response.raise_for_status.side_effect = Exception("Connection error")

        # to_markdown 接收到的 html 应仍包含原始 URL（因为下载失败未替换）
        captured_html = {}

        def fake_to_markdown(html):
            captured_html["html"] = html
            return "# 图片失败页面\n\n内容。\n"

        with patch("wiki_fetcher.fetch_wiki_content", return_value=mock_html), \
             patch("requests.get", return_value=mock_fail_response), \
             patch("doc_convert._fetch_page_title", return_value="图片失败页面"), \
             patch("markdowner.to_markdown", side_effect=fake_to_markdown):

            import doc_convert

            monkeypatch.setattr(sys, "argv", [
                "doc_convert.py",
                "--url", "99",
                "--output-dir", str(tmp_path),
            ])

            doc_convert.main()

        output_files = list(tmp_path.glob("*.md"))
        assert len(output_files) == 1, "即使图片下载失败，输出文件也应存在"
        assert len(output_files[0].read_text(encoding="utf-8")) > 0

        # 验证原始 URL 被保留（未被替换为本地路径）
        assert original_img_url in captured_html.get("html", ""), (
            "图片下载失败时，HTML 中应保留原始图片 URL"
        )



class TestRunDocToMdCommand:
    """验证 run.py 的 doc-to-md 命令入口。"""

    def test_doc_to_md_uses_default_output_dir(self, monkeypatch, tmp_path):
        input_file = tmp_path / "考核优化二期需求.pdf"
        input_file.write_bytes(b"%PDF-1.4")
        output_dir = tmp_path / "考核优化二期需求" / "PRODUCT_DESIGN"
        output_dir.mkdir(parents=True)

        captured = {}

        fake_doc_to_md = types.SimpleNamespace()

        def fake_main():
            captured["argv"] = list(sys.argv)

        fake_doc_to_md.main = fake_main
        monkeypatch.setitem(sys.modules, "doc_to_md", fake_doc_to_md)
        sys.modules.pop("run", None)
        run = importlib.import_module("run")

        run.cmd_doc_to_md(["--file", str(input_file), "--output-dir", str(output_dir)])

        assert captured["argv"] == [
            "doc_to_md.py",
            "--output-dir",
            str(output_dir),
            "--file",
            str(input_file),
        ]

    def test_doc_to_md_raw_output_dir_creates_document_subdir(self, monkeypatch, tmp_path):
        monkeypatch.chdir(tmp_path)
        input_file = tmp_path / "raw" / "证投境外期货需求说明.docx"
        input_file.parent.mkdir()
        input_file.write_bytes(b"fake")
        captured = {}

        fake_doc_to_md = types.SimpleNamespace()

        def fake_main():
            captured["argv"] = list(sys.argv)

        fake_doc_to_md.main = fake_main
        monkeypatch.setitem(sys.modules, "doc_to_md", fake_doc_to_md)
        sys.modules.pop("run", None)
        run = importlib.import_module("run")
        run.cmd_init_workspace([])

        run.cmd_doc_to_md([
            "--file",
            str(input_file),
            "--output-dir",
            "raw",
        ])

        assert captured["argv"] == [
            "doc_to_md.py",
            "--output-dir",
            "raw/证投境外期货需求说明",
            "--file",
            str(input_file),
        ]

    def test_doc_to_md_enhance_content_forwards_same_argv(self, monkeypatch, tmp_path):
        input_file = tmp_path / "需求说明.docx"
        input_file.write_bytes(b"fake")
        output_dir = tmp_path / "需求说明" / "PRODUCT_DESIGN"
        output_dir.mkdir(parents=True)
        captured = {}

        fake_doc_to_md = types.SimpleNamespace()

        def fake_main():
            captured["argv"] = list(sys.argv)

        fake_doc_to_md.main = fake_main
        monkeypatch.setitem(sys.modules, "doc_to_md", fake_doc_to_md)
        sys.modules.pop("run", None)
        run = importlib.import_module("run")

        run.cmd_doc_to_md([
            "--file",
            str(input_file),
            "--output-dir",
            str(output_dir),
            "--enhance-content",
        ])

        assert captured["argv"] == [
            "doc_to_md.py",
            "--output-dir",
            str(output_dir),
            "--file",
            str(input_file),
        ]

    def test_doc_to_md_enhance_content_emits_marker_from_output_file(self, monkeypatch, tmp_path, capsys):
        input_file = tmp_path / "需求说明.docx"
        input_file.write_bytes(b"fake")
        output_dir = tmp_path / "custom" / "PRODUCT_DESIGN"
        output_dir.mkdir(parents=True)

        fake_doc_to_md = types.SimpleNamespace()
        fake_doc_to_md.main = lambda: print("OUTPUT_FILE=/tmp/custom/[PROD_ORI]需求说明.md")
        monkeypatch.setitem(sys.modules, "doc_to_md", fake_doc_to_md)
        sys.modules.pop("run", None)
        run = importlib.import_module("run")

        run.cmd_doc_to_md([
            "--file",
            str(input_file),
            "--output-dir",
            str(output_dir),
            "--enhance-content",
        ])

        captured = capsys.readouterr()
        assert "ENHANCE_CONTENT=true" in captured.out
        assert "ENHANCE_INPUT=/tmp/custom/[PROD_ORI]需求说明.md" in captured.out


class TestRunDocConvertCommand:
    """验证 run.py 的 doc-convert 默认输出目录推导。"""

    def test_doc_convert_url_uses_req_page_id_output_dir(self, monkeypatch, tmp_path):
        monkeypatch.chdir(tmp_path)
        captured = {}

        fake_doc_convert = types.SimpleNamespace()

        def fake_main():
            captured["argv"] = list(sys.argv)

        fake_doc_convert.main = fake_main
        fake_doc_convert.extract_page_id = lambda value: "441893759"
        monkeypatch.setitem(sys.modules, "doc_convert", fake_doc_convert)
        sys.modules.pop("run", None)
        run = importlib.import_module("run")
        run.cmd_newreq(["--reqid", "REQ-441893759", "--init-only"])

        run.cmd_doc_convert([
            "--url",
            "http://wiki.example.com/pages/viewpage.action?pageId=441893759",
            "--reqid",
            "REQ-441893759",
        ])

        assert captured["argv"] == [
            "doc_convert.py",
            "--output-dir",
            "newreq/REQ-441893759/PRODUCT_DESIGN",
            "--url",
            "http://wiki.example.com/pages/viewpage.action?pageId=441893759",
        ]

    def test_doc_convert_url_without_page_id_uses_generated_req_dir(self, monkeypatch, tmp_path):
        monkeypatch.chdir(tmp_path)
        captured = {}

        fake_doc_convert = types.SimpleNamespace()

        def fake_main():
            captured["argv"] = list(sys.argv)

        fake_doc_convert.main = fake_main

        def fail_extract(_value):
            raise ValueError("bad url")

        fake_doc_convert.extract_page_id = fail_extract
        monkeypatch.setitem(sys.modules, "doc_convert", fake_doc_convert)
        sys.modules.pop("run", None)
        run = importlib.import_module("run")
        run.cmd_newreq(["--reqid", "REQ-abcd1234", "--init-only"])
        monkeypatch.setattr(run.uuid, "uuid4", lambda: types.SimpleNamespace(hex="abcd1234efgh5678"))

        run.cmd_doc_convert(["--url", "http://wiki.example.com/no-page-id", "--reqid", "REQ-abcd1234"])

        assert captured["argv"] == [
            "doc_convert.py",
            "--output-dir",
            "newreq/REQ-abcd1234/PRODUCT_DESIGN",
            "--url",
            "http://wiki.example.com/no-page-id",
        ]

    def test_doc_convert_enhance_content_sets_chain_marker(self, monkeypatch, capsys, tmp_path):
        monkeypatch.chdir(tmp_path)
        fake_doc_convert = types.SimpleNamespace()

        def fake_main():
            output = tmp_path / "newreq" / "REQ-1" / "PRODUCT_DESIGN" / "[PROD_ORI]需求.md"
            output.write_text("![a](./images/a.png)\n", encoding="utf-8")
            print("OUTPUT_FILE=newreq/REQ-1/PRODUCT_DESIGN/[PROD_ORI]需求.md")

        fake_doc_convert.main = fake_main
        fake_doc_convert.extract_page_id = lambda value: "1"
        monkeypatch.setitem(sys.modules, "doc_convert", fake_doc_convert)
        sys.modules.pop("run", None)
        run = importlib.import_module("run")
        run.cmd_newreq(["--reqid", "REQ-1", "--init-only"])

        run.cmd_doc_convert([
            "--url",
            "http://wiki.example.com?pageId=1",
            "--reqid",
            "REQ-1",
            "--enhance-content",
        ])
        captured = capsys.readouterr()

        assert "ENHANCE_CONTENT=true" in captured.out
        assert "ENHANCE_INPUT=newreq/REQ-1/PRODUCT_DESIGN/[PROD_ORI]需求.md" in captured.out

    def test_doc_convert_enhance_content_requires_confirmation_for_many_images(self, monkeypatch, capsys, tmp_path):
        monkeypatch.chdir(tmp_path)
        fake_doc_convert = types.SimpleNamespace()

        def fake_main():
            output = tmp_path / "newreq" / "REQ-1" / "PRODUCT_DESIGN" / "[PROD_ORI]需求.md"
            images = "\n".join(f"![图{i}](./images/image-{i:03d}.png)" for i in range(1, 22))
            output.write_text(images + "\n", encoding="utf-8")
            print("OUTPUT_FILE=newreq/REQ-1/PRODUCT_DESIGN/[PROD_ORI]需求.md")

        fake_doc_convert.main = fake_main
        fake_doc_convert.extract_page_id = lambda value: "1"
        monkeypatch.setitem(sys.modules, "doc_convert", fake_doc_convert)
        sys.modules.pop("run", None)
        run = importlib.import_module("run")
        run.cmd_newreq(["--reqid", "REQ-1", "--init-only"])

        run.cmd_doc_convert([
            "--url",
            "http://wiki.example.com?pageId=1",
            "--reqid",
            "REQ-1",
            "--enhance-content",
        ])
        captured = capsys.readouterr()

        assert "IMAGE_ENHANCE_CONFIRM_REQUIRED=true" in captured.out
        assert "IMAGE_COUNT=21" in captured.out
        assert "ENHANCE_CONTENT=true" not in captured.out
        assert "图片数量较多" in captured.out



class TestRunEnhanceContentCommand:
    def test_enhance_content_forwards_rename_params(self, monkeypatch, tmp_path):
        """--rename 参数应原样透传给 content_enhancer。"""
        prod_ori = tmp_path / "[PROD_ORI]需求.md"
        prod_ori.write_text("![a](./images/a.png)\n", encoding="utf-8")
        captured = {}

        fake_content_enhancer = types.SimpleNamespace()

        def fake_main():
            captured["argv"] = list(sys.argv)

        fake_content_enhancer.main = fake_main
        monkeypatch.setitem(sys.modules, "content_enhancer", fake_content_enhancer)
        sys.modules.pop("run", None)
        run = importlib.import_module("run")

        run.cmd_enhance_content([
            "--input", str(prod_ori),
            "--rename", "./images/a.png", "./images/[原型图]列表页-01.png",
        ])

        assert captured["argv"] == [
            "content_enhancer.py",
            "--input", str(prod_ori),
            "--rename", "./images/a.png", "./images/[原型图]列表页-01.png",
        ]

    def test_enhance_content_forwards_keep_params(self, monkeypatch, tmp_path):
        """--keep 参数应原样透传给 content_enhancer。"""
        prod_ori = tmp_path / "[PROD_ORI]需求.md"
        prod_ori.write_text("![b](./images/b.png)\n", encoding="utf-8")
        captured = {}

        fake_content_enhancer = types.SimpleNamespace()

        def fake_main():
            captured["argv"] = list(sys.argv)

        fake_content_enhancer.main = fake_main
        monkeypatch.setitem(sys.modules, "content_enhancer", fake_content_enhancer)
        sys.modules.pop("run", None)
        run = importlib.import_module("run")

        run.cmd_enhance_content([
            "--input", str(prod_ori),
            "--keep", "./images/b.png",
        ])

        assert captured["argv"] == [
            "content_enhancer.py",
            "--input", str(prod_ori),
            "--keep", "./images/b.png",
        ]

    def test_enhance_content_forwards_describe_params(self, monkeypatch, tmp_path):
        """--describe 参数应原样透传给 content_enhancer。"""
        prod_ori = tmp_path / "[PROD_ORI]需求.md"
        prod_ori.write_text("![a](./images/a.png)\n", encoding="utf-8")
        captured = {}

        fake_content_enhancer = types.SimpleNamespace()

        def fake_main():
            captured["argv"] = list(sys.argv)

        fake_content_enhancer.main = fake_main
        monkeypatch.setitem(sys.modules, "content_enhancer", fake_content_enhancer)
        sys.modules.pop("run", None)
        run = importlib.import_module("run")

        run.cmd_enhance_content([
            "--input", str(prod_ori),
            "--describe", "./images/a.png", "图片中可见客户列表页面。",
        ])

        assert captured["argv"] == [
            "content_enhancer.py",
            "--input", str(prod_ori),
            "--describe", "./images/a.png", "图片中可见客户列表页面。",
        ]


class TestDocConvertImageSemantics:
    def test_doc_convert_keeps_downloaded_image_name_in_markdown(self, tmp_path, monkeypatch):
        monkeypatch.setenv("HTSC_WIKI_TOKEN", "token")

        html = (
            "<h1>测试页面</h1>"
            "<h2>2.1.3 流程</h2>"
            '<img src="http://wiki.htzq.htsc.com.cn/download/attachments/1/审批流程图.png" alt="审批流程图" />'
        )

        mock_img_response = MagicMock()
        mock_img_response.status_code = 200
        mock_img_response.raise_for_status = MagicMock()
        mock_img_response.iter_content = MagicMock(return_value=[b"fake-image-bytes"])

        captured = {}

        def fake_to_markdown(converted_html):
            captured["html"] = converted_html
            return converted_html

        with patch("wiki_fetcher.fetch_wiki_content", return_value=html), \
             patch("requests.get", return_value=mock_img_response), \
             patch("doc_convert._fetch_page_title", return_value="测试页面"), \
             patch("markdowner.to_markdown", side_effect=fake_to_markdown):
            import doc_convert

            monkeypatch.setattr(sys, "argv", [
                "doc_convert.py",
                "--url", "1",
                "--output-dir", str(tmp_path),
            ])

            doc_convert.main()

        output_file = tmp_path / "[PROD_ORI]测试页面.md"
        content = output_file.read_text(encoding="utf-8")
        assert "./images/审批流程图.png" in captured["html"]
        assert "./images/审批流程图.png" in content


class TestWikiExportCommand:
    def test_wiki_export_filters_non_url_text_and_infers_tree_mode(self, monkeypatch):
        captured = {}

        fake_wiki_export = types.SimpleNamespace()

        def fake_main():
            captured["argv"] = list(sys.argv)

        fake_wiki_export.main = fake_main
        monkeypatch.setitem(sys.modules, "wiki_export", fake_wiki_export)
        sys.modules.pop("run", None)
        run = importlib.import_module("run")

        run.cmd_wiki_export([
            "http://wiki.example.com/pages/viewpage.action?pageId=400854702",
            "下载所有内容",
        ])

        assert captured["argv"] == [
            "wiki_export.py",
            "--mode",
            "tree",
            "http://wiki.example.com/pages/viewpage.action?pageId=400854702",
        ]
