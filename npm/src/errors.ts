/** Base error class for Graceful Fail errors. */
export class GracefulFailError extends Error {
  public statusCode: number;

  constructor(message: string, statusCode = 0) {
    super(message);
    this.name = "GracefulFailError";
    this.statusCode = statusCode;
  }
}

/** Raised when the API key is missing or invalid. */
export class AuthenticationError extends GracefulFailError {
  constructor(message = "Invalid or missing API key.") {
    super(message, 401);
    this.name = "AuthenticationError";
  }
}

/** Raised when the monthly request limit is exceeded. */
export class RateLimitError extends GracefulFailError {
  public tier: string;

  constructor(message: string, tier = "") {
    super(message, 429);
    this.name = "RateLimitError";
    this.tier = tier;
  }
}

/** Raised when the proxy itself encounters an error. */
export class ProxyError extends GracefulFailError {
  constructor(message: string, statusCode = 502) {
    super(message, statusCode);
    this.name = "ProxyError";
  }
}
