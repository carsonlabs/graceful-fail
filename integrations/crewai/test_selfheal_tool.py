"""Unit tests for SelfHealTool (CrewAI integration).

All tests mock the GracefulFail client -- no real network calls are made.
"""

import json
import os
from unittest.mock import MagicMock, patch

import pytest

from integrations.crewai.selfheal_tool import SelfHealTool


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def tool():
    return SelfHealTool()


@pytest.fixture
def env_api_key():
    """Set and clean up the SELFHEAL_API_KEY env var."""
    os.environ["SELFHEAL_API_KEY"] = "gf_test_key_123"
    yield
    os.environ.pop("SELFHEAL_API_KEY", None)


def _make_success_response(data, status_code=200):
    """Build a mock GracefulFailResponse for a successful request."""
    resp = MagicMock()
    resp.intercepted = False
    resp.status_code = status_code
    resp.data = data
    return resp


def _make_intercepted_response(
    status_code=422,
    error_category="validation_error",
    is_retriable=False,
    explanation="Missing required field 'email'.",
    fix="Add the 'email' field to the request body.",
    remove=None,
    add=None,
    modify=None,
):
    """Build a mock GracefulFailResponse for an intercepted error."""
    diff = MagicMock()
    diff.remove = remove or []
    diff.add = add or {}
    diff.modify = modify or {}

    ea = MagicMock()
    ea.error_category = error_category
    ea.is_retriable = is_retriable
    ea.human_readable_explanation = explanation
    ea.actionable_fix_for_agent = fix
    ea.suggested_payload_diff = diff

    resp = MagicMock()
    resp.intercepted = True
    resp.status_code = status_code
    resp.error_analysis = ea
    resp.data = {"graceful_fail_intercepted": True}
    return resp


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestMissingApiKey:
    """SELFHEAL_API_KEY is not set."""

    def test_returns_error_message(self, tool):
        os.environ.pop("SELFHEAL_API_KEY", None)
        result = tool._run(url="https://api.example.com/users")
        assert "SELFHEAL_API_KEY" in result
        assert "not set" in result


class TestSuccessPassThrough:
    """Successful API responses are passed through as JSON."""

    @patch("integrations.crewai.selfheal_tool.GracefulFail")
    def test_get_returns_json(self, MockClient, tool, env_api_key):
        mock_instance = MockClient.return_value
        mock_instance.request.return_value = _make_success_response(
            {"id": 1, "name": "Alice"}
        )

        result = tool._run(url="https://api.example.com/users/1")

        mock_instance.request.assert_called_once_with(
            "GET", "https://api.example.com/users/1"
        )
        parsed = json.loads(result)
        assert parsed["id"] == 1
        assert parsed["name"] == "Alice"

    @patch("integrations.crewai.selfheal_tool.GracefulFail")
    def test_post_with_body(self, MockClient, tool, env_api_key):
        mock_instance = MockClient.return_value
        mock_instance.request.return_value = _make_success_response(
            {"id": 2, "name": "Bob"}, status_code=201
        )

        result = tool._run(
            url="https://api.example.com/users",
            method="POST",
            body='{"name": "Bob"}',
        )

        mock_instance.request.assert_called_once_with(
            "POST",
            "https://api.example.com/users",
            json={"name": "Bob"},
        )
        parsed = json.loads(result)
        assert parsed["name"] == "Bob"

    @patch("integrations.crewai.selfheal_tool.GracefulFail")
    def test_with_custom_headers(self, MockClient, tool, env_api_key):
        mock_instance = MockClient.return_value
        mock_instance.request.return_value = _make_success_response({"ok": True})

        tool._run(
            url="https://api.example.com/data",
            headers='{"X-Custom": "value"}',
        )

        mock_instance.request.assert_called_once_with(
            "GET",
            "https://api.example.com/data",
            headers={"X-Custom": "value"},
        )

    @patch("integrations.crewai.selfheal_tool.GracefulFail")
    def test_string_response(self, MockClient, tool, env_api_key):
        mock_instance = MockClient.return_value
        mock_instance.request.return_value = _make_success_response("plain text")

        result = tool._run(url="https://api.example.com/text")
        assert result == "plain text"


