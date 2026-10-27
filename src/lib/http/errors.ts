/**
 * One error shape for every API route:
 *   { "error": { "code": "RATE_LIMITED", "message": "human readable" } }
 *
 * Routes throw ApiError for expected failures; anything else is logged and
 * returned as a generic 500 so internal details (stack traces, upstream
 * messages) never leak to the client.
 */
export type ErrorCode =
  | "BAD_REQUEST"
  | "INVALID_IMAGE"
  | "PAYLOAD_TOO_LARGE"
  | "URL_NOT_ALLOWED"
  | "FETCH_FAILED"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "GONE"
  | "INTERNAL";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly headers: Record<string, string> = {}
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface ApiErrorBody {
  error: { code: ErrorCode; message: string };
}

export function errorResponse(err: unknown): Response {
  if (err instanceof ApiError) {
    return Response.json(
      { error: { code: err.code, message: err.message } } satisfies ApiErrorBody,
      { status: err.status, headers: err.headers }
    );
  }
  console.error("[PixelRoast API] Unhandled error:", err);
  return Response.json(
    { error: { code: "INTERNAL", message: "Something went wrong on our side. Please try again." } } satisfies ApiErrorBody,
    { status: 500 }
  );
}
