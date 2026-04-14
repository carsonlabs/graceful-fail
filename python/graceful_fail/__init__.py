"""
SelfHeal (graceful-fail) — Self-healing API proxy for AI agents.

Supports two modes:
- **x402 mode** (default): No API key. Pay per successful heal in USDC.
- **Legacy mode**: API key auth with monthly tiers.

x402 usage (recommended):
    from graceful_fail import GracefulFail

    gf = GracefulFail()  # No API key needed
    resp = gf.post("https://api.example.com/users", json={"name": "Alice"})

    if resp.healed:
        print("Fix:", resp.error_analysis.actionable_fix_for_agent)
    elif resp.payment_required:
        print("Payment needed:", resp.payment_required)
    else:
        print("Success:", resp.data)

Legacy usage:
    gf = GracefulFail(api_key="gf_your_key")
    resp = gf.post(url, json=payload)
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

__version__ = "0.4.0"
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
