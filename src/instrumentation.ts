/**
 * Runs once when a Next.js server instance starts (not during `next build`).
 * Validating env here makes a misconfigured deployment crash at boot, loudly.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getEnv } = await import("@/lib/env");
    const env = getEnv();
    const db = env.MONGODB_URI ? "mongodb" : "in-memory (volatile)";
    const ai = env.GEMINI_API_KEY ? env.GEMINI_MODEL : "disabled (no GEMINI_API_KEY)";
    console.log(`[PixelRoast] env ok — db: ${db}, ai: ${ai}`);
  }
}
