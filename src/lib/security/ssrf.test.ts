import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isBlockedAddress, parseTargetUrl, safeFetch } from "./ssrf";

describe("isBlockedAddress", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254", // cloud metadata
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "::1",
    "::",
    "fe80::1",
    "fd00::1",
    "::ffff:127.0.0.1", // IPv4-mapped loopback
    "::ffff:7f00:1", // same, hex form
    "64:ff9b::a9fe:a9fe", // NAT64 of 169.254.169.254
    "not-an-ip",
  ])("blocks %s", (ip) => expect(isBlockedAddress(ip)).toBe(true));

  it.each(["8.8.8.8", "1.1.1.1", "172.32.0.1", "2606:4700:4700::1111"])("allows public %s", (ip) =>
    expect(isBlockedAddress(ip)).toBe(false)
  );
});

describe("parseTargetUrl", () => {
  it.each(["file:///etc/passwd", "ftp://example.com", "gopher://x", "javascript:alert(1)", "not a url"])(
    "rejects %s",
    (u) => expect(() => parseTargetUrl(u)).toThrow()
  );
  it("rejects embedded credentials", () => expect(() => parseTargetUrl("http://a:b@example.com")).toThrow());
  it("accepts normal https", () => expect(parseTargetUrl(" https://example.com/x ").hostname).toBe("example.com"));
});

describe("safeFetch with the real public-only policy", () => {
  it.each([
    "http://127.0.0.1/",
    "http://localhost/",
    "http://[::1]/",
    "http://169.254.169.254/latest/meta-data/",
    "http://0x7f000001/", // WHATWG URL normalises hex to 127.0.0.1
    "http://2130706433/", // decimal form of 127.0.0.1
    "http://[::ffff:127.0.0.1]/",
  ])("refuses %s", async (u) => {
    await expect(safeFetch(u)).rejects.toMatchObject({ code: "URL_NOT_ALLOWED" });
  });
});

// A local server, with a test-only policy that trusts loopback but nothing else,
// proves the redirect, size and timeout logic.
describe("safeFetch mechanics", () => {
  let server: http.Server;
  let base: string;
  const loopbackOnly = (ip: string) => ip === "127.0.0.1";

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (req.url === "/ok") return res.end("<html><title>ok</title></html>");
      if (req.url === "/to-metadata") {
        res.writeHead(302, { Location: "http://169.254.169.254/latest/" });
        return res.end();
      }
      if (req.url === "/loop") {
        res.writeHead(302, { Location: "/loop" });
        return res.end();
      }
      // Streamlit-style login bounce: loops unless the session cookie is replayed.
      if (req.url === "/app") {
        if (req.headers.cookie?.includes("session=ok")) return res.end("<html><title>app</title></html>");
        res.writeHead(303, { Location: "/login" });
        return res.end();
      }
      if (req.url === "/login") {
        res.writeHead(303, { Location: "/app", "Set-Cookie": "session=ok; Path=/; HttpOnly" });
        return res.end();
      }
      if (req.url === "/big") return res.end("x".repeat(5000));
      if (req.url === "/slow") return setTimeout(() => res.end("late"), 2000);
      res.statusCode = 404;
      res.end();
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it("fetches an allowed page", async () => {
    const res = await safeFetch(`${base}/ok`, { policy: loopbackOnly });
    expect(res.status).toBe(200);
    expect(res.body.toString()).toContain("<title>ok</title>");
  });

  it("re-validates redirect targets", async () => {
    await expect(safeFetch(`${base}/to-metadata`, { policy: loopbackOnly })).rejects.toMatchObject({
      code: "URL_NOT_ALLOWED",
    });
  });

  it("replays cookies across redirects (login-bounce hosts)", async () => {
    const res = await safeFetch(`${base}/app`, { policy: loopbackOnly });
    expect(res.status).toBe(200);
    expect(res.body.toString()).toContain("<title>app</title>");
  });

  it("caps redirects", async () => {
    await expect(safeFetch(`${base}/loop`, { policy: loopbackOnly, maxRedirects: 3 })).rejects.toThrow(
      /too many times/
    );
  });

  it("caps response size", async () => {
    await expect(safeFetch(`${base}/big`, { policy: loopbackOnly, maxBytes: 1000 })).rejects.toThrow(/larger than/);
  });

  it("times out", async () => {
    await expect(safeFetch(`${base}/slow`, { policy: loopbackOnly, timeoutMs: 300 })).rejects.toThrow(/too long/);
  });
});
