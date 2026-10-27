/**
 * Deterministic DOM rule engine (Cheerio).
 *
 * Input: raw HTML (pasted, or fetched through the SSRF guard). Output: telemetry plus
 * "measured" issues, each with a rule id, the selector of the first offender, how many
 * elements are affected, and a generated fix built from the offending element itself.
 *
 * Scope and honesty: Cheerio parses markup only — no CSS cascade, no layout, no
 * JavaScript. So these rules cover what markup alone can prove (alt text, labels,
 * accessible names, headings, landmarks, lang, title, viewport, tabindex). Visual
 * properties like contrast or spacing are left to the vision model and labelled as
 * estimates. Pages rendered entirely by JavaScript will look nearly empty here.
 */
import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import type { AuditIssue, DomTelemetry, IssueCategory, Severity } from "@/lib/types";

export type MeasuredIssue = Omit<AuditIssue, "id">;

export interface HtmlAnalysis {
  telemetry: DomTelemetry;
  issues: MeasuredIssue[];
}

type $ = cheerio.CheerioAPI;

// ─── Helpers ─────────────────────────────────────────────────────

/** Short, readable CSS path: stops at the nearest ancestor with an id, max 4 levels. */
export function cssPath($: $, el: Element): string {
  const parts: string[] = [];
  let node: Element | null = el;
  while (node && node.type === "tag" && parts.length < 4) {
    const tag = node.tagName.toLowerCase();
    const id = $(node).attr("id");
    if (id && /^[A-Za-z][\w-]*$/.test(id)) {
      parts.unshift(`${tag}#${id}`);
      break;
    }
    const parent: Element | null = node.parent && node.parent.type === "tag" ? (node.parent as Element) : null;
    if (parent) {
      const sameTag = $(parent).children(tag);
      parts.unshift(sameTag.length > 1 ? `${tag}:nth-of-type(${sameTag.index(node) + 1})` : tag);
    } else {
      parts.unshift(tag);
    }
    if (tag === "body") break;
    node = parent;
  }
  return parts.join(" > ");
}

function outer($: $, el: Element, max = 300): string {
  const html = $.html(el) ?? "";
  return html.length > max ? html.slice(0, max) + "…" : html;
}

/** Accessible-name approximation: text, aria-label, aria-labelledby, title, or img alt inside. */
function hasAccessibleName($: $, el: Element): boolean {
  const $el = $(el);
  if ($el.text().trim()) return true;
  if ($el.attr("aria-label")?.trim() || $el.attr("aria-labelledby")?.trim() || $el.attr("title")?.trim()) return true;
  return $el.find("img[alt]").toArray().some((img) => ($(img).attr("alt") ?? "").trim().length > 0);
}

function issue(
  ruleId: string,
  severity: Severity,
  category: IssueCategory,
  heuristic: string,
  title: string,
  problem: string,
  recommendation: string,
  extra: Partial<MeasuredIssue> = {}
): MeasuredIssue {
  return {
    ruleId,
    evidence: "measured",
    severity,
    category,
    heuristic,
    title,
    location: extra.selector ?? "Document",
    coordinates: null,
    problem,
    recommendation,
    fixCode: "",
    ...extra,
  };
}

// ─── Rules ───────────────────────────────────────────────────────

