/**
 * Minimal cookie jar for a single safeFetch call (redirect chain).
 *
 * Why: some hosts (e.g. Streamlit Cloud) bounce through a login hop that sets a
 * session cookie and redirects back; without replaying it the chain loops forever.
 *
 * Scope is deliberately tiny: one jar per fetch, discarded afterwards, never shared
 * between users. Domain matching follows RFC 6265 basics (host-only, or Domain=
 * parent suffix); Path is ignored; Secure cookies are only sent over https;
 * Max-Age<=0 or a past Expires deletes the cookie.
 */
interface StoredCookie {
  value: string;
  domain: string;
  hostOnly: boolean;
  secure: boolean;
}

export class CookieJar {
  private cookies = new Map<string, StoredCookie>(); // key: `${domain}|${name}`

  /** Record Set-Cookie headers received from `url`. */
  store(url: URL, setCookie: string[] | string | undefined): void {
    if (!setCookie) return;
    const host = url.hostname.toLowerCase();
    for (const header of Array.isArray(setCookie) ? setCookie : [setCookie]) {
      const [pair, ...attrs] = header.split(";");
      const eq = pair.indexOf("=");
      if (eq <= 0) continue;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();

      let domain = host;
      let hostOnly = true;
      let secure = false;
      let expired = false;
      for (const attr of attrs) {
        const [k, ...rest] = attr.split("=");
        const key = k.trim().toLowerCase();
        const v = rest.join("=").trim();
        if (key === "domain" && v) {
          const d = v.replace(/^\./, "").toLowerCase();
          // A site may only set cookies for itself or a parent domain.
          if (host !== d && !host.endsWith("." + d)) {
            expired = true; // reject foreign-domain cookie
            break;
          }
          domain = d;
          hostOnly = false;
        } else if (key === "secure") secure = true;
        else if (key === "max-age" && Number(v) <= 0) expired = true;
        else if (key === "expires" && Date.parse(v) < Date.now()) expired = true;
      }

      const id = `${domain}|${name}`;
      if (expired || value === "") this.cookies.delete(id);
      else this.cookies.set(id, { value, domain, hostOnly, secure });
    }
  }

  /** Cookie header value to send to `url`, or undefined if none apply. */
  header(url: URL): string | undefined {
    const host = url.hostname.toLowerCase();
    const parts: string[] = [];
    for (const [id, c] of this.cookies) {
      const matches = c.hostOnly ? host === c.domain : host === c.domain || host.endsWith("." + c.domain);
      if (!matches || (c.secure && url.protocol !== "https:")) continue;
      parts.push(`${id.slice(id.indexOf("|") + 1)}=${c.value}`);
    }
    return parts.length ? parts.join("; ") : undefined;
  }
}
