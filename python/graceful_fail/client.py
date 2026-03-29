"""Sync and async HTTP clients for the Graceful Fail proxy."""

from __future__ import annotations

from typing import Any, Dict, Optional

import httpx

from graceful_fail.exceptions import AuthenticationError, ProxyError, RateLimitError
from graceful_fail.models import GracefulFailResponse

DEFAULT_BASE_URL = "https://selfheal.dev"
DEFAULT_TIMEOUT = 30.0


def _build_proxy_request(
    method: str,
    url: str,
    *,
    headers: Optional[Dict[str, str]] = None,
    json: Any = None,
    data: Any = None,
    api_key: str,
    base_url: str,
    auto_retry: bool = True,
) -> dict:
    """Build the kwargs for an httpx request to the proxy endpoint."""
    proxy_headers = {
        "Authorization": f"Bearer {api_key}",
        "X-Destination-URL": url,
        "X-Destination-Method": method.upper(),
        "X-Auto-Retry": "true" if auto_retry else "false",
    }
    if headers:
        proxy_headers.update(headers)

    kwargs: dict = {
        "method": "POST",
        "url": f"{base_url.rstrip('/')}/api/proxy",
        "headers": proxy_headers,
    }
    if json is not None:
        kwargs["json"] = json
    elif data is not None:
        kwargs["content"] = data
    return kwargs


def _parse_response(response: httpx.Response) -> GracefulFailResponse:
    """Parse an httpx response into a GracefulFailResponse."""
    # Handle proxy-level auth errors
    if response.status_code == 401:
        body = response.json()
        raise AuthenticationError(body.get("error", "Authentication failed"))

    # Handle rate limit errors
    if response.status_code == 429:
        body = response.json()
        raise RateLimitError(
            message=body.get("error", "Rate limit exceeded"),
            tier=body.get("tier", ""),
        )

    # Handle proxy internal errors
    if response.status_code == 502:
        body = response.json()
        raise ProxyError(
            body.get("error", "Proxy error"),
            status_code=502,
        )

    body = response.json()

    # Check if SelfHeal auto-fixed the request
    if isinstance(body, dict) and body.get("selfheal_auto_fixed"):
        return GracefulFailResponse.from_auto_fixed(body)

    # Check if this is an intercepted error response
    if isinstance(body, dict) and body.get("graceful_fail_intercepted"):
        return GracefulFailResponse.from_intercepted(body)

    # Success pass-through
    return GracefulFailResponse.from_success(response.status_code, body)


class GracefulFail:
    """Synchronous client for the Graceful Fail API proxy.

    Usage:
        gf = GracefulFail(api_key="gf_your_key")

        # Simple request
        resp = gf.request("POST", "https://api.example.com/users", json={"name": "Alice"})

        # Shorthand methods
        resp = gf.get("https://api.example.com/users/1")
        resp = gf.post("https://api.example.com/users", json={"name": "Alice"})

        if resp.intercepted:
            print(resp.error_analysis.actionable_fix_for_agent)
            print(resp.error_analysis.suggested_payload_diff)
        else:
            print(resp.data)
    """

    def __init__(
        self,
        api_key: str,
        *,
        base_url: str = DEFAULT_BASE_URL,
        timeout: float = DEFAULT_TIMEOUT,
        auto_retry: bool = True,
        llm_api_key: Optional[str] = None,
        llm_model: Optional[str] = None,
        llm_base_url: Optional[str] = None,
    ):
        if not api_key:
            raise ValueError("api_key is required")
        self.api_key = api_key
        self.base_url = base_url
        self._auto_retry = auto_retry
        self._llm_headers: Dict[str, str] = {}
        if llm_api_key:
            self._llm_headers["X-LLM-API-Key"] = llm_api_key
        if llm_model:
            self._llm_headers["X-LLM-Model"] = llm_model
        if llm_base_url:
            self._llm_headers["X-LLM-Base-URL"] = llm_base_url
        self._client = httpx.Client(timeout=timeout)

    def request(
        self,
        method: str,
        url: str,
        *,
        headers: Optional[Dict[str, str]] = None,
        json: Any = None,
        data: Any = None,
    ) -> GracefulFailResponse:
        """Send a request through the Graceful Fail proxy."""
        merged_headers = {**self._llm_headers, **(headers or {})}
        kwargs = _build_proxy_request(
            method, url,
            headers=merged_headers if merged_headers else None,
            json=json, data=data,
            api_key=self.api_key, base_url=self.base_url,
            auto_retry=self._auto_retry,
        )
        try:
            response = self._client.request(**kwargs)
        except httpx.HTTPError as e:
            raise ProxyError(f"Failed to reach Graceful Fail proxy: {e}") from e
        return _parse_response(response)

    def get(self, url: str, **kwargs: Any) -> GracefulFailResponse:
        return self.request("GET", url, **kwargs)

    def post(self, url: str, **kwargs: Any) -> GracefulFailResponse:
        return self.request("POST", url, **kwargs)

    def put(self, url: str, **kwargs: Any) -> GracefulFailResponse:
        return self.request("PUT", url, **kwargs)

    def patch(self, url: str, **kwargs: Any) -> GracefulFailResponse:
        return self.request("PATCH", url, **kwargs)

    def delete(self, url: str, **kwargs: Any) -> GracefulFailResponse:
        return self.request("DELETE", url, **kwargs)

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> GracefulFail:
        return self

    def __exit__(self, *args: Any) -> None:
        self.close()


