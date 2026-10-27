/**
 * GET /api/audits/[id]/screenshot — the normalised screenshot the audit was run on.
 * Owner-checked twice: the audit must be the caller's, and so must the image.
 */
import { ApiError, errorResponse } from "@/lib/http/errors";
import { getOwnerId } from "@/lib/session";
import { getStore } from "@/lib/store";

export async function GET(_req: Request, ctx: RouteContext<"/api/audits/[id]/screenshot">) {
  try {
    const { id } = await ctx.params;
    const ownerId = await getOwnerId();
    const store = getStore();
    const audit = await store.getAudit(ownerId, id);
    const image = audit?.screenshot ? await store.getScreenshot(ownerId, audit.screenshot.ref) : null;
    if (!image) throw new ApiError(404, "NOT_FOUND", "Screenshot not found.");

    return new Response(new Uint8Array(image.data), {
      headers: {
        "Content-Type": image.mimeType,
        // Screenshots never change once stored; private because they're per-owner.
        "Cache-Control": "private, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
