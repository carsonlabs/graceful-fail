"""Response models for Graceful Fail API responses."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class PayloadDiff:
    """Suggested changes to fix the request payload."""

    remove: List[str] = field(default_factory=list)
    add: Dict[str, Any] = field(default_factory=dict)
    modify: Dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> PayloadDiff:
        return cls(
            remove=data.get("remove", []),
            add=data.get("add", {}),
            modify=data.get("modify", {}),
        )

    def apply(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Apply the suggested diff to a payload and return the corrected version.

        Supports dot-notation keys for nested fields (e.g. "messages.0.role").
        """
        import copy
        import json

        result = copy.deepcopy(payload)

        def _set_nested(obj: Any, path: str, value: Any) -> None:
            parts = path.split(".")
            current = obj
            for part in parts[:-1]:
                if isinstance(current, list):
                    current = current[int(part)]
                elif isinstance(current, dict):
                    current.setdefault(part, {})
                    current = current[part]
                else:
                    return
            last = parts[-1]
            if isinstance(current, list):
                current[int(last)] = value
            elif isinstance(current, dict):
                current[last] = value

        def _delete_nested(obj: Any, path: str) -> None:
            parts = path.split(".")
            current = obj
            for part in parts[:-1]:
                if isinstance(current, list):
                    current = current[int(part)]
                elif isinstance(current, dict):
                    if part not in current:
                        return
                    current = current[part]
                else:
                    return
            last = parts[-1]
            if isinstance(current, dict):
                current.pop(last, None)

        for key in self.remove:
            _delete_nested(result, key)
        for key, value in self.add.items():
            _set_nested(result, key, value)
        for key, value in self.modify.items():
            _set_nested(result, key, value)

        return result


@dataclass
class ErrorAnalysis:
    """LLM-generated analysis of an API error."""

    is_retriable: bool
    human_readable_explanation: str
    actionable_fix_for_agent: str
    suggested_payload_diff: PayloadDiff
    error_category: str

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> ErrorAnalysis:
        return cls(
            is_retriable=data.get("is_retriable", False),
            human_readable_explanation=data.get("human_readable_explanation", ""),
            actionable_fix_for_agent=data.get("actionable_fix_for_agent", ""),
            suggested_payload_diff=PayloadDiff.from_dict(
                data.get("suggested_payload_diff", {})
            ),
            error_category=data.get("error_category", "unknown"),
        )


@dataclass
class GracefulFailResponse:
    """Unified response from the Graceful Fail proxy.

    Attributes:
        status_code: HTTP status code from the destination API.
        intercepted: True if the error was intercepted and analyzed by the LLM.
        data: The response body. On success, the raw destination response.
            On interception, the full Graceful Fail envelope.
        error_analysis: LLM-generated error analysis (only when intercepted).
        raw_response: The raw destination API response body.
        credits_used: Number of credits consumed (0 for pass-through, 1 for intercepted).
        duration_ms: Total proxy round-trip time in milliseconds.
    """

    status_code: int
    intercepted: bool
    auto_fixed: bool = False
    data: Any = None
    error_analysis: Optional[ErrorAnalysis] = None
    raw_response: Any = None
    applied_diff: Optional[PayloadDiff] = None
    credits_used: int = 0
    duration_ms: int = 0

    @classmethod
    def from_success(cls, status_code: int, data: Any) -> GracefulFailResponse:
        return cls(
            status_code=status_code,
            intercepted=False,
            auto_fixed=False,
            data=data,
        )

    @classmethod
    def from_auto_fixed(cls, data: Dict[str, Any]) -> GracefulFailResponse:
        meta = data.get("meta", {})
        original_error = data.get("original_error", {})
        return cls(
            status_code=meta.get("retry_status_code", 0),
            intercepted=True,
            auto_fixed=True,
            data=data.get("data"),
            error_analysis=ErrorAnalysis.from_dict(original_error.get("error_analysis", {})),
            raw_response=original_error.get("raw_response"),
            applied_diff=PayloadDiff.from_dict(data.get("applied_diff", {})),
            credits_used=meta.get("credits_used", 1),
            duration_ms=meta.get("duration_ms", 0),
        )

    @classmethod
    def from_intercepted(cls, data: Dict[str, Any]) -> GracefulFailResponse:
        meta = data.get("meta", {})
        return cls(
            status_code=data.get("original_status_code", 0),
            intercepted=True,
            auto_fixed=False,
            data=data,
            error_analysis=ErrorAnalysis.from_dict(data.get("error_analysis", {})),
            raw_response=data.get("raw_destination_response"),
            credits_used=meta.get("credits_used", 1),
            duration_ms=meta.get("duration_ms", 0),
        )
