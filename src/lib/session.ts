/**
 * Anonymous ownership. Each browser gets a random UUID in an httpOnly cookie, and
 * every audit is stored with that ownerId. All reads and deletes filter by it, so
 * one visitor can never see or delete another's audits.
 *
 * The UUID is the credential (122 random bits, unguessable), so it needs no signing.
 * It's httpOnly so page scripts (and XSS) can't read it.
 */
import { cookies } from "next/headers";

const COOKIE = "pr_owner";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Returns this visitor's owner id, issuing a cookie on first contact. Route handlers only. */
export async function getOwnerId(): Promise<string> {
  const store = await cookies();
  const existing = store.get(COOKIE)?.value;
  if (existing && UUID_RE.test(existing)) return existing;

  const id = crypto.randomUUID();
  store.set(COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return id;
}