class GracefulFailAsync:
    """Async client for the Graceful Fail API proxy.

    Usage:
        async with GracefulFailAsync(api_key="gf_your_key") as gf:
            resp = await gf.post("https://api.example.com/users", json={"name": "Alice"})
    """

    def __init__(
        self,
        api_key: str,
        *,
        base_url: str = DEFAULT_BASE_URL,
        timeout: float = DEFAULT_TIMEOUT,
        auto_retry: bool = True,
        llm_api_key: Optional[str] = None,
        llm_model: Optional[str] = None,
        llm_base_url: Optional[str] = None,
    ):
        if not api_key:
            raise ValueError("api_key is required")
        self.api_key = api_key
        self.base_url = base_url
        self._auto_retry = auto_retry
        self._llm_headers: Dict[str, str] = {}
        if llm_api_key:
            self._llm_headers["X-LLM-API-Key"] = llm_api_key
        if llm_model:
            self._llm_headers["X-LLM-Model"] = llm_model
        if llm_base_url:
            self._llm_headers["X-LLM-Base-URL"] = llm_base_url
        self._client = httpx.AsyncClient(timeout=timeout)

    async def request(
        self,
        method: str,
        url: str,
        *,
        headers: Optional[Dict[str, str]] = None,
        json: Any = None,
        data: Any = None,
    ) -> GracefulFailResponse:
        """Send a request through the Graceful Fail proxy."""
        merged_headers = {**self._llm_headers, **(headers or {})}
        kwargs = _build_proxy_request(
            method, url,
            headers=merged_headers if merged_headers else None,
            json=json, data=data,
            api_key=self.api_key, base_url=self.base_url,
            auto_retry=self._auto_retry,
        )
        try:
            response = await self._client.request(**kwargs)
        except httpx.HTTPError as e:
            raise ProxyError(f"Failed to reach Graceful Fail proxy: {e}") from e
        return _parse_response(response)

    async def get(self, url: str, **kwargs: Any) -> GracefulFailResponse:
        return await self.request("GET", url, **kwargs)

    async def post(self, url: str, **kwargs: Any) -> GracefulFailResponse:
        return await self.request("POST", url, **kwargs)

    async def put(self, url: str, **kwargs: Any) -> GracefulFailResponse:
        return await self.request("PUT", url, **kwargs)

    async def patch(self, url: str, **kwargs: Any) -> GracefulFailResponse:
        return await self.request("PATCH", url, **kwargs)

    async def delete(self, url: str, **kwargs: Any) -> GracefulFailResponse:
        return await self.request("DELETE", url, **kwargs)

    async def close(self) -> None:
        await self._client.aclose()

    async def __aenter__(self) -> GracefulFailAsync:
        return self

    async def __aexit__(self, *args: Any) -> None:
        await self.close()
