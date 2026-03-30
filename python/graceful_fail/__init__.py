"""
SelfHeal (graceful-fail) — Self-healing API proxy for AI agents.

Route your HTTP calls through SelfHeal. When an API returns an error,
SelfHeal diagnoses it with an LLM, fixes the payload, and retries
automatically — returning a success response as if nothing went wrong.

Usage:
    from graceful_fail import GracefulFail

    gf = GracefulFail(api_key="gf_your_key")
    response = gf.request("POST", "https://api.openai.com/v1/chat/completions",
        json={"model": "gpt-4o-mini", "messages": [{"role": "user", "content": "Hi"}]},
        headers={"Authorization": "Bearer sk-..."},
    )

    if response.auto_fixed:
        # SelfHeal fixed the payload and retried successfully
        print("Auto-fixed!", response.data)
        print("What was changed:", response.applied_diff)
    elif response.intercepted:
        # Error detected but couldn't be auto-fixed
        print(response.error_analysis.actionable_fix_for_agent)
    else:
        # Success — passed through transparently
        print(response.data)
"""

from graceful_fail.client import GracefulFail, GracefulFailAsync
from graceful_fail.models import (
    GracefulFailResponse,
    ErrorAnalysis,
    PayloadDiff,
)
from graceful_fail.exceptions import (
    GracefulFailError,
    AuthenticationError,
    RateLimitError,
    ProxyError,
)

__version__ = "0.3.0"
__all__ = [
    "GracefulFail",
    "GracefulFailAsync",
    "GracefulFailResponse",
    "ErrorAnalysis",
    "PayloadDiff",
    "GracefulFailError",
    "AuthenticationError",
    "RateLimitError",
    "ProxyError",
]
