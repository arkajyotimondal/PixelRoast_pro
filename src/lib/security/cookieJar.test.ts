import { describe, expect, it } from "vitest";
import { CookieJar } from "./cookieJar";

const u = (s: string) => new URL(s);

describe("CookieJar", () => {
  it("replays host-only cookies to the same host only", () => {
    const jar = new CookieJar();
    jar.store(u("https://app.example.com/login"), ["sid=abc; Path=/; HttpOnly"]);
    expect(jar.header(u("https://app.example.com/"))).toBe("sid=abc");
    expect(jar.header(u("https://other.example.com/"))).toBeUndefined();
  });

  it("honours Domain= for subdomains", () => {
    const jar = new CookieJar();
    jar.store(u("https://a.example.com/"), "t=1; Domain=.example.com");
    expect(jar.header(u("https://b.example.com/"))).toBe("t=1");
    expect(jar.header(u("https://example.com/"))).toBe("t=1");
  });

  it("rejects cookies for a foreign domain", () => {
    const jar = new CookieJar();
    jar.store(u("https://evil.test/"), "x=1; Domain=example.com");
    expect(jar.header(u("https://example.com/"))).toBeUndefined();
  });

  it("deletes on Max-Age=0 or empty value, and keeps Secure off http", () => {
    const jar = new CookieJar();
    jar.store(u("https://h.test/"), ["a=1", "b=2; Secure"]);
    expect(jar.header(u("https://h.test/"))).toBe("a=1; b=2");
    expect(jar.header(u("http://h.test/"))).toBe("a=1");
    jar.store(u("https://h.test/"), ["a=; Max-Age=0", "b="]);
    expect(jar.header(u("https://h.test/"))).toBeUndefined();
  });
});
