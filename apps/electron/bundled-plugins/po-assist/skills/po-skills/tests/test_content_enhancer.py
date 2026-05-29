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
    def test_main_with_describe_inserts_after_standalone_image(self, tmp_path, monkeypatch, capsys):
        """--describe 应在独立图片后插入可幂等更新的说明块。"""
        doc = tmp_path / "[PROD_ORI]需求.md"
        doc.write_text(
            "正文开始。\n\n![截图](./images/a.png)\n\n正文结束。\n",
            encoding="utf-8",
        )

        monkeypatch.setattr(sys, "argv", [
            "content_enhancer.py",
            "--input", str(doc),
            "--describe", "./images/a.png", "图片中可见客户列表页面和编辑按钮。",
        ])
        main()

        content = doc.read_text(encoding="utf-8")
        assert (
            "![截图](./images/a.png)\n\n"
            "<!-- image-desc:start ./images/a.png -->\n"
            "> 图片内容提取：图片中可见客户列表页面和编辑按钮。\n"
            "<!-- image-desc:end -->\n\n"
            "正文结束。"
        ) in content
        out = capsys.readouterr().out
        assert "DESCRIBED=1" in out
        assert "DESCRIPTIONS_UPDATED=1" in out

    def test_main_with_describe_updates_existing_block_without_duplicate(self, tmp_path, monkeypatch):
        """重复执行 --describe 应更新已有说明块，而不是重复插入。"""
        doc = tmp_path / "[PROD_ORI]需求.md"
        doc.write_text(
            "![截图](./images/a.png)\n\n"
            "<!-- image-desc:start ./images/a.png -->\n"
            "> 图片内容提取：旧说明。\n"
            "<!-- image-desc:end -->\n",
            encoding="utf-8",
        )

        monkeypatch.setattr(sys, "argv", [
            "content_enhancer.py",
            "--input", str(doc),
            "--describe", "./images/a.png", "新说明。",
        ])
        main()

        content = doc.read_text(encoding="utf-8")
        assert content.count("<!-- image-desc:start ./images/a.png -->") == 1
        assert "> 图片内容提取：新说明。\n" in content
        assert "旧说明" not in content

    def test_main_with_describe_inserts_after_markdown_table(self, tmp_path, monkeypatch):
        """表格内图片的说明块应插入到表格结束后，避免破坏表格结构。"""
        doc = tmp_path / "[PROD_ORI]需求.md"
        doc.write_text(
            "| 页面 | 截图 |\n"
            "| --- | --- |\n"
            "| 客户 | ![截图](./images/a.png) |\n"
            "\n"
            "后续段落。\n",
            encoding="utf-8",
        )

        monkeypatch.setattr(sys, "argv", [
            "content_enhancer.py",
            "--input", str(doc),
            "--describe", "./images/a.png", "图片中可见客户页面。",
        ])
        main()

        assert doc.read_text(encoding="utf-8") == (
            "| 页面 | 截图 |\n"
            "| --- | --- |\n"
            "| 客户 | ![截图](./images/a.png) |\n"
            "\n"
            "<!-- image-desc:start ./images/a.png -->\n"
            "> 图片内容提取：图片中可见客户页面。\n"
            "<!-- image-desc:end -->\n"
            "\n"
            "后续段落。\n"
        )

    def test_main_with_describe_inserts_after_inline_image_paragraph(self, tmp_path, monkeypatch):
        """行内图片的说明块应插入到所在段落后，而不是句子中间。"""
        doc = tmp_path / "[PROD_ORI]需求.md"
        doc.write_text(
            "段落前半部分 ![截图](./images/a.png) 段落后半部分。\n\n下一段。\n",
            encoding="utf-8",
        )

        monkeypatch.setattr(sys, "argv", [
            "content_enhancer.py",
            "--input", str(doc),
            "--describe", "./images/a.png", "图片中可见编辑弹窗。",
        ])
        main()

        assert doc.read_text(encoding="utf-8") == (
            "段落前半部分 ![截图](./images/a.png) 段落后半部分。\n\n"
            "<!-- image-desc:start ./images/a.png -->\n"
            "> 图片内容提取：图片中可见编辑弹窗。\n"
            "<!-- image-desc:end -->\n"
            "\n"
            "下一段。\n"
        )

    def test_main_with_describe_handles_same_image_multiple_occurrences(self, tmp_path, monkeypatch):
        """同一路径图片出现多次时，每个出现位置都应插入说明块。"""
        doc = tmp_path / "[PROD_ORI]需求.md"
        doc.write_text(
            "![图一](./images/a.png)\n\n"
            "中间文本。\n\n"
            "![图二](./images/a.png)\n",
            encoding="utf-8",
        )

        monkeypatch.setattr(sys, "argv", [
            "content_enhancer.py",
            "--input", str(doc),
            "--describe", "./images/a.png", "图片中可见相同页面。",
        ])
        main()

        content = doc.read_text(encoding="utf-8")
        assert content.count("<!-- image-desc:start ./images/a.png -->") == 2
        assert content.count("> 图片内容提取：图片中可见相同页面。") == 2

    def test_main_with_rename_and_describe_uses_final_path(self, tmp_path, monkeypatch):
        """图片重命名后，说明块应按最终图片路径插入。"""
        doc = tmp_path / "[PROD_ORI]需求.md"
        images = tmp_path / "images"
        images.mkdir()
        (images / "a.png").write_bytes(b"fake")
        doc.write_text("![截图](./images/a.png)\n", encoding="utf-8")

        monkeypatch.setattr(sys, "argv", [
            "content_enhancer.py",
            "--input", str(doc),
            "--rename", "./images/a.png", "./images/[原型图]客户列表页面-01.png",
            "--describe", "./images/[原型图]客户列表页面-01.png", "图片中可见客户列表页面。",
        ])
        main()

        content = doc.read_text(encoding="utf-8")
        assert "![截图](./images/[原型图]客户列表页面-01.png)" in content
        assert "<!-- image-desc:start ./images/[原型图]客户列表页面-01.png -->" in content
        assert "<!-- image-desc:start ./images/a.png -->" not in content

    def test_main_with_describe_tracks_conflict_adjusted_rename_target(self, tmp_path, monkeypatch):
        """目标文件名冲突自动改名时，说明块应跟随实际最终路径。"""
        doc = tmp_path / "[PROD_ORI]需求.md"
        images = tmp_path / "images"
        images.mkdir()
        (images / "a.png").write_bytes(b"fake")
        (images / "[原型图]客户列表页面-01.png").write_bytes(b"existing")
        doc.write_text("![截图](./images/a.png)\n", encoding="utf-8")

        monkeypatch.setattr(sys, "argv", [
            "content_enhancer.py",
            "--input", str(doc),
            "--rename", "./images/a.png", "./images/[原型图]客户列表页面-01.png",
            "--describe", "./images/[原型图]客户列表页面-01.png", "图片中可见客户列表页面。",
        ])
        main()

        content = doc.read_text(encoding="utf-8")
        assert "![截图](./images/[原型图]客户列表页面-02.png)" in content
        assert "<!-- image-desc:start ./images/[原型图]客户列表页面-02.png -->" in content
        assert "<!-- image-desc:start ./images/[原型图]客户列表页面-01.png -->" not in content

    def test_main_with_describe_missing_path_reports_failure_but_continues(self, tmp_path, monkeypatch, capsys):
        """--describe 路径不存在于 Markdown 时应计入失败但不中断。"""
        doc = tmp_path / "[PROD_ORI]需求.md"
        doc.write_text("![截图](./images/a.png)\n", encoding="utf-8")

        monkeypatch.setattr(sys, "argv", [
            "content_enhancer.py",
            "--input", str(doc),
            "--describe", "./images/missing.png", "图片中可见内容。",
        ])
        main()

        out = capsys.readouterr().out
        assert "DESCRIBED=0" in out
        assert "FAILED=1" in out
        assert "DESCRIPTIONS_UPDATED=0" in out

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
