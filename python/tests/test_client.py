"""Tests for the Graceful Fail Python client."""

import json
import pytest
import httpx
import respx

from graceful_fail import (
    GracefulFail,
    GracefulFailAsync,
    GracefulFailResponse,
    ErrorAnalysis,
    PayloadDiff,
)
from graceful_fail.exceptions import AuthenticationError, RateLimitError, ProxyError

PROXY_URL = "https://selfheal.dev/api/proxy"
API_KEY = "gf_test_key_123"


# -- Model tests --

class TestPayloadDiff:
    def test_from_dict(self):
        diff = PayloadDiff.from_dict({
            "remove": ["name"],
            "add": {"first_name": "string", "last_name": "string"},
            "modify": {},
        })
        assert diff.remove == ["name"]
        assert diff.add == {"first_name": "string", "last_name": "string"}
        assert diff.modify == {}

    def test_apply(self):
        diff = PayloadDiff(
            remove=["name"],
            add={"first_name": "string"},
            modify={"email": "alice@example.com"},
        )
        result = diff.apply({"name": "Alice", "email": "wrong"})
        assert "name" not in result
        assert result["email"] == "alice@example.com"
        assert result["first_name"] == "<string>"

    def test_apply_preserves_existing_add_keys(self):
        diff = PayloadDiff(add={"email": "string"})
        result = diff.apply({"email": "alice@example.com"})
        assert result["email"] == "alice@example.com"  # not overwritten


class TestErrorAnalysis:
    def test_from_dict(self):
        ea = ErrorAnalysis.from_dict({
            "is_retriable": False,
            "human_readable_explanation": "Missing email field",
            "actionable_fix_for_agent": "Add email field",
            "suggested_payload_diff": {"remove": [], "add": {"email": "string"}, "modify": {}},
            "error_category": "validation_error",
        })
        assert ea.is_retriable is False
        assert ea.error_category == "validation_error"
        assert ea.suggested_payload_diff.add == {"email": "string"}


class TestGracefulFailResponse:
    def test_from_success(self):
        resp = GracefulFailResponse.from_success(200, {"id": 1})
        assert resp.status_code == 200
        assert resp.intercepted is False
        assert resp.data == {"id": 1}
        assert resp.error_analysis is None

    def test_from_intercepted(self):
        data = {
            "graceful_fail_intercepted": True,
            "original_status_code": 422,
            "destination_url": "https://api.example.com/users",
            "error_analysis": {
                "is_retriable": False,
                "human_readable_explanation": "Missing required field",
                "actionable_fix_for_agent": "Add the email field",
                "suggested_payload_diff": {"remove": [], "add": {"email": "string"}, "modify": {}},
                "error_category": "validation_error",
            },
            "raw_destination_response": {"error": "Unprocessable Entity"},
            "meta": {"credits_used": 1, "duration_ms": 312, "tier": "hobby"},
        }
        resp = GracefulFailResponse.from_intercepted(data)
        assert resp.status_code == 422
        assert resp.intercepted is True
        assert resp.credits_used == 1
        assert resp.error_analysis.actionable_fix_for_agent == "Add the email field"
        assert resp.raw_response == {"error": "Unprocessable Entity"}


# -- Client tests --

