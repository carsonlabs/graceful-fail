"""CrewAI tool for making self-healing HTTP requests through SelfHeal.

Uses x402 outcome-based pricing by default — no API key needed.
Agents only pay (in USDC) when errors are successfully healed.

Usage:
    from integrations.crewai.selfheal_tool import SelfHealTool

    tool = SelfHealTool()  # No API key needed (x402 mode)
    agent = Agent(role="API caller", tools=[tool], ...)

Legacy mode:
    tool = SelfHealTool()  # Set SELFHEAL_API_KEY env var
"""

from __future__ import annotations

import json
import os
from typing import Any, Dict, Optional, Type

from crewai.tools import BaseTool
from pydantic import BaseModel, Field

from graceful_fail import GracefulFail
from graceful_fail.exceptions import (
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
    """Make HTTP requests through the SelfHeal self-healing proxy.

    Uses x402 outcome-based pricing by default. Successes are free.
    Errors cost $0.001-$0.005 USDC, charged only on successful heal.

    If SELFHEAL_API_KEY is set, falls back to legacy API key mode.
    Install the client library with: pip install graceful-fail
    """

    name: str = "selfheal_http_request"
    description: str = (
        "Make an HTTP request to any API through the SelfHeal proxy. "
        "If the API returns an error (4xx/5xx), you will receive structured "
        "fix instructions explaining what went wrong and how to correct "
        "your request. Successes are free. Errors cost $0.001-$0.005 USDC "
        "via x402, charged only when the heal succeeds."
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
        """Execute the HTTP request through SelfHeal."""
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
            # Use API key if set (legacy mode), otherwise x402 mode
            api_key = os.environ.get("SELFHEAL_API_KEY") or None
            client = GracefulFail(api_key=api_key)

            request_kwargs: Dict[str, Any] = {}
            if parsed_headers:
                request_kwargs["headers"] = parsed_headers
            if parsed_body is not None:
                request_kwargs["json"] = parsed_body

            response = client.request(method, url, **request_kwargs)
        except RateLimitError as e:
            return f"Rate limit exceeded: {e}. Wait and retry."
        except GracefulFailError as e:
            return f"SelfHeal proxy error: {e}"
        except Exception as e:
            return f"Unexpected error calling SelfHeal: {e}"

        # Format the response for the agent
        if response.healed:
            return self._format_healed(response)

        if response.payment_required:
            return self._format_payment_required(response)

        if response.intercepted:
            return self._format_intercepted(response)

        # Success: return response data as JSON
        if isinstance(response.data, (dict, list)):
            return json.dumps(response.data, indent=2)
        return str(response.data)

    @staticmethod
    def _format_healed(response: Any) -> str:
        ea = response.error_analysis
        lines = [
            f"HEALED via x402 (HTTP {response.status_code})",
            f"Category: {ea.error_category}",
            f"Explanation: {ea.human_readable_explanation}",
            f"Fix: {ea.actionable_fix_for_agent}",
        ]
        if response.settled:
            lines.append(f"Payment settled. TX: {response.tx_hash or 'pending'}")
        return "\n".join(lines)

    @staticmethod
    def _format_payment_required(response: Any) -> str:
        pr = response.payment_required
        accepts = pr.get("accepts", [{}])
        accept = accepts[0] if accepts else {}
        return "\n".join([
            "PAYMENT REQUIRED (x402)",
            f"Error: {pr.get('error', 'Unknown')}",
            f"Price: {accept.get('maxAmountRequired', '?')} atomic USDC on {accept.get('network', 'base')}",
            f"Pay to: {accept.get('payTo', '?')}",
        ])

    @staticmethod
    def _format_intercepted(response: Any) -> str:
        """Format an intercepted error response (legacy mode)."""
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
