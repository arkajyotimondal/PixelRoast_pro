/**
 * SSRF guard: fetch a user-supplied URL without letting it reach our own network.
 *
 * Defences, in order:
 *  1. Only http(s), no embedded credentials.
 *  2. Every address the hostname resolves to must be public (net.BlockList below).
 *  3. The check happens inside the socket's `lookup` hook, so the IP we validate is
 *     the IP we connect to — a DNS-rebinding answer can't swap it after the check.
 *  4. Redirects are followed manually (max 5) and every hop is re-validated. Cookies
 *     set during the chain are replayed (per-fetch jar) so login-bounce hosts work.
 *  5. Overall timeout and a byte cap on the *decompressed* body (zip-bomb safe).
 */
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import zlib from "node:zlib";
import type { Readable } from "node:stream";
import { ApiError } from "@/lib/http/errors";
import { CookieJar } from "./cookieJar";

// ─── Address classification ──────────────────────────────────────

// Two separate lists on purpose: Node's BlockList maps IPv4 checks into IPv6 space, so an
// IPv6 rule like ::ffff:0:0/96 in a shared list would match *every* IPv4 address.
const blockedV4 = new net.BlockList();
const blockedV6 = new net.BlockList();
for (const [net4, prefix] of [
  ["0.0.0.0", 8], // "this network"
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local, incl. cloud metadata 169.254.169.254
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // TEST-NET-1
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // TEST-NET-2
  ["203.0.113.0", 24], // TEST-NET-3
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved + broadcast
] as const) {
  blockedV4.addSubnet(net4, prefix, "ipv4");
}
for (const [net6, prefix] of [
  ["::", 128], // unspecified
  ["::1", 128], // loopback
  ["::ffff:0:0", 96], // IPv4-mapped — would let ::ffff:127.0.0.1 bypass the v4 list
  ["64:ff9b::", 96], // NAT64 — embeds an IPv4 address
  ["2001::", 32], // Teredo — embeds an IPv4 address
  ["2001:db8::", 32], // documentation
  ["2002::", 16], // 6to4 — embeds an IPv4 address
  ["fc00::", 7], // unique local (private)
  ["fe80::", 10], // link-local
  ["ff00::", 8], // multicast
] as const) {
  blockedV6.addSubnet(net6, prefix, "ipv6");
}

/** True if `ip` must never be contacted. Anything that isn't a valid IP is blocked. */
export function isBlockedAddress(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 4) return blockedV4.check(ip, "ipv4");
  if (family === 6) return blockedV6.check(ip, "ipv6");
  return true;
}

export type AddressPolicy = (ip: string) => boolean;
const publicOnly: AddressPolicy = (ip) => !isBlockedAddress(ip);

// ─── URL validation ──────────────────────────────────────────────

/** Parse and validate the URL's shape (not its DNS). Throws URL_NOT_ALLOWED. */
export function parseTargetUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new ApiError(400, "URL_NOT_ALLOWED", "That doesn't look like a valid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ApiError(400, "URL_NOT_ALLOWED", "Only http:// and https:// URLs can be audited.");
  }
  if (url.username || url.password) {
    throw new ApiError(400, "URL_NOT_ALLOWED", "URLs with embedded credentials are not allowed.");
  }
  return url;
}

/** WHATWG URL keeps IPv6 literals in brackets ("[::1]"); sockets want them bare. */
function bareHost(url: URL): string {
  return url.hostname.replace(/^\[|\]$/g, "");
}

const denied = () =>
  new ApiError(400, "URL_NOT_ALLOWED", "That address points to a private or reserved network and can't be audited.");

/**
 * Drop-in replacement for dns.lookup that refuses to hand a blocked address to the
 * socket. Node may ask for one address or all of them (happy-eyeballs), so both
 * shapes are supported. We reject if *any* resolved address is blocked.
 */
