/**
 * Picks the storage engine exactly once, from validated env:
 *   MONGODB_URI set → MongoDB (connection errors fail the request; no fallback)
 *   otherwise       → in-memory (allowed in dev, or in prod only with ALLOW_MEMORY_DB=true;
 *                     env.ts refuses to boot in production otherwise)
 */
import { getEnv } from "@/lib/env";
import { memoryStore } from "./memory";
import { createMongoStore } from "./mongo";
import type { AuditStore } from "./types";

let store: AuditStore | null = null;

export function getStore(): AuditStore {
  if (!store) {
    const { MONGODB_URI } = getEnv();
    store = MONGODB_URI ? createMongoStore(MONGODB_URI) : memoryStore;
  }
  return store;
}
