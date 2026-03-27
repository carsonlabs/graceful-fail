"""Exception classes for the Graceful Fail client."""


class GracefulFailError(Exception):
    """Base exception for Graceful Fail errors."""

    def __init__(self, message: str, status_code: int = 0):
        self.status_code = status_code
        super().__init__(message)


class AuthenticationError(GracefulFailError):
    """Raised when the API key is missing or invalid."""

    def __init__(self, message: str = "Invalid or missing API key."):
        super().__init__(message, status_code=401)


class RateLimitError(GracefulFailError):
    """Raised when the monthly request limit is exceeded."""

    def __init__(self, message: str, tier: str = "", used: int = 0, limit: int = 0):
        self.tier = tier
        self.used = used
        self.limit = limit
        super().__init__(message, status_code=429)


class ProxyError(GracefulFailError):
    """Raised when the proxy itself encounters an error (502, network, etc.)."""
    pass
