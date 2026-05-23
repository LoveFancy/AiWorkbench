"""Shared Confluence network environment helpers."""

from __future__ import annotations

import os
from urllib.parse import urlparse


PROXY_ENV_NAMES = (
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "ALL_PROXY",
    "http_proxy",
    "https_proxy",
    "all_proxy",
)


def build_confluence_env(base_url: str, base_env: dict[str, str] | None = None) -> dict[str, str]:
    """Return an environment that bypasses proxies for the Confluence host."""
    env = dict(base_env or os.environ)
    parsed = urlparse(base_url)
    host = parsed.hostname or parsed.netloc

    for name in PROXY_ENV_NAMES:
        env.pop(name, None)

    if host:
        existing = env.get("NO_PROXY") or env.get("no_proxy") or ""
        entries = [item.strip() for item in existing.split(",") if item.strip()]
        if host not in entries:
            entries.append(host)
        no_proxy = ",".join(entries)
        env["NO_PROXY"] = no_proxy
        env["no_proxy"] = no_proxy

    return env
