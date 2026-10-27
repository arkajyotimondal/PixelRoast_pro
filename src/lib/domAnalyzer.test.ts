import { describe, expect, it } from "vitest";
import { analyzeHtml } from "./domAnalyzer";
import { SAMPLE_HTML } from "./samples";

const ruleIds = (html: string) => analyzeHtml(html).issues.map((i) => i.ruleId).sort();

const CLEAN = `<!doctype html><html lang="en"><head><title>Clean page</title>
<meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body><header><nav><a href="/">Home</a></nav></header>
<main><h1>Title</h1><h2>Section</h2><img src="a.png" alt="A chart"><img src="d.png" alt="">
<label for="e">Email</label><input id="e" type="email">
<label>Name <input type="text"></label>
<button aria-label="Close"><svg></svg></button><input type="hidden" name="csrf"></main>
<footer>© 2026</footer></body></html>`;

describe("analyzeHtml", () => {
  it("reports nothing for an accessible page", () => {
    expect(ruleIds(CLEAN)).toEqual([]);
    const t = analyzeHtml(CLEAN).telemetry;
    expect(t).toMatchObject({ totalImages: 2, missingAltCount: 0, formInputsWithoutLabels: 0, headingSkipped: false, lang: "en" });
  });

  it("finds every deliberate flaw in the sample page", () => {
    expect(ruleIds(SAMPLE_HTML)).toEqual(
      ["control-name", "form-label", "heading-order", "html-lang", "img-alt", "landmark-main", "meta-viewport", "tabindex-positive"].sort()
    );
  });

  it("all deterministic issues are labelled measured and carry a selector or fix", () => {
    for (const i of analyzeHtml(SAMPLE_HTML).issues) {
      expect(i.evidence).toBe("measured");
      expect(i.coordinates).toBeNull();
      expect(i.selector || i.fixCode).toBeTruthy();
    }
  });

  it("counts offenders and builds a fix from the real element", () => {
    const html = `<html lang="en"><body><main><img src="1.png"><img src="2.png"><img src="3.png" alt="ok"></main></body></html>`;
    const alt = analyzeHtml(html).issues.find((i) => i.ruleId === "img-alt")!;
    expect(alt.count).toBe(2);
    expect(alt.selector).toBe("body > main > img:nth-of-type(1)");
    expect(alt.fixCode).toContain('src="1.png"');
    expect(alt.fixCode).toContain('alt="Describe what this image shows"');
  });

  it("treats alt=\"\" as valid (decorative)", () => {
    expect(analyzeHtml(`<img src="x.png" alt="">`).telemetry.missingAltCount).toBe(0);
  });

  it("detects disabled zoom", () => {
    const html = `<html lang="en"><head><title>t</title><meta name="viewport" content="width=device-width, user-scalable=no"></head><body><main></main></body></html>`;
    expect(ruleIds(html)).toContain("meta-viewport-zoom");
  });

  it("detects missing h1 and multiple h1", () => {
    expect(ruleIds(`<h2>a</h2><h3>b</h3>`)).toContain("page-has-h1");
    expect(ruleIds(`<h1>a</h1><h1>b</h1>`)).toContain("single-h1");
  });

  it("flags JavaScript app shells (SPA / Streamlit) but not real pages", () => {
    const shell = `<html lang="en"><head><title>App</title></head><body><noscript>You need to enable JavaScript to run this app.</noscript><div id="root"></div><script src="/main.js"></script></body></html>`;
    expect(analyzeHtml(shell).telemetry.likelyJsRendered).toBe(true);
    expect(analyzeHtml(CLEAN).telemetry.likelyJsRendered).toBe(false); // no scripts
    const content = `<body><main>${"Real readable content. ".repeat(20)}</main><script src="a.js"></script></body>`;
    expect(analyzeHtml(content).telemetry.likelyJsRendered).toBe(false);
  });

  it("does not crash on garbage input", () => {
    expect(() => analyzeHtml("<<<not html>>> \u0000")).not.toThrow();
  });
});
