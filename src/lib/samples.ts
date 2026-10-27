/**
 * Curated sample page with known, deliberate flaws — each one maps to a deterministic
 * rule, so the demo has a predictable expected result:
 *   no lang, no viewport, no <main>, image without alt, unlabeled email field,
 *   icon-only button with no name, skipped heading level (h1 → h4), positive tabindex.
 */
export const SAMPLE_HTML = `<!doctype html>
<html>
<head>
  <title>Acme — Team Platform</title>
</head>
<body style="font-family: Arial; margin: 0">
  <div style="display:flex; justify-content:space-between; padding:16px; background:#f5f5f5">
    <b>Acme</b>
    <span style="color:#bbb; font-size:12px">Home · Products · Pricing · Docs · Blog</span>
    <a href="/signup" style="background:#ddd; color:#aaa; font-size:11px; padding:4px 8px" tabindex="3">Sign up</a>
  </div>
  <div style="padding:60px 40px">
    <h1 style="color:#999">The best platform for teams</h1>
    <p style="color:#ccc">Streamline everything with our innovative synergy-driven tools.</p>
    <h4>Why teams love it</h4>
    <img src="/hero.png" width="300" height="160">
    <button style="padding:4px 10px; font-size:11px">Start</button>
    <button><svg width="12" height="12"><circle cx="6" cy="6" r="5"/></svg></button>
  </div>
  <input type="email" placeholder="you@company.com" style="margin:0 40px">
</body>
</html>`;