function guardedLookup(policy: AddressPolicy): net.LookupFunction {
  return (hostname, options, callback) => {
    dns.lookup(hostname, { all: true, verbatim: true }, (err, addresses) => {
      if (err) return callback(err, "", 0);
      if (addresses.length === 0 || addresses.some((a) => !policy(a.address))) {
        return callback(denied() as unknown as NodeJS.ErrnoException, "", 0);
      }
      if (options.all) return (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, addresses);
      callback(null, addresses[0].address, addresses[0].family);
    });
  };
}

// ─── Fetch ───────────────────────────────────────────────────────

export interface SafeFetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  /** Override for tests only; production always uses public-only. */
  policy?: AddressPolicy;
}

export interface SafeFetchResult {
  finalUrl: string;
  status: number;
  contentType: string;
  body: Buffer;
}

export async function safeFetch(rawUrl: string, opts: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const { timeoutMs = 8_000, maxBytes = 2 * 1024 * 1024, maxRedirects = 5, policy = publicOnly } = opts;
  const jar = new CookieJar();
  const signal = AbortSignal.timeout(timeoutMs);
  let url = parseTargetUrl(rawUrl);

  for (let hop = 0; ; hop++) {
    // Literal IPs skip DNS entirely, so they must be checked here.
    const host = bareHost(url);
    if (net.isIP(host) && !policy(host)) throw denied();

    const res = await request(url, policy, signal, jar.header(url));
    jar.store(url, res.headers["set-cookie"]);
    const location = res.headers.location;
    if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && location) {
      res.resume(); // discard redirect body
      if (hop >= maxRedirects) throw new ApiError(502, "FETCH_FAILED", "The page redirected too many times.");
      url = parseTargetUrl(new URL(location, url).toString());
      continue;
    }

    const body = await readCapped(decode(res), maxBytes, signal);
    return {
      finalUrl: url.toString(),
      status: res.statusCode ?? 0,
      contentType: String(res.headers["content-type"] ?? ""),
      body,
    };
  }
}

function request(url: URL, policy: AddressPolicy, signal: AbortSignal, cookie?: string): Promise<http.IncomingMessage> {
  const lib = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const req = lib.request(
      url,
      {
        method: "GET",
        lookup: guardedLookup(policy),
        signal,
        headers: {
          "User-Agent": "PixelRoastBot/1.0 (+accessibility auditor)",
          Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
          "Accept-Encoding": "gzip, deflate, br",
          ...(cookie ? { Cookie: cookie } : {}),
        },
      },
      resolve
    );
    req.on("error", (err) => reject(toApiError(err, signal)));
    req.end();
  });
}

function decode(res: http.IncomingMessage): Readable {
  switch (String(res.headers["content-encoding"] ?? "").toLowerCase()) {
    case "gzip":
      return res.pipe(zlib.createGunzip());
    case "deflate":
      return res.pipe(zlib.createInflate());
    case "br":
      return res.pipe(zlib.createBrotliDecompress());
    default:
      return res;
  }
}

function readCapped(stream: Readable, maxBytes: number, signal: AbortSignal): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const onAbort = () => stream.destroy(toApiError(signal.reason, signal));
    signal.addEventListener("abort", onAbort, { once: true });
    stream.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        stream.destroy(
          new ApiError(502, "FETCH_FAILED", `The page is larger than ${Math.round(maxBytes / 1024)} KB.`)
        );
        return;
      }
      chunks.push(chunk);
    });
    stream.on("end", () => {
      signal.removeEventListener("abort", onAbort);
      resolve(Buffer.concat(chunks));
    });
    stream.on("error", (err) => {
      signal.removeEventListener("abort", onAbort);
      reject(toApiError(err, signal));
    });
  });
}

function toApiError(err: unknown, signal: AbortSignal): ApiError {
  if (err instanceof ApiError) return err;
  if (signal.aborted) return new ApiError(504, "FETCH_FAILED", "The page took too long to respond.");
  const code = (err as NodeJS.ErrnoException)?.code;
  if (code === "ENOTFOUND") return new ApiError(502, "FETCH_FAILED", "That domain could not be resolved.");
  return new ApiError(502, "FETCH_FAILED", "Could not fetch that page.");
}
