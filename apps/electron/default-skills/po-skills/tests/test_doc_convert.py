"""
单元测试：doc_convert.py 中的 extract_page_id 和 save_markdown
"""
import os
import sys
import pytest

# 将 scripts 目录加入 path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))

from doc_convert import extract_page_id, save_markdown


# ─── extract_page_id ────────────────────────────────────────────────────────

class TestExtractPageId:
    """测试 extract_page_id 函数"""

    # 纯数字
    def test_pure_digits(self):
        assert extract_page_id("123456") == "123456"

    def test_pure_digits_with_spaces(self):
        assert extract_page_id("  789012  ") == "789012"

    # 完整 URL 含 pageId 参数
    def test_full_url_with_page_id(self):
        url = "http://wiki.htzq.htsc.com.cn/pages/viewpage.action?pageId=12345678"
        assert extract_page_id(url) == "12345678"

    def test_url_with_multiple_params(self):
        url = "http://wiki.htzq.htsc.com.cn/pages/viewpage.action?spaceKey=PM&pageId=99887766"
        assert extract_page_id(url) == "99887766"

    def test_https_url(self):
        url = "https://wiki.example.com/pages/viewpage.action?pageId=55443322"
        assert extract_page_id(url) == "55443322"

    # 无效输入
    def test_empty_string_raises(self):
        with pytest.raises(ValueError):
            extract_page_id("")

    def test_non_numeric_string_raises(self):
        with pytest.raises(ValueError):
            extract_page_id("abc")

    def test_url_without_page_id_raises(self):
        with pytest.raises(ValueError):
            extract_page_id("http://wiki.example.com/pages/viewpage.action?spaceKey=PM")

    def test_url_with_non_numeric_page_id_raises(self):
        with pytest.raises(ValueError):
            extract_page_id("http://wiki.example.com/pages/viewpage.action?pageId=abc")

    # 幂等性：从 URL 提取的 id 与直接传入纯数字结果相同
    def test_idempotent_url_vs_plain_id(self):
        page_id = "87654321"
        url = f"http://wiki.htzq.htsc.com.cn/pages/viewpage.action?pageId={page_id}"
        assert extract_page_id(url) == extract_page_id(page_id)


# ─── save_markdown ───────────────────────────────────────────────────────────

class TestSaveMarkdown:
    """测试 save_markdown 函数"""

    def test_filename_prefix_nl(self, tmp_path):
        path = save_markdown("# Hello", "MyDoc", str(tmp_path))
        assert os.path.basename(path) == "[PROD_ORI]MyDoc.md"

    def test_filename_extension_md(self, tmp_path):
        path = save_markdown("content", "SomeTitle", str(tmp_path))
        assert path.endswith(".md")

    def test_file_content_written(self, tmp_path):
        content = "# Title\n\nSome content here."
        path = save_markdown(content, "TestDoc", str(tmp_path))
        with open(path, encoding="utf-8") as f:
            assert f.read() == content

    def test_returns_full_path(self, tmp_path):
        path = save_markdown("x", "Doc", str(tmp_path))
        assert os.path.isabs(path) or path.startswith(str(tmp_path))

    def test_rejects_missing_output_dir(self, tmp_path):
        new_dir = str(tmp_path / "subdir" / "nested")
        with pytest.raises(FileNotFoundError):
            save_markdown("content", "Title", new_dir)

    def test_title_with_spaces(self, tmp_path):
        path = save_markdown("content", "My Document Title", str(tmp_path))
        assert os.path.basename(path) == "[PROD_ORI]My Document Title.md"

    def test_chinese_title(self, tmp_path):
        path = save_markdown("内容", "产品需求文档", str(tmp_path))
        assert os.path.basename(path) == "[PROD_ORI]产品需求文档.md"
