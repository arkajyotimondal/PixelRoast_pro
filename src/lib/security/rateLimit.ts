/**
 * Fixed-window rate limiter keyed by client IP, used on audit creation (each audit
 * costs a Gemini call).
 *
 * Limitation: state lives in this server process, so with N instances the effective
 * limit is N× higher. A shared store (Redis) would fix that; for a single instance
 * or a demo it's sufficient and has no dependencies.
 */
import { ApiError } from "@/lib/http/errors";

interface Window {
  count: number;
  resetAt: number;
}

const windows = new Map<string, Window>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
}

export function checkRateLimit(key: string, max: number, windowMs: number, now = Date.now()): RateLimitResult {
  // Opportunistic cleanup so the map can't grow without bound.
  if (windows.size > 10_000) {
    for (const [k, w] of windows) if (w.resetAt <= now) windows.delete(k);
  }
  let w = windows.get(key);
  if (!w || w.resetAt <= now) {
    w = { count: 0, resetAt: now + windowMs };
    windows.set(key, w);
  }
  w.count++;
  return {
    allowed: w.count <= max,
    remaining: Math.max(0, max - w.count),
    retryAfterSec: Math.ceil((w.resetAt - now) / 1000),
  };
}

export function enforceRateLimit(key: string, max: number, windowMs: number): void {
  const r = checkRateLimit(key, max, windowMs);
  if (!r.allowed) {
    throw new ApiError(429, "RATE_LIMITED", `Too many audits. Try again in ${r.retryAfterSec}s.`, {
      "Retry-After": String(r.retryAfterSec),
    });
  }
}

/**
 * Best-effort client IP. x-forwarded-for is set by the hosting proxy (e.g. Vercel);
 * we take the first hop. Locally there is no proxy, so everything is "local".
 */
export function clientIp(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || headers.get("x-real-ip") || "local";
}

/** Test helper. */
export function resetRateLimits(): void {
  windows.clear();
}
