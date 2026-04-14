"""Sync and async HTTP clients for the Graceful Fail proxy.

Supports two modes:
- **x402 mode** (default): No API key needed. Uses /api/x402/proxy.
  Successes are free. Failures return 402 -> agent pays -> gets heal.
- **Legacy mode**: Pass api_key to use /api/proxy with API key auth.
"""

from __future__ import annotations

import json
from typing import Any, Callable, Dict, Optional, Awaitable

import httpx

from graceful_fail.exceptions import AuthenticationError, ProxyError, RateLimitError
from graceful_fail.models import GracefulFailResponse

DEFAULT_BASE_URL = "https://selfheal.dev"
DEFAULT_TIMEOUT = 30.0


# ── x402 mode helpers ─────────────────────────────────────────────────────────


def _build_x402_request(
    method: str,
    url: str,
    *,
    headers: Optional[Dict[str, str]] = None,
    json_body: Any = None,
    data: Any = None,
    base_url: str,
    payment_proof: Optional[str] = None,
    target_schema: Optional[Dict[str, Any]] = None,
) -> dict:
    """Build kwargs for an httpx request to the x402 proxy endpoint."""
    body_str: Optional[str] = None
    if json_body is not None:
        body_str = json.dumps(json_body) if not isinstance(json_body, str) else json_body
    elif data is not None:
        body_str = data if isinstance(data, str) else str(data)

    proxy_body: Dict[str, Any] = {
        "url": url,
        "method": method.upper(),
    }
    if headers:
        proxy_body["headers"] = headers
    if body_str:
        proxy_body["body"] = body_str
    if target_schema:
        proxy_body["target_schema"] = target_schema

    req_headers = {"Content-Type": "application/json"}
    if payment_proof:
        req_headers["X-PAYMENT"] = payment_proof

    return {
        "method": "POST",
        "url": f"{base_url.rstrip('/')}/api/x402/proxy",
        "headers": req_headers,
        "json": proxy_body,
    }


def _parse_x402_response(response: httpx.Response) -> GracefulFailResponse:
    """Parse an x402 proxy response."""
    if response.status_code == 429:
        body = response.json()
        raise RateLimitError(message=body.get("error", "Rate limit exceeded"))

    if response.status_code == 402:
        body = response.json()
        return GracefulFailResponse.from_x402_payment_required(body)

    if response.status_code >= 500:
        body = response.json()
        raise ProxyError(body.get("error", "Proxy error"), status_code=response.status_code)

    body = response.json()

    # Healed response
    if isinstance(body, dict) and body.get("healed"):
        return GracefulFailResponse.from_x402_healed(body)

    # Pass-through success
    return GracefulFailResponse.from_success(response.status_code, body)


# ── Legacy mode helpers ───────────────────────────────────────────────────────


def _build_legacy_request(
    method: str,
    url: str,
    *,
    headers: Optional[Dict[str, str]] = None,
    json_body: Any = None,
    data: Any = None,
    api_key: str,
    base_url: str,
    auto_retry: bool = True,
) -> dict:
    """Build kwargs for an httpx request to the legacy proxy endpoint."""
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
    if json_body is not None:
        kwargs["json"] = json_body
    elif data is not None:
        kwargs["content"] = data
    return kwargs


def _parse_legacy_response(response: httpx.Response) -> GracefulFailResponse:
    """Parse a legacy proxy response."""
    if response.status_code == 401:
        body = response.json()
        raise AuthenticationError(body.get("error", "Authentication failed"))

    if response.status_code == 429:
        body = response.json()
        raise RateLimitError(
            message=body.get("error", "Rate limit exceeded"),
            tier=body.get("tier", ""),
        )

    if response.status_code == 502:
        body = response.json()
        raise ProxyError(body.get("error", "Proxy error"), status_code=502)

    body = response.json()

    if isinstance(body, dict) and body.get("selfheal_auto_fixed"):
        return GracefulFailResponse.from_auto_fixed(body)

    if isinstance(body, dict) and body.get("graceful_fail_intercepted"):
        return GracefulFailResponse.from_intercepted(body)

    return GracefulFailResponse.from_success(response.status_code, body)


# ── Sync client ───────────────────────────────────────────────────────────────


