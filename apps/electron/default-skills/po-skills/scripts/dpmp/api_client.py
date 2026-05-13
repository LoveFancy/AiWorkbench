"""DPMP API client for querying and creating stories."""

import json
import logging
import urllib3
from typing import Any
from urllib.parse import quote

import requests
from requests.exceptions import RequestException

# 抑制 SSL 不安全请求警告
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

from dpmp.cache import QueryCache
from dpmp.config import DPMPConfig


class APIClient:
    """Client for DPMP API requests."""

    def __init__(self, config: DPMPConfig, cache: QueryCache, logger: logging.Logger) -> None:
        self.config = config
        self.cache = cache
        self.logger = logger
        self.session = requests.Session()
        self.session.verify = False  # 跳过 SSL 验证（等同于 curl --insecure）
        self.session.headers.update(self._base_headers())

    def _base_headers(self) -> dict[str, str]:
        return {
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
            "ChainId": "0.0",
            "Connection": "keep-alive",
            "Content-Type": "application/json;charset=UTF-8",
            "DNT": "1",
            "Referer": "http://pt.htsc/paas/detail.html",
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
            ),
            "X-Requested-With": "XMLHttpRequest",
            "X-Service-Name": "za-cube",
            "X-Usercenter-Session": "null",
            "from": "htLogin",
            "menuversion": "2",
        }

    def _build_headers(self, request_kind: str) -> dict[str, str]:
        headers = dict(self._base_headers())
        headers["Cookie"] = self.config.cookie
        if request_kind == "create":
            headers["Origin"] = "http://pt.htsc"
        return headers

    def _encode_env(self) -> str:
        env = {
            "projectId": self.config.project_id,
            "iterationId": self.config.iteration_id,
            "taskTypeId": self.config.task_type_id,
            "itemId": self.config.item_id,
            "flowId": self.config.flow_id,
            "flowSignApplyId": self.config.flow_sign_apply_id,
            "currentStateId": self.config.current_state_id,
            "relItProjectId": self.config.rel_it_project_id,
        }
        return quote(json.dumps(env, separators=(",", ":")), safe="")

    def _build_query_url(self, path: str, search: str) -> str:
        return (
            f"{self.config.base_url}/{path}"
            f"?search={quote(search, safe='')}"
            "&pageSize=100&currentPage=1"
            f"&env={self._encode_env()}"
            "&ids=%5B%5D"
        )

    def _make_request(
        self, method: str, url: str, data: dict[str, Any] | None = None,
        request_kind: str = "query",
    ) -> dict[str, Any]:
        try:
            headers = self._build_headers(request_kind)
            if method == "GET":
                resp = self.session.get(url, params=data, headers=headers,
                                        timeout=self.config.request_timeout,
                                        proxies={"http": None, "https": None})
            else:
                resp = self.session.post(url, json=data, headers=headers,
                                         timeout=self.config.request_timeout,
                                         proxies={"http": None, "https": None})
            self.logger.info(f"API {method} {url} -> {resp.status_code}")
            resp.raise_for_status()
            return resp.json()
        except RequestException as e:
            self.logger.error(f"Request failed: {url} - {e}")
            raise

    def validate_cookie(self) -> bool:
        url = self._build_query_url("search/select/iteration", "")
        try:
            headers = self._build_headers("query")
            # 明确绕过代理，与 test_cookie.py 方式 3 保持一致
            resp = self.session.get(url, headers=headers, timeout=self.config.request_timeout,
                                    proxies={"http": None, "https": None})
            self.logger.info(f"API GET {url} -> {resp.status_code}")
            ct = resp.headers.get("content-type", "")
            self.logger.info(f"[DEBUG] Response content-type: {ct}")
            self.logger.info(f"[DEBUG] Response body (first 200 chars): {resp.content[:200]}")
            if "application/json" not in ct:
                self.logger.error(f"Response is not JSON, likely redirected to login page")
                return False
            return resp.json().get("returnCode") == "000000"
        except Exception as e:
            self.logger.error(f"validate_cookie failed: {e}")
            return False

    def query_iteration(self, name: str) -> dict[str, Any] | None:
        cached = self.cache.get_iteration(name)
        if cached:
            return cached
        url = self._build_query_url("search/select/iteration", name)
        resp = self._make_request("GET", url)
        if resp.get("returnCode") == "000000":
            for item in resp.get("data", {}).get("list", []):
                if item.get("name") == name:
                    self.cache.set_iteration(name, item)
                    return item
        self.logger.warning(f"Iteration not found: {name}")
        return None

    def query_user(self, user_id: str) -> dict[str, Any] | None:
        cached = self.cache.get_user(user_id)
        if cached:
            return cached
        url = self._build_query_url("search/select/user", user_id)
        resp = self._make_request("GET", url)
        if resp.get("returnCode") == "000000":
            for item in resp.get("data", {}).get("list", []):
                if item.get("adAccount") == user_id:
                    self.cache.set_user(user_id, item)
                    return item
        self.logger.warning(f"User not found: {user_id}")
        return None

    def query_parent_issue(self, code: str) -> dict[str, Any] | None:
        cached = self.cache.get_parent_issue(code)
        if cached:
            return cached
        url = self._build_query_url("search/select/itemsHasChildren", code)
        resp = self._make_request("GET", url)
        if resp.get("returnCode") == "000000":
            for item in resp.get("data", {}).get("list", []):
                if item.get("code") == code:
                    self.cache.set_parent_issue(code, item)
                    return item
        self.logger.warning(f"Parent issue not found: {code}")
        return None
