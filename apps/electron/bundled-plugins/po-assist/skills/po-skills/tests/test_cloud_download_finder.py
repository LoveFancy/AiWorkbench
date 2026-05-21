import os
import sys
import time
from pathlib import Path

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))

import cloud_download_finder as finder


def test_title_match_returns_download(tmp_path):
    downloaded = tmp_path / "【只读】AI赋能研发项目周报0417.docx"
    downloaded.write_bytes(b"content")

    result = finder.find_downloaded_file(
        download_dir=tmp_path,
        expected_title="【只读】AI赋能研发项目周报0417",
        timeout_seconds=1,
        poll_interval=0,
    )

    assert result == downloaded


def test_wait_ignores_temp_download_suffix(tmp_path):
    (tmp_path / "report.docx.crdownload").write_bytes(b"partial")

    with pytest.raises(finder.DownloadTimeout):
        finder.find_downloaded_file(
            download_dir=tmp_path,
            expected_title="report",
            timeout_seconds=0,
            poll_interval=0,
        )


def test_ambiguous_candidates_raise(tmp_path):
    (tmp_path / "a.docx").write_bytes(b"a")
    (tmp_path / "b.docx").write_bytes(b"b")

    with pytest.raises(finder.DownloadAmbiguous) as exc:
        finder.find_downloaded_file(
            download_dir=tmp_path,
            expected_title="unknown",
            timeout_seconds=1,
            poll_interval=0,
        )

    assert "a.docx" in str(exc.value)
    assert "b.docx" in str(exc.value)


def test_modified_file_can_match(tmp_path):
    existing = tmp_path / "周报.docx"
    existing.write_bytes(b"old")
    time.sleep(0.01)
    existing.write_bytes(b"new")

    result = finder.find_downloaded_file(
        download_dir=tmp_path,
        expected_title="周报",
        timeout_seconds=1,
        poll_interval=0,
    )

    assert result == existing
