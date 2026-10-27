/**
 * Volatile in-memory store for local development (or an explicit ALLOW_MEMORY_DB demo).
 * Data is lost on restart and not shared between server instances.
 * Capped so a long-running dev server can't grow without bound.
 */
import type { AuditRecord, AuditStore, StoredAudit, StoredImage } from "./types";

const MAX_AUDITS = 200;

interface MemoryState {
  audits: StoredAudit[];
  images: Map<string, StoredImage & { ownerId: string }>;
}

declare global {
  var memoryStore: MemoryState | undefined;
}

// globalThis survives dev hot-reloads of this module.
const state: MemoryState = (globalThis.memoryStore ??= { audits: [], images: new Map() });

export const memoryStore: AuditStore = {
  engine: "memory",

  async createAudit(record: AuditRecord) {
    const doc: StoredAudit = { ...structuredClone(record), _id: crypto.randomUUID(), createdAt: new Date() };
    state.audits.unshift(doc);
    for (const evicted of state.audits.splice(MAX_AUDITS)) {
      if (evicted.screenshot) state.images.delete(evicted.screenshot.ref);
    }
    return structuredClone(doc);
  },

  async listAudits(ownerId, limit) {
    return state.audits.filter((a) => a.ownerId === ownerId).slice(0, limit).map((a) => structuredClone(a));
  },

  async getAudit(ownerId, id) {
    const a = state.audits.find((x) => x._id === id && x.ownerId === ownerId);
    return a ? structuredClone(a) : null;
  },

  async deleteAudit(ownerId, id) {
    const idx = state.audits.findIndex((x) => x._id === id && x.ownerId === ownerId);
    if (idx === -1) return false;
    const [removed] = state.audits.splice(idx, 1);
    if (removed.screenshot) state.images.delete(removed.screenshot.ref);
    return true;
  },

  async putScreenshot(ownerId, image) {
    const ref = crypto.randomUUID();
    state.images.set(ref, { ...image, ownerId });
    return ref;
  },

  async getScreenshot(ownerId, ref) {
    const img = state.images.get(ref);
    return img && img.ownerId === ownerId ? { data: img.data, mimeType: img.mimeType } : null;
  },
};
