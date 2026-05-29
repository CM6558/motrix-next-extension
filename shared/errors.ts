/** Base class for all extension errors. */
class ExtensionError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ExtensionError';
  }
}

/** API communication errors. */
export class ApiError extends ExtensionError {
  constructor(
    message: string,
    public readonly apiCode?: number,
    cause?: unknown,
  ) {
    super(message, 'API_ERROR', cause);
    this.name = 'ApiError';
  }
}

/** API endpoint is unreachable (network error, timeout). */
export class ApiUnreachableError extends ApiError {
  constructor(cause?: unknown) {
    super('Cannot connect to Motrix Next API', -1, cause);
    this.name = 'ApiUnreachableError';
  }
}

/** API secret is incorrect. */
export class ApiAuthError extends ApiError {
  constructor(cause?: unknown) {
    super('HTTP 401 Unauthorized: API secret is incorrect', 401, cause);
    this.name = 'ApiAuthError';
  }
}

/** API call timed out. */
export class ApiTimeoutError extends ApiError {
  constructor(timeoutMs: number) {
    super(`API call timed out after ${timeoutMs}ms`, -2);
    this.name = 'ApiTimeoutError';
  }
}
