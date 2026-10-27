/**
 * Retired. This endpoint duplicated POST /api/audits without validation, ownership,
 * rate limiting or persistence — effectively an open proxy to our Gemini key.
 */
import { ApiError, errorResponse } from "@/lib/http/errors";

export async function POST() {
  return errorResponse(new ApiError(410, "GONE", "This endpoint was removed. Use POST /api/audits."));
}
