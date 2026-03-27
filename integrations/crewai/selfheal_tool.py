"""CrewAI tool for making self-healing HTTP requests through GracefulFail.

When an API returns an error, instead of a raw HTTP failure the agent receives
structured fix instructions: what went wrong, whether to retry, and exactly
what to change in the request.

Usage:
    from integrations.crewai.selfheal_tool import SelfHealTool

    tool = SelfHealTool()
    agent = Agent(role="API caller", tools=[tool], ...)
"""

from __future__ import annotations

import json
import os
from typing import Any, Dict, Optional, Type

from crewai.tools import BaseTool
from pydantic import BaseModel, Field

from graceful_fail import GracefulFail
from graceful_fail.exceptions import (
    AuthenticationError,
    GracefulFailError,
    RateLimitError,
)


class SelfHealToolInput(BaseModel):
    """Input schema for SelfHealTool."""

    url: str = Field(
        description="The full URL of the API endpoint to call."
    )
    method: str = Field(
        default="GET",
        description="HTTP method to use: GET, POST, PUT, PATCH, or DELETE.",
    )
    body: Optional[str] = Field(
        default=None,
        description=(
            "JSON-encoded request body for POST, PUT, or PATCH requests. "
            "Must be a valid JSON string, e.g. '{\"name\": \"Alice\"}'."
        ),
    )
    headers: Optional[str] = Field(
        default=None,
        description=(
            "JSON-encoded dictionary of additional HTTP headers. "
            "Must be a valid JSON string, e.g. '{\"X-Custom\": \"value\"}'."
        ),
    )


class SelfHealTool(BaseTool):
    """Make HTTP requests through the GracefulFail self-healing proxy.

    On success (2xx), returns the API response as a JSON string.
    On failure (4xx/5xx), returns structured fix instructions generated
    by GracefulFail's LLM analysis -- including the error category,
    whether the request is retriable, and exactly what to change.

    Requires the SELFHEAL_API_KEY environment variable to be set.
    Install the client library with: pip install graceful-fail
    """

    name: str = "selfheal_http_request"
    description: str = (
        "Make an HTTP request to any API through the SelfHeal proxy. "
        "If the API returns an error (4xx/5xx), you will receive structured "
        "fix instructions explaining what went wrong and how to correct "
        "your request, instead of a raw error. Use this for all external "
        "API calls so failures are automatically diagnosed."
    )
    args_schema: Type[BaseModel] = SelfHealToolInput
    package_dependencies: list = ["graceful-fail"]

    def _run(
        self,
        url: str,
        method: str = "GET",
        body: Optional[str] = None,
        headers: Optional[str] = None,
        **kwargs: Any,
    ) -> str:
        """Execute the HTTP request through GracefulFail."""
        api_key = os.environ.get("SELFHEAL_API_KEY", "")
        if not api_key:
            return (
                "Error: SELFHEAL_API_KEY environment variable is not set. "
                "Get your API key at https://selfheal.dev and set it with: "
                "export SELFHEAL_API_KEY=gf_your_key"
            )

        # Parse optional JSON fields
        parsed_body: Optional[Dict[str, Any]] = None
        parsed_headers: Optional[Dict[str, str]] = None

        if body is not None:
            try:
                parsed_body = json.loads(body)
            except json.JSONDecodeError as e:
                return f"Error: Invalid JSON in 'body' parameter: {e}"

        if headers is not None:
            try:
                parsed_headers = json.loads(headers)
            except json.JSONDecodeError as e:
                return f"Error: Invalid JSON in 'headers' parameter: {e}"

        method = method.upper()
        if method not in ("GET", "POST", "PUT", "PATCH", "DELETE"):
            return f"Error: Unsupported HTTP method '{method}'. Use GET, POST, PUT, PATCH, or DELETE."

        try:
            client = GracefulFail(api_key=api_key)

            request_kwargs: Dict[str, Any] = {}
            if parsed_headers:
                request_kwargs["headers"] = parsed_headers
            if parsed_body is not None:
                request_kwargs["json"] = parsed_body

            response = client.request(method, url, **request_kwargs)
        except AuthenticationError:
            return (
                "Error: SELFHEAL_API_KEY is invalid. "
                "Check your key at https://selfheal.dev/dashboard."
            )
        except RateLimitError as e:
            return (
                f"Rate limit exceeded: {e}. "
                "Upgrade your plan at https://selfheal.dev/pricing or wait for the limit to reset."
            )
        except GracefulFailError as e:
            return f"GracefulFail proxy error: {e}"
        except Exception as e:
            return f"Unexpected error calling GracefulFail: {e}"

        # Format the response for the agent
        if response.intercepted:
            return self._format_intercepted(response)

        # Success: return response data as JSON
        if isinstance(response.data, (dict, list)):
            return json.dumps(response.data, indent=2)
        return str(response.data)

    @staticmethod
    def _format_intercepted(response: Any) -> str:
        """Format an intercepted error response as readable text."""
        ea = response.error_analysis
        lines = [
            f"API ERROR INTERCEPTED (HTTP {response.status_code})",
            f"Category: {ea.error_category}",
            f"Retriable: {'Yes' if ea.is_retriable else 'No'}",
            "",
            f"Explanation: {ea.human_readable_explanation}",
            "",
            f"Fix: {ea.actionable_fix_for_agent}",
        ]

        diff = ea.suggested_payload_diff
        if diff.remove or diff.add or diff.modify:
            lines.append("")
            lines.append("Suggested payload changes:")
            if diff.remove:
                lines.append(f"  Remove fields: {', '.join(diff.remove)}")
            if diff.add:
                for key, hint in diff.add.items():
                    lines.append(f"  Add field: {key} ({hint})")
            if diff.modify:
                for key, new_val in diff.modify.items():
                    lines.append(f"  Modify field: {key} -> {new_val}")

        return "\n".join(lines)
