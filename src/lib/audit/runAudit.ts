/**
 * The audit pipeline:
 *
 *   input ──► normalise screenshot (sharp) ──► palette
 *         ──► markup (pasted, or fetched via SSRF guard) ──► deterministic DOM rules
 *         ──► AI review (image, or markup if no image) — may fail, never fatal
 *         ──► merge issues ──► deterministic score ──► store
 *
 * If AI fails, the audit still completes with measured issues only and is labelled
 * "AI unavailable" with the reason.
 */
import { reviewWithAi, type AiInput } from "@/lib/ai/gemini";
import { boxCenterPercent, type AiReview } from "@/lib/ai/schema";
import { analyzeHtml, telemetryFacts, type HtmlAnalysis } from "@/lib/domAnalyzer";
import { ApiError } from "@/lib/http/errors";
import { normalizeImage, type NormalizedImage } from "@/lib/image";
import { extractPalette } from "@/lib/palette";
import { DOM_ASSESSED, computeScores } from "@/lib/scoring";
import { safeFetch } from "@/lib/security/ssrf";
import { getStore } from "@/lib/store";
import { toPublicAudit } from "@/lib/store/types";
import type { AiStatus, AuditIssue, AuditMode, AuditResult, ScoreCategory, SourceType } from "@/lib/types";
import { SCORE_CATEGORIES } from "@/lib/types";

export interface AuditRequest {
  ownerId: string;
  source: SourceType;
  mode: AuditMode;
  title?: string;
  url?: string;
  html?: string;
  image?: Buffer;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
const clampPct = (v: number) => Math.min(100, Math.max(0, v));

async function loadMarkup(req: AuditRequest): Promise<string | null> {
  if (req.source === "html") return req.html ?? null;
  if (req.source !== "url" || !req.url) return null;

  const res = await safeFetch(req.url);
  if (res.status >= 400) throw new ApiError(502, "FETCH_FAILED", `The site responded with HTTP ${res.status}.`);
  if (!/html|xml/i.test(res.contentType)) {
    throw new ApiError(422, "FETCH_FAILED", "That URL did not return an HTML page.");
  }
  return res.body.toString("utf8");
}

function aiIssues(review: AiReview, hasImage: boolean): Omit<AuditIssue, "id">[] {
  return review.issues.map((i) => {
    const c = hasImage ? boxCenterPercent(i.box_2d) : null;
    return {
      ruleId: `ai:${slug(i.category)}-${slug(i.title)}`,
      evidence: "ai-estimated",
      title: i.title,
      severity: i.severity,
      category: i.category,
      heuristic: i.heuristic,
      location: i.location,
      coordinates: c ? { x: clampPct(c.x), y: clampPct(c.y) } : null,
      problem: i.problem,
      recommendation: i.recommendation,
      fixCode: i.fixCode,
    };
  });
}

function fallbackSummary(dom: HtmlAnalysis | null, reason: string): string {
  if (!dom) return `AI review unavailable (${reason}). Screenshots have no markup for deterministic checks, so nothing could be scored — try again shortly, or audit a URL or HTML.`;
  const n = dom.issues.length;
  return `AI review unavailable (${reason}). This report contains only the ${n} measured issue${n === 1 ? "" : "s"} found by deterministic markup checks; visual design was not assessed.`;
}

function defaultTitle(req: AuditRequest): string {
  if (req.title?.trim()) return req.title.trim().slice(0, 120);
  if (req.url) {
    try {
      return new URL(req.url).hostname;
    } catch {
      /* fall through */
    }
  }
  return req.source === "html" ? "Pasted HTML" : "Screenshot audit";
}

export async function runAudit(req: AuditRequest): Promise<AuditResult> {
  const image: NormalizedImage | null = req.image ? await normalizeImage(req.image) : null;
  const markup = await loadMarkup(req);
  if (!image && !markup) throw new ApiError(400, "BAD_REQUEST", "Nothing to audit: provide a screenshot, a URL or HTML.");

  const dom = markup ? analyzeHtml(markup) : null;
  const palette = image ? await extractPalette(image.data) : [];

  const facts = dom ? telemetryFacts(dom) : undefined;
  const aiInput: AiInput = image
    ? { kind: "image", data: image.data, mimeType: image.mimeType, sha256: image.sha256, facts }
    : { kind: "html", html: markup!, facts };
  const outcome = await reviewWithAi(aiInput);

  const merged = [...(dom?.issues ?? []), ...(outcome.ok ? aiIssues(outcome.review, !!image) : [])];
  const issues: AuditIssue[] = merged.map((i, idx) => ({ ...i, id: idx + 1 }));

  const assessed: ScoreCategory[] = outcome.ok ? [...SCORE_CATEGORIES] : dom ? [...DOM_ASSESSED] : [];
  const { overallScore, categoryScores } = computeScores(issues, assessed);

  const ai: AiStatus = outcome.ok
    ? { available: true, model: outcome.model, cached: outcome.cached }
    : { available: false, reason: outcome.reason };
  const summaries = outcome.ok ? outcome.review.summaries : undefined;

  const store = getStore();
  const screenshotRef = image ? await store.putScreenshot(req.ownerId, { data: image.data, mimeType: image.mimeType }) : null;

  const saved = await store.createAudit({
    ownerId: req.ownerId,
    title: defaultTitle(req),
    sourceType: req.source,
    targetUrl: req.url,
    mode: req.mode,
    overallScore,
    categoryScores,
    summary: summaries?.[req.mode] ?? fallbackSummary(dom, ai.reason ?? "unknown error"),
    summaries,
    positives: outcome.ok ? outcome.review.positives : [],
    domTelemetry: dom?.telemetry ?? null,
    colorPalette: palette,
    issues,
    ai,
    screenshot: image && screenshotRef ? { ref: screenshotRef, width: image.width, height: image.height } : null,
  });
  return toPublicAudit(saved);
}
