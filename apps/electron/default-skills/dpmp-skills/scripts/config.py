"""
DPMP 配置管理

支持从以下来源读取配置（优先级从高到低）：
  1. 构造参数（kwargs）—— 由调用方显式传入
  2. 系统环境变量（os.environ）—— 包含 .env 文件加载的值和系统上下文
  3. 硬编码默认值
"""

import os
from typing import Optional, Dict, Any


class DPMPConfig:
    """DPMP 配置类

    支持从系统环境变量（os.environ）和 .env 文件中读取配置，
    同时允许通过构造参数覆盖任意配置项。
    """

    def __init__(self, **kwargs):
        strict = kwargs.pop("strict", True)
        self.base_url = self._get_config_value(
            kwargs, "DPMP_BASE_URL", ""
        )
        self.app_id = self._get_config_value(
            kwargs, "DPMP_APP_ID", ""
        )
        self.open_api_token = self._get_config_value(
            kwargs, "DPMP_OPEN_API_TOKEN", ""
        )
        self.ad_account = self._get_config_value(
            kwargs, "DPMP_AD_ACCOUNT", ""
        )

        timeout_raw = self._get_config_value(
            kwargs, "DPMP_REQUEST_TIMEOUT", "30"
        )
        self.request_timeout = int(timeout_raw) if timeout_raw else 30

        product_keys_raw = self._get_config_value(
            kwargs, "DPMP_PRODUCT_KEY", ""
        )
        self.product_keys = [
            k.strip() for k in product_keys_raw.split(";") if k.strip()
        ]

        project_keys_raw = self._get_config_value(
            kwargs, "DPMP_PROJECT_KEY", ""
        )
        self.project_keys = [
            k.strip() for k in project_keys_raw.split(";") if k.strip()
        ]

        if strict:
            self.validate()

    @staticmethod
    def _get_config_value(kwargs: Dict[str, str], env_key: str, default: str) -> str:
        if env_key in kwargs:
            return kwargs[env_key]
        return os.environ.get(env_key, default)

    @classmethod
    def from_dict(cls, config_dict: Dict[str, Any]) -> "DPMPConfig":
        """从字典创建配置实例，适用于从系统上下文传入配置"""
        return cls(**config_dict)

    def validate(self):
        errors = []
        if not self.open_api_token:
            errors.append("DPMP_OPEN_API_TOKEN 未设置")
        if not self.app_id:
            errors.append("DPMP_APP_ID 未设置")
        if not self.base_url:
            errors.append("DPMP_BASE_URL 未设置")

        if errors:
            msg = "❌ 配置错误:\n"
            for error in errors:
                msg += f"   - {error}\n"
            msg += "\n请设置以下环境变量（在 .env 文件中或系统环境变量中）:\n"
            msg += "  DPMP_BASE_URL=<your_base_url>\n"
            msg += "  DPMP_APP_ID=<your_app_id>\n"
            msg += "  DPMP_OPEN_API_TOKEN=<your_token>\n"
            msg += "  DPMP_AD_ACCOUNT=<your_ad_account>\n"
            raise ValueError(msg)

    def get_auth_headers(self):
        headers = {
            "from": "OPENAPIHT",
            "openApiToken": self.open_api_token,
            "appId": self.app_id,
            "Content-Type": "application/json"
        }
        if self.ad_account:
            headers["adAccount"] = self.ad_account
        return headers

    def to_dict(self) -> Dict[str, Any]:
        """导出配置为字典，方便传递给子模块或序列化"""
        return {
            "base_url": self.base_url,
            "app_id": self.app_id,
            "open_api_token": self.open_api_token,
            "ad_account": self.ad_account,
            "request_timeout": self.request_timeout,
            "product_keys": self.product_keys,
            "project_keys": self.project_keys,
        }


def load_config(**kwargs) -> DPMPConfig:
    """加载配置，支持通过 kwargs 覆盖环境变量"""
    return DPMPConfig(**kwargs)
