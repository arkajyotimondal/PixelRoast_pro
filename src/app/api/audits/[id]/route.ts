/**
 * GET    /api/audits/[id] — one audit, if it belongs to the caller
 * DELETE /api/audits/[id] — delete it (and its screenshot), if it belongs to the caller
 *
 * Someone else's audit returns 404, not 403, so ids can't be probed for existence.
 */
import { ApiError, errorResponse } from "@/lib/http/errors";
import { getOwnerId } from "@/lib/session";
import { getStore } from "@/lib/store";
import { toPublicAudit } from "@/lib/store/types";

const notFound = () => new ApiError(404, "NOT_FOUND", "Audit not found.");

export async function GET(_req: Request, ctx: RouteContext<"/api/audits/[id]">) {
  try {
    const { id } = await ctx.params;
    const audit = await getStore().getAudit(await getOwnerId(), id);
    if (!audit) throw notFound();
    return Response.json(toPublicAudit(audit));
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/audits/[id]">) {
  try {
    const { id } = await ctx.params;
    const deleted = await getStore().deleteAudit(await getOwnerId(), id);
    if (!deleted) throw notFound();
    return Response.json({ deletedId: id });
  } catch (err) {
    return errorResponse(err);
  }
}
