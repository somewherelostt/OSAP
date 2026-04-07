/**
 * Custom error classes for Composio Tool Router
 */

/**
 * Base error class for all Tool Router errors
 */
export class ToolRouterError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode?: number,
    public readonly retryable: boolean = false,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = "ToolRouterError";
    // Fix prototype chain for instanceof checks
    Object.setPrototypeOf(this, ToolRouterError.prototype);
  }
}

/**
 * Error thrown when authentication is required for a toolkit
 */
export class AuthRequiredError extends ToolRouterError {
  constructor(
    public readonly linkUrl: string,
    public readonly toolkitSlug: string,
    public readonly expiresAt: Date
  ) {
    super(
      `Authentication required for ${toolkitSlug}`,
      "AUTH_REQUIRED",
      401,
      false
    );
    this.name = "AuthRequiredError";
    Object.setPrototypeOf(this, AuthRequiredError.prototype);
  }
}

/**
 * Error thrown when a session has expired
 */
export class SessionExpiredError extends ToolRouterError {
  constructor(sessionId: string) {
    super(
      `Session ${sessionId} has expired`,
      "SESSION_EXPIRED",
      401,
      true // Can retry by creating new session
    );
    this.name = "SessionExpiredError";
    Object.setPrototypeOf(this, SessionExpiredError.prototype);
  }
}

/**
 * Error thrown when session limit is exceeded for a project
 */
export class SessionLimitExceededError extends ToolRouterError {
  constructor(projectId: string, maxSessions: number) {
    super(
      `Session limit exceeded for project ${projectId}. Maximum: ${maxSessions}`,
      "SESSION_LIMIT_EXCEEDED",
      429,
      true
    );
    this.name = "SessionLimitExceededError";
    Object.setPrototypeOf(this, SessionLimitExceededError.prototype);
  }
}

/**
 * Error thrown when a tool execution fails
 */
export class ToolExecutionError extends ToolRouterError {
  constructor(
    message: string,
    public readonly toolSlug: string,
    public readonly executionId: string,
    public readonly originalError?: Error,
    context?: Record<string, unknown>,
    code: string = "TOOL_EXECUTION_FAILED",
    statusCode: number = 500
  ) {
    super(message, code, statusCode, false, context);
    this.name = "ToolExecutionError";
    Object.setPrototypeOf(this, ToolExecutionError.prototype);
  }
}

/**
 * Error thrown when file mounting fails
 */
export class FileMountError extends ToolRouterError {
  constructor(
    message: string,
    public readonly fileName: string,
    public readonly reason: "size_exceeded" | "invalid_type" | "upload_failed" | "not_found"
  ) {
    super(message, "FILE_MOUNT_ERROR", 400, false);
    this.name = "FileMountError";
    Object.setPrototypeOf(this, FileMountError.prototype);
  }
}

/**
 * Error thrown when the API returns an unexpected response
 */
export class ApiResponseError extends ToolRouterError {
  constructor(
    message: string,
    public readonly responseBody: unknown,
    statusCode: number
  ) {
    super(
      message,
      "API_RESPONSE_ERROR",
      statusCode,
      [429, 500, 502, 503, 504].includes(statusCode)
    );
    this.name = "ApiResponseError";
    Object.setPrototypeOf(this, ApiResponseError.prototype);
  }
}

/**
 * Error thrown when a network request fails
 */
export class NetworkError extends ToolRouterError {
  constructor(
    message: string,
    public readonly originalError?: Error
  ) {
    super(message, "NETWORK_ERROR", undefined, true);
    this.name = "NetworkError";
    Object.setPrototypeOf(this, NetworkError.prototype);
  }
}

/**
 * Wraps an async operation with standardized error handling
 * @param operation - The async operation to execute
 * @param context - Context information for error reporting
 * @returns The result of the operation
 */
export async function withErrorHandling<T>(
  operation: () => Promise<T>,
  context: { toolSlug?: string; sessionId?: string; projectId?: string } = {}
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    // Re-throw if it's already a ToolRouterError
    if (error instanceof ToolRouterError) {
      throw error;
    }

    // Handle Response errors (from fetch)
    if (error instanceof Response) {
      const status = error.status;
      
      try {
        const body = await error.json();

        // Handle authentication required
        if (status === 401 && body.linkUrl) {
          throw new AuthRequiredError(
            body.linkUrl,
            body.toolkitSlug || context.toolSlug || "unknown",
            new Date(body.expiresAt)
          );
        }

        // Handle session expired
        if (status === 404 && body.error?.includes("session")) {
          throw new SessionExpiredError(context.sessionId || "unknown");
        }

        // Generic API error
        throw new ApiResponseError(
          body.error?.message || `HTTP ${status} error`,
          body,
          status
        );
      } catch (parseError) {
        // If JSON parsing fails, treat as generic error
        throw new ApiResponseError(
          `HTTP ${status} error: ${error.statusText}`,
          null,
          status
        );
      }
    }

    // Handle standard Error objects
    if (error instanceof Error) {
      // Check for network-related errors
      if (
        error.message.includes("fetch") ||
        error.message.includes("network") ||
        error.message.includes("ECONNREFUSED") ||
        error.message.includes("ETIMEDOUT")
      ) {
        throw new NetworkError(error.message, error);
      }

      // Generic tool execution error
      if (context.toolSlug) {
        throw new ToolExecutionError(
          error.message,
          context.toolSlug,
          "unknown",
          error,
          context
        );
      }

      throw new ToolRouterError(
        error.message,
        "UNKNOWN_ERROR",
        undefined,
        false,
        { originalError: error.message, ...context }
      );
    }

    // Handle unknown error types
    throw new ToolRouterError(
      String(error),
      "UNKNOWN_ERROR",
      undefined,
      false,
      { originalError: error, ...context }
    );
  }
}