class TestInterceptedError:
    """Intercepted errors are formatted as structured text."""

    @patch("integrations.crewai.selfheal_tool.GracefulFail")
    def test_basic_intercepted_format(self, MockClient, tool, env_api_key):
        mock_instance = MockClient.return_value
        mock_instance.request.return_value = _make_intercepted_response()

        result = tool._run(
            url="https://api.example.com/users",
            method="POST",
            body='{"name": "Alice"}',
        )

        assert "API ERROR INTERCEPTED" in result
        assert "422" in result
        assert "validation_error" in result
        assert "Retriable: No" in result
        assert "Missing required field" in result
        assert "Add the 'email' field" in result

    @patch("integrations.crewai.selfheal_tool.GracefulFail")
    def test_intercepted_with_payload_diff(self, MockClient, tool, env_api_key):
        mock_instance = MockClient.return_value
        mock_instance.request.return_value = _make_intercepted_response(
            status_code=400,
            error_category="bad_request",
            remove=["legacy_field"],
            add={"email": "string"},
            modify={"age": "must be an integer, not a string"},
        )

        result = tool._run(
            url="https://api.example.com/users",
            method="POST",
            body='{"name": "Alice", "legacy_field": "x", "age": "twenty"}',
        )

        assert "Suggested payload changes:" in result
        assert "Remove fields: legacy_field" in result
        assert "Add field: email (string)" in result
        assert "Modify field: age" in result

    @patch("integrations.crewai.selfheal_tool.GracefulFail")
    def test_retriable_error(self, MockClient, tool, env_api_key):
        mock_instance = MockClient.return_value
        mock_instance.request.return_value = _make_intercepted_response(
            status_code=503,
            error_category="server_error",
            is_retriable=True,
            explanation="Service temporarily unavailable.",
            fix="Retry the request after a short delay.",
        )

        result = tool._run(url="https://api.example.com/health")

        assert "Retriable: Yes" in result
        assert "503" in result
        assert "Retry" in result


class TestExceptionHandling:
    """GracefulFail client exceptions are caught and returned as strings."""

    @patch("integrations.crewai.selfheal_tool.GracefulFail")
    def test_auth_error(self, MockClient, tool, env_api_key):
        from graceful_fail.exceptions import AuthenticationError

        mock_instance = MockClient.return_value
        mock_instance.request.side_effect = AuthenticationError()

        result = tool._run(url="https://api.example.com/users")

        assert "invalid" in result.lower()
        assert "SELFHEAL_API_KEY" in result

    @patch("integrations.crewai.selfheal_tool.GracefulFail")
    def test_rate_limit_error(self, MockClient, tool, env_api_key):
        from graceful_fail.exceptions import RateLimitError

        mock_instance = MockClient.return_value
        mock_instance.request.side_effect = RateLimitError(
            message="Monthly limit exceeded", tier="free"
        )

        result = tool._run(url="https://api.example.com/users")

        assert "Rate limit" in result
        assert "pricing" in result.lower() or "upgrade" in result.lower()


class TestInputValidation:
    """Invalid inputs are handled gracefully."""

    def test_invalid_body_json(self, tool, env_api_key):
        result = tool._run(
            url="https://api.example.com/users",
            method="POST",
            body="not valid json",
        )
        assert "Invalid JSON" in result
        assert "body" in result

    def test_invalid_headers_json(self, tool, env_api_key):
        result = tool._run(
            url="https://api.example.com/users",
            headers="not valid json",
        )
        assert "Invalid JSON" in result
        assert "headers" in result

    def test_unsupported_method(self, tool, env_api_key):
        result = tool._run(
            url="https://api.example.com/users",
            method="OPTIONS",
        )
        assert "Unsupported HTTP method" in result
        assert "OPTIONS" in result
