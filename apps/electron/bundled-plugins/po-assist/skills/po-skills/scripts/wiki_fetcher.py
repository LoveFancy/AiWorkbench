import requests
import subprocess
import logging
import json
import socket
import os

BASE_URL = 'http://wiki.htzq.htsc.com.cn'

class WikiFetcherError(Exception):
    pass

def fetch_wiki_content(token: str, page_id: str) -> str:
    """
    拉取Confluence WIKI内容（Storage Format）
    :param token: 用户Token
    :param page_id: WIKI页面ID
    :return: HTML内容字符串
    :raises WikiFetcherError: 认证失败、页面不存在、网络异常等
    """
    url = f"{BASE_URL}/rest/api/content/{page_id}?expand=body.storage"
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    }
    try:
        # proxies={"http": None, "https": None} 绕过系统代理，与 curl 行为一致
        resp = requests.get(url, headers=headers, timeout=10, proxies={"http": None, "https": None})
        logging.info("Confluence API 状态码: %s", resp.status_code)
        if resp.status_code == 401 or resp.status_code == 403:
            raise WikiFetcherError("认证失败：Token无效或无权限")
        if resp.status_code == 404:
            raise WikiFetcherError("页面不存在或无访问权限")
        if not resp.ok:
            raise WikiFetcherError(f"Confluence API错误: {resp.status_code} {resp.reason}")
        if resp.headers.get("Content-Type", "").startswith("application/json"):
            data = resp.json()
            html = data.get('body', {}).get('storage', {}).get('value')
            if html:
                logging.info("成功获取WIKI内容，长度: %d", len(html))
                return html
        logging.warning("requests返回非JSON或未获取到内容，尝试用curl兜底")
    except WikiFetcherError:
        raise
    except Exception as e:
        logging.warning("requests异常，尝试用curl兜底: %s", e)

    # curl兜底
    cmd = ["curl", "-s", "-H", f"Authorization: Bearer {token}", url]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', timeout=15)
        curl_output = result.stdout
        data = json.loads(curl_output)
        html = data.get('body', {}).get('storage', {}).get('value')
        if html:
            logging.info("curl兜底成功获取WIKI内容，长度: %d", len(html))
            return html
        raise WikiFetcherError("curl兜底未获取到storage.value")
    except WikiFetcherError:
        raise
    except Exception as e:
        err_msg = curl_output if 'curl_output' in locals() else (result.stderr if 'result' in locals() else '')
        logging.error("curl兜底也失败: %s, 返回内容: %s", e, err_msg)
        raise WikiFetcherError(f"无法获取WIKI内容: {e}")
