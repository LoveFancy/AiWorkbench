"""测试：content_enhancer.py

流程：
  AI 构造 --rename / --keep 参数 → 脚本执行图片物理重命名 + 更新 Markdown 链接
"""
import os
import sys

import pytest

SCRIPTS_DIR = os.path.join(os.path.dirname(__file__), "..", "scripts")
sys.path.insert(0, os.path.abspath(SCRIPTS_DIR))

from content_enhancer import apply_renames, main, RenameResult


# ---------------------------------------------------------------------------
# apply_renames
# ---------------------------------------------------------------------------

class TestApplyRenames:
    def test_renames_file_and_updates_status(self, tmp_path):
        images = tmp_path / "images"
        images.mkdir()
        src = images / "old.png"
        src.write_bytes(b"fake")

        results = [RenameResult(
            original="./images/old.png",
            target="./images/[原型图]新名称-01.png",
            status="pending",
        )]
        apply_renames(str(tmp_path), results)

        assert results[0].status == "已重命名"
        assert (images / "[原型图]新名称-01.png").exists()
        assert not src.exists()

    def test_skip_keep_status(self, tmp_path):
        images = tmp_path / "images"
        images.mkdir()
        f = images / "keep.png"
        f.write_bytes(b"fake")

        results = [RenameResult(original="./images/keep.png", target="./images/keep.png", status="保留原名")]
        apply_renames(str(tmp_path), results)

        assert f.exists()
        assert results[0].status == "保留原名"

    def test_same_src_dst_becomes_keep(self, tmp_path):
        images = tmp_path / "images"
        images.mkdir()
        f = images / "a.png"
        f.write_bytes(b"fake")

        results = [RenameResult(original="./images/a.png", target="./images/a.png", status="pending")]
        apply_renames(str(tmp_path), results)

        assert results[0].status == "保留原名"

    def test_missing_source_marked_failed(self, tmp_path):
        results = [RenameResult(
            original="./images/missing.png",
            target="./images/new.png",
            status="pending",
        )]
        apply_renames(str(tmp_path), results)

        assert "处理失败" in results[0].status

    def test_conflict_target_gets_sequence_suffix(self, tmp_path):
        images = tmp_path / "images"
        images.mkdir()
        src = images / "a.png"
        src.write_bytes(b"src")
        conflict = images / "[原型图]页面-01.png"
        conflict.write_bytes(b"existing")

        results = [RenameResult(
            original="./images/a.png",
            target="./images/[原型图]页面-01.png",
            status="pending",
        )]
        apply_renames(str(tmp_path), results)

        assert (images / "[原型图]页面-02.png").exists()
        assert conflict.read_bytes() == b"existing"
        assert results[0].status == "已重命名"


# ---------------------------------------------------------------------------
# main（CLI 入口）
# ---------------------------------------------------------------------------

class TestMain:
    def test_main_with_rename_param(self, tmp_path, monkeypatch, capsys):
        """--rename 参数直接传入，应正确执行重命名。"""
        doc = tmp_path / "[PROD_ORI]需求.md"
        images = tmp_path / "images"
        images.mkdir()
        (images / "a.png").write_bytes(b"fake")
        doc.write_text("![截图](./images/a.png)\n", encoding="utf-8")

        monkeypatch.setattr(sys, "argv", [
            "content_enhancer.py",
            "--input", str(doc),
            "--rename", "./images/a.png", "./images/[原型图]列表页-01.png",
        ])
        main()

        assert (images / "[原型图]列表页-01.png").exists()
        out = capsys.readouterr().out
        assert "RENAMED=1" in out

    def test_main_with_keep_param(self, tmp_path, monkeypatch, capsys):
        """--keep 参数传入，应正常完成、文件保留不变。"""
        doc = tmp_path / "[PROD_ORI]需求.md"
        images = tmp_path / "images"
        images.mkdir()
        (images / "b.png").write_bytes(b"fake")
        doc.write_text("![截图](./images/b.png)\n", encoding="utf-8")

        monkeypatch.setattr(sys, "argv", [
            "content_enhancer.py",
            "--input", str(doc),
            "--keep", "./images/b.png",
        ])
        main()

        assert (images / "b.png").exists()
        out = capsys.readouterr().out
        assert "KEPT=1" in out

    def test_main_exits_without_params(self, tmp_path, monkeypatch):
        """不传 --rename 或 --keep 时应以非零退出码退出。"""
        doc = tmp_path / "[PROD_ORI]需求.md"
        doc.write_text("", encoding="utf-8")

        monkeypatch.setattr(sys, "argv", [
            "content_enhancer.py",
            "--input", str(doc),
        ])
        with pytest.raises(SystemExit) as exc_info:
            main()
        assert exc_info.value.code != 0