class TestGracefulFailClient:
    def test_requires_api_key(self):
        with pytest.raises(ValueError, match="api_key is required"):
            GracefulFail(api_key="")

    @respx.mock
    def test_success_passthrough(self):
        respx.post(PROXY_URL).mock(
            return_value=httpx.Response(200, json={"id": 42, "name": "Alice"})
        )

        gf = GracefulFail(api_key=API_KEY)
        resp = gf.get("https://api.example.com/users/42")

        assert resp.status_code == 200
        assert resp.intercepted is False
        assert resp.data == {"id": 42, "name": "Alice"}

    @respx.mock
    def test_intercepted_error(self):
        envelope = {
            "graceful_fail_intercepted": True,
            "original_status_code": 422,
            "destination_url": "https://api.example.com/users",
            "error_analysis": {
                "is_retriable": False,
                "human_readable_explanation": "Missing email",
                "actionable_fix_for_agent": "Add email field",
                "suggested_payload_diff": {"remove": [], "add": {"email": "string"}, "modify": {}},
                "error_category": "validation_error",
            },
            "raw_destination_response": {"error": "Validation failed"},
            "meta": {"credits_used": 1, "duration_ms": 250, "tier": "hobby"},
        }
        respx.post(PROXY_URL).mock(
            return_value=httpx.Response(422, json=envelope)
        )

        gf = GracefulFail(api_key=API_KEY)
        resp = gf.post("https://api.example.com/users", json={"name": "Alice"})

        assert resp.intercepted is True
        assert resp.error_analysis.error_category == "validation_error"
        assert resp.error_analysis.actionable_fix_for_agent == "Add email field"

    @respx.mock
    def test_auth_error(self):
        respx.post(PROXY_URL).mock(
            return_value=httpx.Response(401, json={"error": "Invalid API key"})
        )

        gf = GracefulFail(api_key="gf_bad_key")
        with pytest.raises(AuthenticationError):
            gf.get("https://api.example.com/users")

    @respx.mock
    def test_rate_limit_error(self):
        respx.post(PROXY_URL).mock(
            return_value=httpx.Response(429, json={"error": "Rate limit exceeded"})
        )

        gf = GracefulFail(api_key=API_KEY)
        with pytest.raises(RateLimitError):
            gf.get("https://api.example.com/users")

    @respx.mock
    def test_proxy_error(self):
        respx.post(PROXY_URL).mock(
            return_value=httpx.Response(502, json={"error": "Proxy error"})
        )

        gf = GracefulFail(api_key=API_KEY)
        with pytest.raises(ProxyError):
            gf.get("https://api.example.com/users")

    @respx.mock
    def test_sends_correct_headers(self):
        route = respx.post(PROXY_URL).mock(
            return_value=httpx.Response(200, json={"ok": True})
        )

        gf = GracefulFail(api_key=API_KEY)
        gf.post(
            "https://api.example.com/data",
            json={"key": "value"},
            headers={"X-Custom": "test"},
        )

        request = route.calls[0].request
        assert request.headers["authorization"] == f"Bearer {API_KEY}"
        assert request.headers["x-destination-url"] == "https://api.example.com/data"
        assert request.headers["x-destination-method"] == "POST"
        assert request.headers["x-custom"] == "test"

    @respx.mock
    def test_context_manager(self):
        respx.post(PROXY_URL).mock(
            return_value=httpx.Response(200, json={"ok": True})
        )

        with GracefulFail(api_key=API_KEY) as gf:
            resp = gf.get("https://api.example.com/health")
            assert resp.data == {"ok": True}


# -- Async client tests --

class TestGracefulFailAsyncClient:
    @respx.mock
    @pytest.mark.asyncio
    async def test_async_success(self):
        respx.post(PROXY_URL).mock(
            return_value=httpx.Response(200, json={"id": 1})
        )

        async with GracefulFailAsync(api_key=API_KEY) as gf:
            resp = await gf.get("https://api.example.com/users/1")
            assert resp.status_code == 200
            assert resp.data == {"id": 1}

    @respx.mock
    @pytest.mark.asyncio
    async def test_async_intercepted(self):
        envelope = {
            "graceful_fail_intercepted": True,
            "original_status_code": 500,
            "destination_url": "https://api.example.com/crash",
            "error_analysis": {
                "is_retriable": True,
                "human_readable_explanation": "Server error",
                "actionable_fix_for_agent": "Retry after 5 seconds",
                "suggested_payload_diff": {"remove": [], "add": {}, "modify": {}},
                "error_category": "server_error",
            },
            "raw_destination_response": "Internal Server Error",
            "meta": {"credits_used": 1, "duration_ms": 100, "tier": "pro"},
        }
        respx.post(PROXY_URL).mock(
            return_value=httpx.Response(500, json=envelope)
        )

        async with GracefulFailAsync(api_key=API_KEY) as gf:
            resp = await gf.get("https://api.example.com/crash")
            assert resp.intercepted is True
            assert resp.error_analysis.is_retriable is True