export function analyzeHtml(html: string): HtmlAnalysis {
  const $ = cheerio.load(html);
  const issues: MeasuredIssue[] = [];

  // Images without alt. alt="" is valid (decorative); a missing attribute is not.
  const images = $("img").toArray();
  const noAlt = images.filter((el) => $(el).attr("alt") === undefined && $(el).attr("role") !== "presentation");
  if (noAlt.length > 0) {
    const first = noAlt[0];
    const fixed = $(first).clone().attr("alt", "Describe what this image shows");
    issues.push(
      issue(
        "img-alt",
        "Critical",
        "Accessibility",
        "WCAG 1.1.1 Non-text Content",
        `${noAlt.length} image${noAlt.length > 1 ? "s" : ""} missing alt text`,
        "Screen-reader users hear the file name or nothing at all for these images. Every <img> needs an alt attribute — descriptive text, or alt=\"\" if purely decorative.",
        "Add a concise alt description to informative images and alt=\"\" to decorative ones.",
        { selector: cssPath($, first), count: noAlt.length, fixCode: `<!-- before -->\n${outer($, first)}\n<!-- after -->\n${$.html(fixed)}` }
      )
    );
  }

  // Form controls without a programmatic label.
  const controls = $("input, select, textarea")
    .toArray()
    .filter((el) => !["hidden", "submit", "button", "reset", "image"].includes(($(el).attr("type") ?? "").toLowerCase()));
  const unlabeled = controls.filter((el) => {
    const $el = $(el);
    const id = $el.attr("id");
    const byFor = id ? $(`label[for="${id.replace(/"/g, '\\"')}"]`).length > 0 : false;
    const wrapped = $el.closest("label").length > 0;
    const aria = !!($el.attr("aria-label")?.trim() || $el.attr("aria-labelledby")?.trim() || $el.attr("title")?.trim());
    return !byFor && !wrapped && !aria;
  });
  if (unlabeled.length > 0) {
    const first = unlabeled[0];
    const id = $(first).attr("id") || "field-1";
    const fixedInput = $(first).clone().attr("id", id);
    const hint = $(first).attr("placeholder") || "Field label";
    issues.push(
      issue(
        "form-label",
        "Critical",
        "Accessibility",
        "WCAG 1.3.1 Info and Relationships / 4.1.2 Name, Role, Value",
        `${unlabeled.length} form field${unlabeled.length > 1 ? "s" : ""} without a label`,
        "Placeholder text is not a label: it disappears on input and many screen readers skip it. These fields have no <label>, aria-label or aria-labelledby.",
        "Associate a visible <label for> with each field.",
        {
          selector: cssPath($, first),
          count: unlabeled.length,
          fixCode: `<label for="${id}" class="block text-sm font-medium">${hint}</label>\n${$.html(fixedInput)}`,
        }
      )
    );
  }

  // Buttons and links with no accessible name (e.g. icon-only).
  const nameless = $("button, a[href], [role=button]")
    .toArray()
    .filter((el) => !hasAccessibleName($, el));
  if (nameless.length > 0) {
    const first = nameless[0];
    const fixed = $(first).clone().attr("aria-label", "Describe the action");
    issues.push(
      issue(
        "control-name",
        "Critical",
        "Accessibility",
        "WCAG 4.1.2 Name, Role, Value / 2.4.4 Link Purpose",
        `${nameless.length} button${nameless.length > 1 ? "s or links" : " or link"} with no accessible name`,
        "These controls have no text, aria-label or labelled image, so assistive technology announces them only as \"button\" or \"link\".",
        "Give every interactive element visible text or an aria-label describing its action.",
        { selector: cssPath($, first), count: nameless.length, fixCode: $.html(fixed) }
      )
    );
  }

  // Headings: structure, missing h1, skipped levels.
  const headingEls = $("h1, h2, h3, h4, h5, h6").toArray();
  const headingStructure = headingEls.map((el) => `${el.tagName.toLowerCase()}: ${$(el).text().trim().slice(0, 60) || "(empty)"}`);
  let headingSkipped = false;
  let skipAt: Element | null = null;
  let last = 0;
  for (const el of headingEls) {
    const level = Number(el.tagName[1]);
    if (last > 0 && level > last + 1 && !headingSkipped) {
      headingSkipped = true;
      skipAt = el;
    }
    last = level;
  }
  const h1Count = $("h1").length;
  if (headingEls.length > 0 && h1Count === 0) {
    const first = headingEls[0];
    issues.push(
      issue(
        "page-has-h1",
        "Warning",
        "Hierarchy",
        "WCAG 1.3.1 / 2.4.6 Headings and Labels",
        "No <h1> on the page",
        `The page's top heading is an <${first.tagName.toLowerCase()}>. Screen-reader users navigate by headings and expect one <h1> naming the page.`,
        "Promote the main page title to a single <h1>.",
        { selector: cssPath($, first), fixCode: `<h1>${$(first).text().trim() || "Page title"}</h1>` }
      )
    );
  }
  if (skipAt) {
    issues.push(
      issue(
        "heading-order",
        "Warning",
        "Hierarchy",
        "WCAG 1.3.1 Info and Relationships",
        "Heading levels are skipped",
        `Heading order jumps to <${skipAt.tagName.toLowerCase()}> without the level in between: ${headingStructure.join(" → ")}.`,
        "Use headings in sequence (h1 → h2 → h3) and style them with CSS rather than picking levels for size.",
        { selector: cssPath($, skipAt) }
      )
    );
  }
  if (h1Count > 1) {
    issues.push(
      issue(
        "single-h1",
        "Nitpick",
        "Hierarchy",
        "Heading best practice",
        `${h1Count} <h1> elements`,
        "Multiple <h1>s blur which heading names the page.",
        "Keep one <h1> and demote the others to <h2>.",
        { selector: cssPath($, $("h1").toArray()[1]), count: h1Count }
      )
    );
  }

  // Landmarks.
  const landmarkCount = $("header, nav, main, footer, aside, [role=main], [role=navigation], [role=banner], [role=contentinfo]").length;
  if ($("main, [role=main]").length === 0) {
    issues.push(
      issue(
        "landmark-main",
        "Warning",
        "Accessibility",
        "WCAG 1.3.1 / 2.4.1 Bypass Blocks",
        "No <main> landmark",
        "Without a <main> region, keyboard and screen-reader users can't jump past the navigation straight to the content.",
        "Wrap the primary content in a single <main> element.",
        { fixCode: "<main id=\"content\">\n  <!-- primary page content -->\n</main>" }
      )
    );
  }

  // Document-level metadata.
  const lang = $("html").attr("lang")?.trim() ?? "";
  if (!lang) {
    issues.push(
      issue(
        "html-lang",
        "Warning",
        "Accessibility",
        "WCAG 3.1.1 Language of Page",
        "Page language is not declared",
        "Without <html lang>, screen readers guess the pronunciation rules and may read the page in the wrong voice.",
        "Declare the page language on the root element.",
        { selector: "html", fixCode: '<html lang="en">' }
      )
    );
  }
  const metaTitle = $("title").first().text().trim();
  if (!metaTitle) {
    issues.push(
      issue(
        "document-title",
        "Warning",
        "Accessibility",
        "WCAG 2.4.2 Page Titled",
        "Missing or empty <title>",
        "The title is the first thing announced and what appears in tabs, bookmarks and search results.",
        "Add a descriptive, unique <title>.",
        { selector: "head > title", fixCode: "<title>Product name — what this page does</title>" }
      )
    );
  }
  const viewport = $('meta[name="viewport"]').attr("content") ?? "";
  if (!viewport) {
    issues.push(
      issue(
        "meta-viewport",
        "Warning",
        "Spacing",
        "Mobile responsiveness",
        "No responsive viewport meta tag",
        "Mobile browsers will render the page at desktop width and shrink it, making text and tap targets tiny.",
        "Add the standard responsive viewport tag.",
        { selector: "head", fixCode: '<meta name="viewport" content="width=device-width, initial-scale=1">' }
      )
    );
  } else if (/user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*1(\.0)?\b/i.test(viewport)) {
    issues.push(
      issue(
        "meta-viewport-zoom",
        "Critical",
        "Accessibility",
        "WCAG 1.4.4 Resize Text",
        "Pinch-zoom is disabled",
        `The viewport tag (\"${viewport}\") prevents users with low vision from zooming.`,
        "Remove user-scalable=no and maximum-scale=1.",
        { selector: 'meta[name="viewport"]', fixCode: '<meta name="viewport" content="width=device-width, initial-scale=1">' }
      )
    );
  }

  // Positive tabindex breaks the natural focus order.
  const positiveTab = $("[tabindex]")
    .toArray()
    .filter((el) => Number($(el).attr("tabindex")) > 0);
  if (positiveTab.length > 0) {
    const first = positiveTab[0];
    issues.push(
      issue(
        "tabindex-positive",
        "Warning",
        "Accessibility",
        "WCAG 2.4.3 Focus Order",
        `${positiveTab.length} element${positiveTab.length > 1 ? "s" : ""} with positive tabindex`,
        "tabindex > 0 forces these elements to the front of the keyboard order, so focus jumps unpredictably.",
        "Use tabindex=\"0\" (or none) and fix the order in the DOM instead.",
        { selector: cssPath($, first), count: positiveTab.length, fixCode: $.html($(first).clone().attr("tabindex", "0")) }
      )
    );
  }

  const metaDescription = $('meta[name="description"]').attr("content")?.trim() ?? "";

  // SPA detection: frameworks (React, Streamlit, …) ship an empty shell and render in the
  // browser. Text is measured with scripts/styles/noscript removed, on a copy.
  const $body = $("body").clone();
  $body.find("script, style, noscript, template").remove();
  const visibleText = $body.text().replace(/\s+/g, " ").trim();
  const likelyJsRendered = visibleText.length < 200 && $("script").length > 0;

  return {
    telemetry: {
      totalImages: images.length,
      missingAltCount: noAlt.length,
      headingStructure,
      headingSkipped,
      landmarkCount,
      formInputsWithoutLabels: unlabeled.length,
      metaTitle,
      metaDescription,
      lang,
      likelyJsRendered,
    },
    issues,
  };
}

/** Plain-language facts for the vision model, so it doesn't contradict or repeat them. */
export function telemetryFacts(a: HtmlAnalysis): string {
  const t = a.telemetry;
  const lines = [
    `Images: ${t.totalImages} (${t.missingAltCount} without alt)`,
    `Headings: ${t.headingStructure.slice(0, 12).join(" → ") || "none"}`,
    `Landmarks: ${t.landmarkCount}; form fields without labels: ${t.formInputsWithoutLabels}`,
    `Already reported by deterministic checks: ${a.issues.map((i) => i.ruleId).join(", ") || "none"}`,
  ];
  if (t.likelyJsRendered) {
    lines.push(
      "NOTE: the raw markup is a JavaScript app shell with almost no content. Do not critique the shell itself; judge the rendered UI from the screenshot if one is provided."
    );
  }
  return lines.join("\n");
}
