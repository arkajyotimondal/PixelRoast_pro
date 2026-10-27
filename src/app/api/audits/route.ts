/**
 * POST /api/audits — create an audit (multipart/form-data)
 *   fields: source = upload | url | html, mode, title?, url?, html?, file? (PNG/JPEG/WebP)
 * GET  /api/audits — the caller's audits (newest first) + their aggregate stats
 *
 * Both are scoped to the anonymous owner cookie. POST is rate-limited per IP.
 */
import { z } from "zod";
import { runAudit } from "@/lib/audit/runAudit";
import { getEnv } from "@/lib/env";
import { ApiError, errorResponse } from "@/lib/http/errors";
import { MAX_UPLOAD_BYTES } from "@/lib/image";
import { clientIp, enforceRateLimit } from "@/lib/security/rateLimit";
import { getOwnerId } from "@/lib/session";
import { getStore } from "@/lib/store";
import { toPublicAudit } from "@/lib/store/types";
import { AUDIT_MODES, type AuditMode } from "@/lib/types";

// Worst case: page fetch (8s) + two Gemini attempts (45s each) + backoff. Platforms like
// Vercel read this to raise the function's time limit above their default.
export const maxDuration = 120;

const MAX_HTML_CHARS = 500_000;
const MAX_BODY_BYTES = MAX_UPLOAD_BYTES + 1024 * 1024; // image + form overhead/html
const LIST_LIMIT = 50;

const FieldsSchema = z
  .object({
    source: z.enum(["upload", "url", "html"]),
    mode: z.enum(AUDIT_MODES as [AuditMode, ...AuditMode[]]).default("roast"),
    title: z.string().max(120).optional(),
    url: z.string().trim().max(2048).optional(),
    html: z.string().max(MAX_HTML_CHARS, "Pasted HTML must be under 500 KB.").optional(),
  })
  .superRefine((f, ctx) => {
    if (f.source === "url" && !f.url) ctx.addIssue({ code: "custom", path: ["url"], message: "A URL is required." });
    if (f.source === "html" && !f.html?.trim()) {
      ctx.addIssue({ code: "custom", path: ["html"], message: "Paste some HTML to audit." });
    }
  });

function str(form: FormData, key: string): string | undefined {
  const v = form.get(key);
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

export async function POST(request: Request) {
  try {
    const env = getEnv();
    const ownerId = await getOwnerId();
    enforceRateLimit(`audit:${clientIp(request.headers)}`, env.RATE_LIMIT_MAX, env.RATE_LIMIT_WINDOW_MS);

    // Reject oversized bodies before buffering them.
    const declared = Number(request.headers.get("content-length") ?? 0);
    if (declared > MAX_BODY_BYTES) throw new ApiError(413, "PAYLOAD_TOO_LARGE", "Request is too large (max ~9 MB).");

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new ApiError(400, "BAD_REQUEST", "Expected multipart/form-data.");
    }

    const parsed = FieldsSchema.safeParse({
      source: str(form, "source"),
      mode: str(form, "mode"),
      title: str(form, "title"),
      url: str(form, "url"),
      html: str(form, "html"),
    });
    if (!parsed.success) throw new ApiError(400, "BAD_REQUEST", parsed.error.issues[0].message);
    const fields = parsed.data;

    const file = form.get("file");
    let image: Buffer | undefined;
    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_UPLOAD_BYTES) throw new ApiError(413, "PAYLOAD_TOO_LARGE", "Images must be under 8 MB.");
      image = Buffer.from(await file.arrayBuffer());
    }
    if (fields.source === "upload" && !image) throw new ApiError(400, "BAD_REQUEST", "Attach a screenshot to audit.");

    const audit = await runAudit({ ownerId, ...fields, image });
    return Response.json(audit, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function GET() {
  try {
    const ownerId = await getOwnerId();
    const audits = (await getStore().listAudits(ownerId, LIST_LIMIT)).map(toPublicAudit);

    const scored = audits.filter((a) => a.overallScore !== null);
    return Response.json({
      audits,
      analytics: {
        totalAudits: audits.length,
        avgScore: scored.length ? Math.round(scored.reduce((s, a) => s + (a.overallScore ?? 0), 0) / scored.length) : 0,
        totalCritical: audits.reduce((s, a) => s + a.issues.filter((i) => i.severity === "Critical").length, 0),
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
