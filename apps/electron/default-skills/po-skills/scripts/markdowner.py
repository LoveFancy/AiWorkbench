"""Confluence Storage Format HTML → Markdown 转换器

使用 markdownify 作为底层引擎，并注册 Confluence 私有标签（ac:*、ri:*）的处理逻辑。
参考 confluence-markdown-exporter 的实现思路（MIT License）。
"""

from __future__ import annotations

import logging
import os
import re

from markdownify import ATX, MarkdownConverter


class MarkdownerError(Exception):
    pass


class ConfluenceConverter(MarkdownConverter):
    """
    针对 Confluence Storage Format 的 markdownify 扩展。

    处理以下 Confluence 私有标签：
    - ac:task-list / ac:task / ac:task-body / ac:task-id / ac:task-status
    - ac:placeholder（模板占位文字，丢弃）
    - ac:parameter（宏参数，丢弃）
    - ac:structured-macro（宏容器，保留内部 rich-text-body 内容）
    - ac:rich-text-body（保留内容）
    - ac:image（转为 Markdown 图片引用）
    - ri:attachment / ri:url（提取图片路径）
    - ac:link / ri:page（转为文字链接）
    """

    class DefaultOptions(MarkdownConverter.DefaultOptions):
        bullets = "-"
        heading_style = ATX

    # ------------------------------------------------------------------
    # 任务列表
    # ------------------------------------------------------------------

    def convert_ac_task_list(self, el, text, parent_tags):
        return f"\n{text}\n"

    def convert_ac_task(self, el, text, parent_tags):
        content = text.strip()
        if not content:
            return ""
        return f"- [ ] {content}\n"

    def convert_ac_task_body(self, el, text, parent_tags):
        return text.strip()

    def convert_ac_task_id(self, el, text, parent_tags):
        return ""

    def convert_ac_task_status(self, el, text, parent_tags):
        return ""

    def convert_ac_placeholder(self, el, text, parent_tags):
        return ""

    def convert_ac_parameter(self, el, text, parent_tags):
        return ""

    def convert_ac_structured_macro(self, el, text, parent_tags):
        macro_name = el.get("ac:name", "")
        if macro_name == "toc":
            return ""
        if macro_name == "status":
            title_param = el.find("ac:parameter", {"ac:name": "title"})
            if title_param:
                return f"`{title_param.get_text(strip=True)}`"
            return text
        return text

    def convert_ac_rich_text_body(self, el, text, parent_tags):
        return text

    def convert_ac_image(self, el, text, parent_tags):
        # ac:image 应该已经被 image_downloader 预处理为 <img src="./images/...">
        # 如果还有残留（本地 JSON 模式无 token 时），尝试提取文件名作为 fallback
        attachment = el.find("ri:attachment")
        if attachment:
            filename = attachment.get("ri:filename", "image")
            return f"![{filename}](images/{filename})"
        ri_url = el.find("ri:url")
        if ri_url:
            url = ri_url.get("ri:value", "")
            return f"![image]({url})"
        return ""

    def convert_img(self, el, text, parent_tags):
        """处理标准 <img> 标签，保留 image_downloader 替换后的本地路径。"""
        src = el.get("src", "")
        alt = el.get("alt", "")
        if not src:
            return ""
        return f"![{alt}]({src})"

    def convert_ac_link(self, el, text, parent_tags):
        ri_page = el.find("ri:page")
        if ri_page:
            title = ri_page.get("ri:content-title", "")
            space_key = ri_page.get("ri:space-key", "")
            # 尝试从环境变量获取 wiki base url 拼接链接
            base_url = os.environ.get("HTSC_WIKI_BASE_URL", "http://wiki.htzq.htsc.com.cn")
            if space_key:
                url = f"{base_url}/display/{space_key}/{title.replace(' ', '+')}"
            else:
                url = f"{base_url}/pages/viewpage.action?title={title.replace(' ', '+')}"
            display = text.strip() or title
            return f"[{display}]({url})" if display else ""
        ri_att = el.find("ri:attachment")
        if ri_att:
            filename = ri_att.get("ri:filename", "attachment")
            return f"[{filename}]({filename})"
        # 兜底：保留链接文字
        return text.strip() if text.strip() else ""

    def convert_ri_attachment(self, el, text, parent_tags):
        return ""

    def convert_ri_page(self, el, text, parent_tags):
        return ""

    def convert_ri_url(self, el, text, parent_tags):
        return ""

    def convert_s(self, el, text, parent_tags):
        """删除线内容（<s> / <del>）视为已废弃内容，直接丢弃。"""
        return ""

    def convert_del(self, el, text, parent_tags):
        """删除线内容（<del>）视为已废弃内容，直接丢弃。"""
        return ""


def to_markdown(html: str) -> str:
    """
    将 Confluence Storage Format HTML 转换为 Markdown。

    使用 ConfluenceConverter（基于 markdownify）处理 ac:* / ri:* 私有标签。
    """
    try:
        result = ConfluenceConverter().convert(html)
        # 清理多余空行（markdownify 有时会产生 3+ 个连续空行）
        result = re.sub(r'\n{3,}', '\n\n', result)
        # 删除线内容（~~text~~）视为已废弃，直接移除
        result = re.sub(r'~~.+?~~', '', result)
        logging.info("转换成功，输入 HTML 长度: %d，输出 Markdown 长度: %d", len(html), len(result))
        return result.strip()
    except Exception as e:
        logging.error("转换失败: %s", e, exc_info=True)
        raise MarkdownerError(f"转换失败: {e}") from e
