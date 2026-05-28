"""
DPMP API 客户端

提供所有 DPMP API 的调用方法，使用 openApiToken 认证。
"""

import json
import requests
import urllib3
from typing import Dict, Any, Optional
from .config import DPMPConfig

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


class DPMPClient:
    """DPMP API 客户端"""

    def __init__(self, config: Optional[DPMPConfig] = None):
        self.config = config or DPMPConfig()
        self.session = requests.Session()
        self.session.verify = False

        self.session.proxies = {"http": None, "https": None}
        self.session.trust_env = False

    def _make_request(self, method: str, endpoint: str, data: Optional[Dict] = None) -> Dict[str, Any]:
        """发送请求"""
        url = f"{self.config.base_url.rstrip('/')}/{endpoint.lstrip('/')}"
        headers = self.config.get_auth_headers()

        print("\n" + "=" * 60)
        print(f"[REQUEST] {method} {url}")
        print("-" * 60)
        print("[HEADERS]:")
        for key, value in headers.items():
            if 'token' in key.lower() or 'auth' in key.lower():
                if len(value) <= 8:
                    print(f"  {key}: ***")
                else:
                    print(f"  {key}: {value[:4]}...{value[-4:]}")
            else:
                print(f"  {key}: {value}")
        
        if data:
            print("-" * 60)
            print("[REQUEST BODY]:")
            print(json.dumps(data, indent=2, ensure_ascii=False))
        print("=" * 60 + "\n")

        try:
            if method == "GET":
                response = self.session.get(url, headers=headers, timeout=self.config.request_timeout)
            else:  # POST
                response = self.session.post(url, json=data, headers=headers, timeout=self.config.request_timeout)

            # Print response details
            print("\n" + "=" * 60)
            print(f"[RESPONSE] Status: {response.status_code}")
            print("-" * 60)
            try:
                resp_json = response.json()
                print(json.dumps(resp_json, indent=2, ensure_ascii=False))
            except Exception:
                print(response.text[:500])
            print("=" * 60 + "\n")

            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            error_msg = f"API 请求失败: {e}"
            if hasattr(e, 'response') and e.response is not None:
                error_msg += f"\n响应: {e.response.text}"
            raise Exception(error_msg)

    # ========== REQ 接口 ==========

    def create_req(self, req_data: Dict[str, Any]) -> Dict[str, Any]:
        """创建 REQ - POST /api/req/addreq"""
        return self._make_request("POST", "/api/req/addreq", req_data)

    def update_req(self, req_code: str, update_data: Dict[str, Any]) -> Dict[str, Any]:
        """更新 REQ - POST /api/req/updatereq"""
        data = {"code": req_code, **update_data}
        return self._make_request("POST", "/api/req/updatereq", data)

    def update_req_status(self, req_code: str, status_name: str) -> Dict[str, Any]:
        """更新 REQ 状态 - POST /api/req/updatestatus"""
        data = {"code": req_code, "statusname": status_name}
        return self._make_request("POST", "/api/req/updatestatus", data)

    def get_req_by_code(self, req_code: str) -> Dict[str, Any]:
        """查询 REQ 详情 - GET /api/req/getreqbycode"""
        endpoint = f"/api/req/getreqbycode?code={req_code}"
        return self._make_request("GET", endpoint)

    def query_req_by_conditions(self, conditions: Dict[str, Any]) -> Dict[str, Any]:
        """条件查询 REQ - POST /api/req/queryreqbyconditions"""
        return self._make_request("POST", "/api/req/queryreqbyconditions", conditions)

    # ========== STORY 接口 ==========

    def create_story(self, story_data: Dict[str, Any]) -> Dict[str, Any]:
        """创建 STORY - POST /api/story/addstory"""
        return self._make_request("POST", "/api/story/addstory", story_data)

    def update_story(self, story_code: str, update_data: Dict[str, Any]) -> Dict[str, Any]:
        """更新 STORY - POST /api/story/updatestory"""
        data = {"code": story_code, **update_data}
        return self._make_request("POST", "/api/story/updatestory", data)

    def update_story_status(self, story_code: str, status_name: str) -> Dict[str, Any]:
        """更新 STORY 状态 - POST /api/story/updatestatus"""
        data = {"code": story_code, "statusname": status_name}
        return self._make_request("POST", "/api/story/updatestatus", data)

    def get_story_by_code(self, story_code: str) -> Dict[str, Any]:
        """查询 STORY 详情 - GET /api/story/getstorybycode"""
        endpoint = f"/api/story/getstorybycode?code={story_code}"
        return self._make_request("GET", endpoint)

    def query_story_by_conditions(self, conditions: Dict[str, Any]) -> Dict[str, Any]:
        """条件查询 STORY - POST /api/story/querystorybyconditions"""
        return self._make_request("POST", "/api/story/querystorybyconditions", conditions)


def create_client() -> DPMPClient:
    """创建 API 客户端"""
    return DPMPClient()