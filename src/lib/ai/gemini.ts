/**
 * Gemini review with bounded failure behaviour.
 *
 *  attempt 1: GEMINI_MODEL               (timeout GEMINI_TIMEOUT_MS each)
 *  wait 1s, then attempt 2: first GEMINI_FALLBACK_MODEL
 *  wait 2s, then attempt 3: second GEMINI_FALLBACK_MODEL (if configured)
 *  (exponential backoff: 1000 × 2^(attempt-2)). Each retry moves to a *different*
 *  model because 503 "overloaded" is per-model and was frequent in testing — retrying
 *  the same overloaded model rarely helps.
 *
 * Any attempt fails on: network/HTTP error, timeout, non-JSON, or Zod validation error.
 * If both fail we return { ok: false, reason } and the caller ships a deterministic-only
 * report labelled "AI unavailable" — an AI outage never loses the measured results.
 *
 * Successful reviews are cached by content hash, so re-auditing the same screenshot is
 * free and returns identical findings (and therefore an identical score).
 */
import { createHash } from "node:crypto";
import { GoogleGenerativeAI, GoogleGenerativeAIFetchError, type Part } from "@google/generative-ai";
import { ZodError } from "zod";
import { getEnv } from "@/lib/env";
import { buildPrompt } from "./prompt";
import { PROMPT_VERSION, parseAiReview, responseSchemaFor, type AiReview } from "./schema";

export type AiInput =
  | { kind: "image"; data: Buffer; mimeType: string; sha256: string; facts?: string }
  | { kind: "html"; html: string; facts?: string };

export type AiOutcome =
  | { ok: true; review: AiReview; model: string; cached: boolean }
  | { ok: false; reason: string };

const MAX_HTML_CHARS = 40_000;
const CACHE_MAX = 100;
const cache = new Map<string, { review: AiReview; model: string }>();

function cacheKey(input: AiInput): string {
  const h = createHash("sha256").update(PROMPT_VERSION).update(input.kind).update(input.facts ?? "");
  if (input.kind === "image") h.update(input.sha256);
  else h.update(input.html.slice(0, MAX_HTML_CHARS));
  return h.digest("hex");
}

function remember(key: string, value: { review: AiReview; model: string }) {
  cache.delete(key);
  cache.set(key, value);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string); // evict oldest
}

/** Turn any failure into a short, user-safe explanation. */
export function describeFailure(err: unknown, timeoutMs: number): string {
  if (err instanceof GoogleGenerativeAIFetchError) {
    if (err.status === 429) return "Gemini rate limit reached";
    if (err.status === 503) return "Gemini is overloaded right now";
    if (err.status === 401 || err.status === 403) return "Gemini rejected the API key";
    if (err.status === 404) return "the configured Gemini model is not available";
    return `Gemini returned HTTP ${err.status ?? "error"}`;
  }
  if (err instanceof ZodError || err instanceof SyntaxError) return "Gemini returned an invalid response";
  if (err instanceof Error && /abort|timeout/i.test(err.name + err.message)) {
    return `Gemini did not respond within ${Math.round(timeoutMs / 1000)}s`;
  }
  return "Gemini request failed";
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function reviewWithAi(input: AiInput): Promise<AiOutcome> {
  const env = getEnv();
  if (!env.GEMINI_API_KEY) return { ok: false, reason: "no GEMINI_API_KEY is configured" };

  const key = cacheKey(input);
  const hit = cache.get(key);
  if (hit) return { ok: true, review: hit.review, model: hit.model, cached: true };

  const parts: Part[] = [{ text: buildPrompt({ kind: input.kind, facts: input.facts }) }];
  if (input.kind === "image") parts.push({ inlineData: { mimeType: input.mimeType, data: input.data.toString("base64") } });
  else parts.push({ text: "```html\n" + input.html.slice(0, MAX_HTML_CHARS) + "\n```" });

  const client = new GoogleGenerativeAI(env.GEMINI_API_KEY);
  const models = [...new Set([env.GEMINI_MODEL, ...env.GEMINI_FALLBACK_MODEL])].slice(0, 3);
  // Always make two attempts; if only one model is configured, retry it.
  const attempts = models.length > 1 ? models : [models[0], models[0]];

  let lastReason = "Gemini request failed";
  for (let i = 0; i < attempts.length; i++) {
    if (i > 0) await sleep(1000 * 2 ** (i - 1));
    const modelName = attempts[i];
    try {
      const model = client.getGenerativeModel(
        {
          model: modelName,
          generationConfig: {
            temperature: 0.2, // low temperature: findings should be stable, not creative
            responseMimeType: "application/json",
            responseSchema: responseSchemaFor(input.kind),
          },
        },
        { timeout: env.GEMINI_TIMEOUT_MS }
      );
      const result = await model.generateContent(parts);
      const review = parseAiReview(result.response.text());
      remember(key, { review, model: modelName });
      return { ok: true, review, model: modelName, cached: false };
    } catch (err) {
      lastReason = describeFailure(err, env.GEMINI_TIMEOUT_MS);
      console.warn(`[PixelRoast AI] ${modelName} attempt ${i + 1} failed: ${lastReason}`, err instanceof Error ? err.message.slice(0, 200) : "");
    }
  }
  return { ok: false, reason: lastReason };
}
