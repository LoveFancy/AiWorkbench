"""
单元测试：image_downloader.py 中的 download_images
使用 unittest.mock 模拟 HTTP 请求，不真实调用网络
"""
import os
import sys
import pytest
from unittest.mock import patch, MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))

from image_downloader import download_images, _extract_filename


# ─── _extract_filename ───────────────────────────────────────────────────────

class TestExtractFilename:
    def test_simple_url(self):
        assert _extract_filename("http://example.com/images/photo.png") == "photo.png"

    def test_url_with_query(self):
        # 查询参数不应出现在文件名中
        name = _extract_filename("http://example.com/img/pic.jpg?v=123")
        assert name == "pic.jpg"

    def test_url_no_path(self):
        name = _extract_filename("http://example.com/")
        # 空路径 fallback 为 "image"
        assert name == "image"


# ─── download_images ─────────────────────────────────────────────────────────

def _make_response(status_code=200, content=b"fake_image_data"):
    """构造一个模拟的 requests.Response"""
    mock_resp = MagicMock()
    mock_resp.status_code = status_code
    mock_resp.raise_for_status = MagicMock()
    if status_code >= 400:
        from requests.exceptions import HTTPError
        mock_resp.raise_for_status.side_effect = HTTPError(f"{status_code}")
    mock_resp.iter_content = MagicMock(return_value=[content])
    return mock_resp


class TestDownloadImages:
    """测试 download_images 函数"""

    HTML_ONE_IMG = '<img src="http://wiki.example.com/images/diagram.png" alt="test">'
    HTML_TWO_IMGS = (
        '<img src="http://wiki.example.com/a.png">'
        '<img src="http://wiki.example.com/b.jpg">'
    )
    HTML_NO_IMG = "<p>No images here</p>"

    # ── 成功场景 ──────────────────────────────────────────────────────────────

    def test_success_replaces_src(self, tmp_path):
        with patch("image_downloader.requests.get", return_value=_make_response()):
            updated_html, failed, records = download_images(
                self.HTML_ONE_IMG, str(tmp_path), "token123"
            )
        assert "./images/diagram.png" in updated_html
        assert failed == []
        assert records[0]["original_filename"] == "diagram.png"
        assert records[0]["local_src"] == "./images/diagram.png"

    def test_success_saves_file(self, tmp_path):
        with patch("image_downloader.requests.get", return_value=_make_response()):
            download_images(self.HTML_ONE_IMG, str(tmp_path), "token123")
        assert os.path.exists(tmp_path / "images" / "diagram.png")

    def test_success_multiple_images(self, tmp_path):
        with patch("image_downloader.requests.get", return_value=_make_response()):
            updated_html, failed, records = download_images(
                self.HTML_TWO_IMGS, str(tmp_path), "token123"
            )
        assert "./images/a.png" in updated_html
        assert "./images/b.jpg" in updated_html
        assert failed == []
        assert len(records) == 2

    def test_no_images_returns_unchanged(self, tmp_path):
        with patch("image_downloader.requests.get") as mock_get:
            updated_html, failed, records = download_images(
                self.HTML_NO_IMG, str(tmp_path), "token123"
            )
        mock_get.assert_not_called()
        assert updated_html == self.HTML_NO_IMG
        assert failed == []
        assert records == []

    # ── 失败场景 ──────────────────────────────────────────────────────────────

    def test_failure_preserves_original_url(self, tmp_path):
        with patch("image_downloader.requests.get", side_effect=Exception("timeout")):
            updated_html, failed, records = download_images(
                self.HTML_ONE_IMG, str(tmp_path), "token123"
            )
        # 原始 URL 应保留
        assert "http://wiki.example.com/images/diagram.png" in updated_html
        assert len(failed) == 1
        assert "http://wiki.example.com/images/diagram.png" in failed
        assert records == []

    def test_failure_http_error(self, tmp_path):
        with patch("image_downloader.requests.get", return_value=_make_response(404)):
            updated_html, failed, records = download_images(
                self.HTML_ONE_IMG, str(tmp_path), "token123"
            )
        assert "http://wiki.example.com/images/diagram.png" in updated_html
        assert len(failed) == 1
        assert records == []

    # ── 混合场景 ──────────────────────────────────────────────────────────────

    def test_mixed_success_and_failure(self, tmp_path):
        from requests.exceptions import HTTPError

        def side_effect(url, **kwargs):
            if "a.png" in url:
                return _make_response(200)
            raise Exception("network error")

        with patch("image_downloader.requests.get", side_effect=side_effect):
            updated_html, failed, records = download_images(
                self.HTML_TWO_IMGS, str(tmp_path), "token123"
            )

        assert "./images/a.png" in updated_html
        assert "http://wiki.example.com/b.jpg" in updated_html  # 保留原始
        assert len(failed) == 1
        assert "b.jpg" in failed[0]
        assert len(records) == 1

    # ── data URI 跳过 ─────────────────────────────────────────────────────────

    def test_data_uri_skipped(self, tmp_path):
        html = '<img src="data:image/png;base64,abc123">'
        with patch("image_downloader.requests.get") as mock_get:
            updated_html, failed, records = download_images(html, str(tmp_path), "token123")
        mock_get.assert_not_called()
        assert "data:image/png;base64,abc123" in updated_html
        assert failed == []
        assert records == []

    # ── Bearer Token 传递 ─────────────────────────────────────────────────────

    def test_bearer_token_sent(self, tmp_path):
        with patch("image_downloader.requests.get", return_value=_make_response()) as mock_get:
            download_images(self.HTML_ONE_IMG, str(tmp_path), "my_secret_token")
        call_kwargs = mock_get.call_args[1]
        assert call_kwargs["headers"]["Authorization"] == "Bearer my_secret_token"
