/**
 * GET /api/health — operational status for deploy checks. Reports configuration,
 * never secret values. Kept out of the main UI on purpose.
 */
import { connection } from "next/server";
import { getEnv } from "@/lib/env";
import { errorResponse } from "@/lib/http/errors";
import { getStore } from "@/lib/store";

export async function GET() {
  // Opt out of build-time prerendering (Cache Components): this must reflect runtime env.
  await connection();
  try {
    const env = getEnv();
    return Response.json({
      status: "ok",
      db: getStore().engine,
      ai: env.GEMINI_API_KEY
        ? { configured: true, model: env.GEMINI_MODEL, fallbackModels: env.GEMINI_FALLBACK_MODEL }
        : { configured: false },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