class GracefulFail:
    """Synchronous client for the SelfHeal API proxy.

    x402 mode (default — no API key needed):
        gf = GracefulFail()
        resp = gf.post("https://api.example.com/users", json={"name": "Alice"})

    Legacy mode (API key):
        gf = GracefulFail(api_key="gf_your_key")
        resp = gf.post("https://api.example.com/users", json={"name": "Alice"})
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        *,
        base_url: str = DEFAULT_BASE_URL,
        timeout: float = DEFAULT_TIMEOUT,
        auto_retry: bool = True,
        on_payment_required: Optional[Callable[[dict], Optional[str]]] = None,
        llm_api_key: Optional[str] = None,
        llm_model: Optional[str] = None,
        llm_base_url: Optional[str] = None,
    ):
        self.api_key = api_key
        self.base_url = base_url
        self._auto_retry = auto_retry
        self._on_payment_required = on_payment_required
        self._llm_headers: Dict[str, str] = {}
        if llm_api_key:
            self._llm_headers["X-LLM-API-Key"] = llm_api_key
        if llm_model:
            self._llm_headers["X-LLM-Model"] = llm_model
        if llm_base_url:
            self._llm_headers["X-LLM-Base-URL"] = llm_base_url
        self._client = httpx.Client(timeout=timeout)

    @property
    def _is_x402(self) -> bool:
        return self.api_key is None

    def request(
        self,
        method: str,
        url: str,
        *,
        headers: Optional[Dict[str, str]] = None,
        json: Any = None,
        data: Any = None,
        target_schema: Optional[Dict[str, Any]] = None,
    ) -> GracefulFailResponse:
        """Send a request through the proxy.

        Args:
            target_schema: Optional JSON schema for response normalization.
                When provided, SelfHeal will normalize the API response to match.
                Already-compliant responses pass through free.
        """
        if self._is_x402:
            return self._request_x402(method, url, headers=headers, json_body=json, data=data, target_schema=target_schema)
        return self._request_legacy(method, url, headers=headers, json_body=json, data=data)

    def _request_x402(
        self, method: str, url: str, **kwargs: Any
    ) -> GracefulFailResponse:
        req_kwargs = _build_x402_request(method, url, base_url=self.base_url, target_schema=kwargs.pop("target_schema", None), **kwargs)
        try:
            response = self._client.request(**req_kwargs)
        except httpx.HTTPError as e:
            raise ProxyError(f"Failed to reach SelfHeal proxy: {e}") from e
        result = _parse_x402_response(response)

        # Handle 402 with payment callback
        if result.payment_required and self._on_payment_required:
            proof = self._on_payment_required(result.payment_required)
            if proof:
                retry_kwargs = _build_x402_request(
                    method, url, base_url=self.base_url, payment_proof=proof, **kwargs
                )
                try:
                    response = self._client.request(**retry_kwargs)
                except httpx.HTTPError as e:
                    raise ProxyError(f"Payment retry failed: {e}") from e
                return _parse_x402_response(response)

        return result

    def _request_legacy(
        self, method: str, url: str, *, headers: Optional[Dict[str, str]] = None,
        json_body: Any = None, data: Any = None,
    ) -> GracefulFailResponse:
        merged_headers = {**self._llm_headers, **(headers or {})}
        req_kwargs = _build_legacy_request(
            method, url,
            headers=merged_headers if merged_headers else None,
            json_body=json_body, data=data,
            api_key=self.api_key,  # type: ignore[arg-type]
            base_url=self.base_url,
            auto_retry=self._auto_retry,
        )
        try:
            response = self._client.request(**req_kwargs)
        except httpx.HTTPError as e:
            raise ProxyError(f"Failed to reach Graceful Fail proxy: {e}") from e
        return _parse_legacy_response(response)

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


# ── Async client ──────────────────────────────────────────────────────────────


class GracefulFailAsync:
    """Async client for the SelfHeal API proxy.

    x402 mode (default):
        async with GracefulFailAsync() as gf:
            resp = await gf.post("https://api.example.com/users", json={"name": "Alice"})

    Legacy mode:
        async with GracefulFailAsync(api_key="gf_your_key") as gf:
            resp = await gf.post(...)
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        *,
        base_url: str = DEFAULT_BASE_URL,
        timeout: float = DEFAULT_TIMEOUT,
        auto_retry: bool = True,
        on_payment_required: Optional[Callable[[dict], Awaitable[Optional[str]]]] = None,
        llm_api_key: Optional[str] = None,
        llm_model: Optional[str] = None,
        llm_base_url: Optional[str] = None,
    ):
        self.api_key = api_key
        self.base_url = base_url
        self._auto_retry = auto_retry
        self._on_payment_required = on_payment_required
        self._llm_headers: Dict[str, str] = {}
        if llm_api_key:
            self._llm_headers["X-LLM-API-Key"] = llm_api_key
        if llm_model:
            self._llm_headers["X-LLM-Model"] = llm_model
        if llm_base_url:
            self._llm_headers["X-LLM-Base-URL"] = llm_base_url
        self._client = httpx.AsyncClient(timeout=timeout)

    @property
    def _is_x402(self) -> bool:
        return self.api_key is None

    async def request(
        self,
        method: str,
        url: str,
        *,
        headers: Optional[Dict[str, str]] = None,
        json: Any = None,
        data: Any = None,
        target_schema: Optional[Dict[str, Any]] = None,
    ) -> GracefulFailResponse:
        if self._is_x402:
            return await self._request_x402(method, url, headers=headers, json_body=json, data=data, target_schema=target_schema)
        return await self._request_legacy(method, url, headers=headers, json_body=json, data=data)

    async def _request_x402(
        self, method: str, url: str, **kwargs: Any
    ) -> GracefulFailResponse:
        req_kwargs = _build_x402_request(method, url, base_url=self.base_url, target_schema=kwargs.pop("target_schema", None), **kwargs)
        try:
            response = await self._client.request(**req_kwargs)
        except httpx.HTTPError as e:
            raise ProxyError(f"Failed to reach SelfHeal proxy: {e}") from e
        result = _parse_x402_response(response)

        if result.payment_required and self._on_payment_required:
            proof = await self._on_payment_required(result.payment_required)
            if proof:
                retry_kwargs = _build_x402_request(
                    method, url, base_url=self.base_url, payment_proof=proof, **kwargs
                )
                try:
                    response = await self._client.request(**retry_kwargs)
                except httpx.HTTPError as e:
                    raise ProxyError(f"Payment retry failed: {e}") from e
                return _parse_x402_response(response)

        return result

    async def _request_legacy(
        self, method: str, url: str, *, headers: Optional[Dict[str, str]] = None,
        json_body: Any = None, data: Any = None,
    ) -> GracefulFailResponse:
        merged_headers = {**self._llm_headers, **(headers or {})}
        req_kwargs = _build_legacy_request(
            method, url,
            headers=merged_headers if merged_headers else None,
            json_body=json_body, data=data,
            api_key=self.api_key,  # type: ignore[arg-type]
            base_url=self.base_url,
            auto_retry=self._auto_retry,
        )
        try:
            response = await self._client.request(**req_kwargs)
        except httpx.HTTPError as e:
            raise ProxyError(f"Failed to reach Graceful Fail proxy: {e}") from e
        return _parse_legacy_response(response)

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
