#!/usr/bin/env python3
"""image_downloader：从 HTML 中提取并下载图片，替换为本地相对路径"""

import os
import re
import requests
from urllib.parse import urlparse
from bs4 import BeautifulSoup

BASE_URL = "http://wiki.htzq.htsc.com.cn"


def resolve_confluence_attachments(html: str, page_id: str, token: str) -> str:
    """
    将 Confluence Storage Format 中的 <ac:image> 标签替换为标准 <img src="..."> 标签。

    支持两种形式：
    1. <ac:image ...><ri:attachment ri:filename="xxx.png" .../></ac:image>  （本页附件）
    2. <ac:image ...><ri:url ri:value="http://..."/></ac:image>              （外部 URL）
    """
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}

    # 匹配整个 <ac:image>...</ac:image> 块（含嵌套属性，非贪婪）
    ac_image_pattern = re.compile(
        r'<ac:image[^>]*>(.*?)</ac:image>',
        re.IGNORECASE | re.DOTALL,
    )

    # 从内容块中提取 ri:attachment filename
    attachment_pattern = re.compile(
        r'<ri:attachment\s+ri:filename=["\']([^"\']+)["\']',
        re.IGNORECASE,
    )

    # 从内容块中提取 ri:url value
    url_pattern = re.compile(
        r'<ri:url\s+ri:value=["\']([^"\']+)["\']',
        re.IGNORECASE,
    )

    def replace_ac_image(match: re.Match) -> str:
        inner = match.group(1)

        # 优先处理 ri:url（外部图片，直接用 URL）
        url_m = url_pattern.search(inner)
        if url_m:
            src = url_m.group(1)
            return f'<img src="{src}" alt="image">'

        # 处理 ri:attachment（本页附件，需要查询下载 URL）
        att_m = attachment_pattern.search(inner)
        if att_m:
            filename = att_m.group(1)
            download_url = _get_attachment_url(page_id, filename, token, headers)
            if download_url:
                return f'<img src="{download_url}" alt="{filename}">'
            return f'<!-- attachment not found: {filename} -->'

        # 无法识别，保留原文
        return match.group(0)

    return ac_image_pattern.sub(replace_ac_image, html)


def _get_attachment_url(page_id: str, filename: str, token: str, headers: dict) -> str | None:
    """查询附件的下载 URL，失败返回 None。"""
    api_url = (
        f"{BASE_URL}/rest/api/content/{page_id}/child/attachment"
        f"?filename={requests.utils.quote(filename)}&expand=version"
    )
    try:
        resp = requests.get(api_url, headers=headers, timeout=10, proxies={"http": None, "https": None})
        if not resp.ok:
            return None
        results = resp.json().get("results", [])
        if not results:
            return None
        download_path = results[0].get("_links", {}).get("download", "")
        if download_path:
            return f"{BASE_URL}{download_path}"
    except Exception:
        pass
    return None


def download_images(html: str, output_dir: str, token: str, page_id: str = "") -> tuple[str, list[str], list[dict]]:
    """
    从 HTML 中提取图片 URL，下载到 output_dir/images/，
    将 HTML 中的图片引用替换为 ./images/<filename>。

    Args:
        html: 原始 HTML 字符串（可包含 Confluence Storage Format 的 <ac:image> 标签）
        output_dir: 输出目录（图片保存到 output_dir/images/）
        token: Bearer Token，用于认证 Confluence 图片请求
        page_id: Confluence 页面 ID，用于查询附件下载 URL（处理 <ac:image> 时必填）

    Returns:
        (替换后的 HTML, 失败的图片 URL 列表, 图片记录列表)
    """
    # 第一步：将 Confluence <ac:image> 附件标签转换为标准 <img src="..."> 标签
    if page_id:
        html = resolve_confluence_attachments(html, page_id, token)

    images_dir = os.path.join(output_dir, "images")
    os.makedirs(images_dir, exist_ok=True)
    contexts = _collect_image_contexts(html)

    # 提取所有 <img> 标签的 src 属性
    img_pattern = re.compile(r'(<img\b[^>]*\bsrc=["\'])([^"\']+)(["\'][^>]*>)', re.IGNORECASE)
    failed_urls: list[str] = []
    image_records: list[dict] = []
    context_index = 0

    def replace_img(match: re.Match) -> str:
        nonlocal context_index
        prefix = match.group(1)
        src_url = match.group(2)
        suffix = match.group(3)

        # 跳过 data URI
        if src_url.startswith("data:"):
            return match.group(0)

        filename = _extract_filename(src_url)
        local_path = os.path.join(images_dir, filename)

        success = _download_file(src_url, local_path, token)
        if success:
            context = contexts[context_index] if context_index < len(contexts) else {}
            context_index += 1
            image_records.append({
                "original_url": src_url,
                "original_filename": filename,
                "local_filename": filename,
                "local_path": local_path,
                "local_src": f"./images/{filename}",
                "alt": context.get("alt", ""),
                "nearest_heading": context.get("nearest_heading", ""),
                "section_hint": context.get("section_hint", ""),
                "nearby_text": context.get("nearby_text", ""),
            })
            return f"{prefix}./images/{filename}{suffix}"
        else:
            failed_urls.append(src_url)
            return match.group(0)  # 保留原始 URL

    updated_html = img_pattern.sub(replace_img, html)
    return updated_html, failed_urls, image_records


def _collect_image_contexts(html: str) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")
    contexts: list[dict] = []
    current_heading = ""

    for tag in soup.descendants:
        if getattr(tag, "name", None) and re.fullmatch(r"h[1-6]", tag.name, re.IGNORECASE):
            current_heading = tag.get_text(" ", strip=True)
        if getattr(tag, "name", None) == "img":
            contexts.append({
                "alt": tag.get("alt", ""),
                "nearest_heading": current_heading,
                "section_hint": current_heading,
                "nearby_text": _extract_nearby_text(tag),
            })

    return contexts


def _extract_nearby_text(tag) -> str:
    parent_text = ""
    if getattr(tag, "parent", None):
        parent_text = tag.parent.get_text(" ", strip=True)
    previous = tag.find_previous(["p", "li", "td", "th"])
    next_el = tag.find_next(["p", "li", "td", "th"])
    parts = [
        previous.get_text(" ", strip=True) if previous else "",
        parent_text,
        next_el.get_text(" ", strip=True) if next_el else "",
    ]
    text = " ".join(part for part in parts if part)
    return re.sub(r"\s+", " ", text).strip()[:80]


def _extract_filename(url: str) -> str:
    """从 URL 中提取文件名（最后一段路径），去除查询参数。"""
    parsed = urlparse(url)
    path = parsed.path
    filename = path.split("/")[-1] if "/" in path else path
    # 去除空文件名情况
    if not filename:
        filename = "image"
    return filename


def _download_file(url: str, dest_path: str, token: str) -> bool:
    """下载文件到 dest_path，使用 Bearer Token 认证，绕过系统代理。"""
    headers = {"Authorization": f"Bearer {token}"}
    try:
        response = requests.get(url, headers=headers, timeout=30, stream=True,
                                proxies={"http": None, "https": None})
        response.raise_for_status()
        with open(dest_path, "wb") as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
        return True
    except Exception:
        return False
