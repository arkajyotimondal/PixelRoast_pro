/**
 * Storage contract. Every method takes ownerId, so ownership is enforced by the
 * store's queries themselves — a route can't forget the check.
 */
import type { AuditResult } from "@/lib/types";

export interface AuditRecord extends Omit<AuditResult, "_id" | "screenshot" | "createdAt"> {
  ownerId: string;
  screenshot: { ref: string; width: number; height: number } | null;
}

export interface StoredAudit extends AuditRecord {
  _id: string;
  createdAt: Date;
}

export interface StoredImage {
  data: Buffer;
  mimeType: string;
}

export interface AuditStore {
  readonly engine: "mongodb" | "memory";
  createAudit(record: AuditRecord): Promise<StoredAudit>;
  listAudits(ownerId: string, limit: number): Promise<StoredAudit[]>;
  getAudit(ownerId: string, id: string): Promise<StoredAudit | null>;
  /** Also removes the audit's screenshot. */
  deleteAudit(ownerId: string, id: string): Promise<boolean>;
  putScreenshot(ownerId: string, image: StoredImage): Promise<string>;
  getScreenshot(ownerId: string, ref: string): Promise<StoredImage | null>;
}

/** Shape returned to clients: no ownerId, screenshot as a URL. */
export function toPublicAudit(a: StoredAudit): AuditResult {
  const { ownerId: _owner, screenshot, createdAt, _id, ...rest } = a;
  void _owner;
  return {
    ...rest,
    _id,
    createdAt: createdAt.toISOString(),
    screenshot: screenshot
      ? { url: `/api/audits/${_id}/screenshot`, width: screenshot.width, height: screenshot.height }
      : null,
  };
}
