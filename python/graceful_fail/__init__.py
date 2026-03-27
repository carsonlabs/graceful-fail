"""
Graceful Fail — Self-healing API proxy for AI agents.

Route your HTTP calls through Graceful Fail and get structured,
LLM-powered fix instructions when APIs return errors.

Usage:
    from graceful_fail import GracefulFail

    gf = GracefulFail(api_key="gf_your_key")
    response = gf.request("POST", "https://api.example.com/users", json={"name": "Alice"})

    if response.intercepted:
        print(response.error_analysis.actionable_fix_for_agent)
    else:
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

__version__ = "0.1.0"
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
