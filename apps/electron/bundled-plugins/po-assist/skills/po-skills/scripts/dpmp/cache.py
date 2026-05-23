"""In-memory cache for DPMP API query results."""

from typing import Any


class QueryCache:
    """Simple dict-based cache to avoid redundant API lookups."""

    def __init__(self) -> None:
        self._iterations: dict[str, dict[str, Any]] = {}
        self._users: dict[str, dict[str, Any]] = {}
        self._parent_issues: dict[str, dict[str, Any]] = {}
        self._release_versions: dict[str, dict[str, Any]] = {}

    def get_iteration(self, name: str) -> dict[str, Any] | None:
        return self._iterations.get(name)

    def set_iteration(self, name: str, data: dict[str, Any]) -> None:
        self._iterations[name] = data

    def get_user(self, id: str) -> dict[str, Any] | None:
        return self._users.get(id)

    def set_user(self, id: str, data: dict[str, Any]) -> None:
        self._users[id] = data

    def get_parent_issue(self, code: str) -> dict[str, Any] | None:
        return self._parent_issues.get(code)

    def set_parent_issue(self, code: str, data: dict[str, Any]) -> None:
        self._parent_issues[code] = data

    def get_release_version(self, name: str) -> dict[str, Any] | None:
        return self._release_versions.get(name)

    def set_release_version(self, name: str, data: dict[str, Any]) -> None:
        self._release_versions[name] = data

    def clear(self) -> None:
        self._iterations.clear()
        self._users.clear()
        self._parent_issues.clear()
        self._release_versions.clear()
