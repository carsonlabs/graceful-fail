"""LangChain integration for Graceful Fail.

Provides a drop-in replacement for LangChain's HTTP request tools
that routes all calls through the Graceful Fail proxy.

Usage with LangChain agents:

    from graceful_fail.langchain import GracefulFailTool

    tool = GracefulFailTool(api_key="gf_your_key")
    agent = create_react_agent(llm, [tool, ...])

Usage with LangChain's requests wrapper:

    from graceful_fail.langchain import GracefulFailRequests

    requests = GracefulFailRequests(api_key="gf_your_key")
    response = requests.get("https://api.example.com/users")
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Type

from graceful_fail.client import GracefulFail

try:
    from langchain_core.callbacks import CallbackManagerForToolRun
    from langchain_core.tools import BaseTool
    from pydantic import BaseModel, Field

    _HAS_LANGCHAIN = True
except ImportError:
    _HAS_LANGCHAIN = False


def _require_langchain() -> None:
    if not _HAS_LANGCHAIN:
        raise ImportError(
            "LangChain integration requires langchain-core. "
            "Install it with: pip install 'graceful-fail[langchain]'"
        )


class GracefulFailRequests:
    """Drop-in replacement for LangChain's TextRequestsWrapper
    that routes all requests through Graceful Fail.

    Every HTTP call goes through the proxy. On success (2xx/3xx),
    you get the response body as a string. On failure (4xx/5xx),
    you get a structured analysis with fix instructions.

    Usage:
        from graceful_fail.langchain import GracefulFailRequests

        requests = GracefulFailRequests(api_key="gf_your_key")
        result = requests.get("https://api.example.com/users")
        print(result)  # Either the response body or structured fix instructions
    """

    def __init__(
        self,
        api_key: str,
        *,
        base_url: str | None = None,
        headers: Dict[str, str] | None = None,
    ):
        kwargs: dict = {"api_key": api_key}
        if base_url:
            kwargs["base_url"] = base_url
        self._client = GracefulFail(**kwargs)
        self._headers = headers or {}

    def _format_response(self, resp: Any) -> str:
        """Format a GracefulFailResponse as a string for LangChain agents."""
        import json

        # Auto-fixed: SelfHeal patched the payload and retried successfully
        if resp.auto_fixed and resp.error_analysis:
            ea = resp.error_analysis
            diff_str = json.dumps({
                "remove": resp.applied_diff.remove if resp.applied_diff else [],
                "add": resp.applied_diff.add if resp.applied_diff else {},
                "modify": resp.applied_diff.modify if resp.applied_diff else {},
            })
            data_str = json.dumps(resp.data, indent=2) if isinstance(resp.data, (dict, list)) else str(resp.data)
            parts = [
                f"AUTO-FIXED (original error: {ea.error_category})",
                "SelfHeal automatically corrected the request and retried successfully.",
                f"What was wrong: {ea.human_readable_explanation}",
                f"What was changed: {diff_str}",
                f"Result (HTTP {resp.status_code}):",
                data_str,
            ]
            return "\n".join(parts)

        # Intercepted but not auto-fixed
        if resp.intercepted and resp.error_analysis:
            ea = resp.error_analysis
            parts = [
                f"API ERROR (HTTP {resp.status_code}, category: {ea.error_category})",
                f"Retriable: {ea.is_retriable}",
                f"Explanation: {ea.human_readable_explanation}",
                f"Fix: {ea.actionable_fix_for_agent}",
            ]
            diff = ea.suggested_payload_diff
            if diff.remove:
                parts.append(f"Remove fields: {diff.remove}")
            if diff.add:
                parts.append(f"Add fields: {diff.add}")
            if diff.modify:
                parts.append(f"Modify fields: {diff.modify}")
            return "\n".join(parts)

        if isinstance(resp.data, (dict, list)):
            return json.dumps(resp.data, indent=2)
        return str(resp.data)

    def get(self, url: str) -> str:
        resp = self._client.get(url, headers=self._headers)
        return self._format_response(resp)

    def post(self, url: str, data: Dict[str, Any] | None = None) -> str:
        resp = self._client.post(url, json=data or {}, headers=self._headers)
        return self._format_response(resp)

    def put(self, url: str, data: Dict[str, Any] | None = None) -> str:
        resp = self._client.put(url, json=data or {}, headers=self._headers)
        return self._format_response(resp)

    def patch(self, url: str, data: Dict[str, Any] | None = None) -> str:
        resp = self._client.patch(url, json=data or {}, headers=self._headers)
        return self._format_response(resp)

    def delete(self, url: str) -> str:
        resp = self._client.delete(url, headers=self._headers)
        return self._format_response(resp)


if _HAS_LANGCHAIN:

    class _GracefulFailInput(BaseModel):
        """Input schema for GracefulFailTool."""

        url: str = Field(description="The full URL of the API endpoint to call")
        method: str = Field(
            default="GET",
            description="HTTP method: GET, POST, PUT, PATCH, or DELETE",
        )
        body: Optional[Dict[str, Any]] = Field(
            default=None,
            description="JSON request body (for POST, PUT, PATCH)",
        )
        headers: Optional[Dict[str, str]] = Field(
            default=None,
            description="Additional HTTP headers to include",
        )

    class GracefulFailTool(BaseTool):
        """LangChain tool that makes HTTP requests through Graceful Fail.

        When an API returns an error, instead of your agent seeing a raw HTTP
        error, it gets structured fix instructions: what went wrong, whether
        to retry, and exactly what to change in the request.

        Usage:
            from graceful_fail.langchain import GracefulFailTool

            tool = GracefulFailTool(api_key="gf_your_key")
            agent = create_react_agent(llm, [tool])
        """

        name: str = "graceful_fail_http"
        description: str = (
            "Make an HTTP request to any API through the Graceful Fail proxy. "
            "If the API returns an error (4xx/5xx), you will receive structured "
            "fix instructions explaining exactly what went wrong and how to "
            "correct your request. Use this for all external API calls."
        )
        args_schema: Type[BaseModel] = _GracefulFailInput

        api_key: str
        base_url: Optional[str] = None

        _requests: Optional[GracefulFailRequests] = None

        def model_post_init(self, __context: Any) -> None:
            kwargs: dict = {"api_key": self.api_key}
            if self.base_url:
                kwargs["base_url"] = self.base_url
            self._requests = GracefulFailRequests(**kwargs)

        def _run(
            self,
            url: str,
            method: str = "GET",
            body: Optional[Dict[str, Any]] = None,
            headers: Optional[Dict[str, str]] = None,
            run_manager: Optional[CallbackManagerForToolRun] = None,
        ) -> str:
            method = method.upper()
            if headers:
                self._requests._headers = headers

            if method == "GET":
                return self._requests.get(url)
            elif method == "POST":
                return self._requests.post(url, data=body)
            elif method == "PUT":
                return self._requests.put(url, data=body)
            elif method == "PATCH":
                return self._requests.patch(url, data=body)
            elif method == "DELETE":
                return self._requests.delete(url)
            else:
                return f"Unsupported HTTP method: {method}"

else:
    # Stub so imports don't fail when langchain is not installed
    class GracefulFailTool:  # type: ignore[no-redef]
        def __init__(self, *args: Any, **kwargs: Any) -> None:
            _require_langchain()
