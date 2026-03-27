"""Monkey-patch integration for the `requests` library.

Provides a session-like wrapper that routes all HTTP calls through Graceful Fail.
Useful for codebases that already use `requests` and want to add self-healing
with a single line change.

Usage:
    from graceful_fail.patch import GracefulFailSession

    session = GracefulFailSession(api_key="gf_your_key")

    # Use exactly like requests.Session — but with self-healing
    resp = session.post("https://api.example.com/users", json={"name": "Alice"})
    print(resp.status_code)
    print(resp.json())

    # If the API returned an error, check the Graceful Fail analysis:
    if resp.graceful_fail_intercepted:
        print(resp.error_analysis)
"""

from __future__ import annotations

from typing import Any, Dict, Optional

from graceful_fail.client import GracefulFail, DEFAULT_BASE_URL


class _GracefulFailSessionResponse:
    """Response object that mimics requests.Response for compatibility."""

    def __init__(self, gf_response: Any):
        self._gf = gf_response
        self.status_code: int = gf_response.status_code
        self.graceful_fail_intercepted: bool = gf_response.intercepted
        self.error_analysis = gf_response.error_analysis
        self._data = gf_response.data

    def json(self) -> Any:
        return self._data

    @property
    def text(self) -> str:
        import json as _json
        if isinstance(self._data, (dict, list)):
            return _json.dumps(self._data)
        return str(self._data)

    @property
    def ok(self) -> bool:
        return not self.graceful_fail_intercepted and 200 <= self.status_code < 400

    def raise_for_status(self) -> None:
        if not self.ok:
            from graceful_fail.exceptions import ProxyError
            raise ProxyError(
                f"HTTP {self.status_code}: {self.error_analysis.actionable_fix_for_agent if self.error_analysis else 'Error'}",
                status_code=self.status_code,
            )


class GracefulFailSession:
    """Drop-in replacement for requests.Session that routes through Graceful Fail.

    Mimics the requests.Session API so you can swap it in with minimal changes.
    """

    def __init__(
        self,
        api_key: str,
        *,
        base_url: str = DEFAULT_BASE_URL,
        timeout: float = 30.0,
    ):
        self._client = GracefulFail(api_key=api_key, base_url=base_url, timeout=timeout)

    def request(
        self,
        method: str,
        url: str,
        *,
        headers: Optional[Dict[str, str]] = None,
        json: Any = None,
        data: Any = None,
        **kwargs: Any,
    ) -> _GracefulFailSessionResponse:
        resp = self._client.request(method, url, headers=headers, json=json, data=data)
        return _GracefulFailSessionResponse(resp)

    def get(self, url: str, **kwargs: Any) -> _GracefulFailSessionResponse:
        return self.request("GET", url, **kwargs)

    def post(self, url: str, **kwargs: Any) -> _GracefulFailSessionResponse:
        return self.request("POST", url, **kwargs)

    def put(self, url: str, **kwargs: Any) -> _GracefulFailSessionResponse:
        return self.request("PUT", url, **kwargs)

    def patch(self, url: str, **kwargs: Any) -> _GracefulFailSessionResponse:
        return self.request("PATCH", url, **kwargs)

    def delete(self, url: str, **kwargs: Any) -> _GracefulFailSessionResponse:
        return self.request("DELETE", url, **kwargs)

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> GracefulFailSession:
        return self

    def __exit__(self, *args: Any) -> None:
        self.close()
