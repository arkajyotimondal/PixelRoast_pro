import { describe, expect, it } from "vitest";
import { boxCenterPercent, parseAiReview, responseSchemaFor } from "./schema";

const validIssue = {
  title: "Low-contrast hero subtitle",
  severity: "Critical",
  category: "Contrast",
  heuristic: "WCAG 1.4.3",
  location: "Hero",
  box_2d: [200, 50, 260, 450],
  problem: "The grey subtitle appears to be about 1.6:1 against white.",
  recommendation: "Darken the text.",
  fixCode: '<p class="text-zinc-700">…</p>',
};
const valid = {
  summaries: { roast: "A pale ghost of a page.", accessibility: "Fails WCAG 1.4.3 contrast.", conversion: "The CTA is invisible." },
  positives: ["Clear headline"],
  issues: [validIssue],
};

describe("parseAiReview", () => {
  it("accepts a valid response", () => {
    expect(parseAiReview(JSON.stringify(valid)).issues[0].severity).toBe("Critical");
  });

  it.each([
    ["not JSON", "Sure! Here is the JSON: {"],
    ["markdown fenced", "```json\n" + JSON.stringify(valid) + "\n```"],
    ["missing summaries", JSON.stringify({ ...valid, summaries: undefined })],
    ["bad severity", JSON.stringify({ ...valid, issues: [{ ...validIssue, severity: "Severe" }] })],
    ["bad category", JSON.stringify({ ...valid, issues: [{ ...validIssue, category: "Vibes" }] })],
    ["box out of range", JSON.stringify({ ...valid, issues: [{ ...validIssue, box_2d: [0, 0, 1200, 50] }] })],
    ["inverted box", JSON.stringify({ ...valid, issues: [{ ...validIssue, box_2d: [500, 0, 100, 50] }] })],
    ["empty issues", JSON.stringify({ ...valid, issues: [] })],
    ["score smuggled as string issue", JSON.stringify({ ...valid, issues: "none" })],
  ])("rejects %s", (_name, text) => {
    expect(() => parseAiReview(text)).toThrow();
  });

  it("box is optional (HTML mode)", () => {
    const { box_2d: _box, ...noBox } = validIssue;
    void _box;
    expect(parseAiReview(JSON.stringify({ ...valid, issues: [noBox] })).issues[0].box_2d).toBeUndefined();
  });
});

describe("boxCenterPercent", () => {
  it("converts Gemini [ymin,xmin,ymax,xmax] 0–1000 to x/y percent", () => {
    expect(boxCenterPercent([200, 50, 260, 450])).toEqual({ x: 25, y: 23 });
    expect(boxCenterPercent([0, 0, 1000, 1000])).toEqual({ x: 50, y: 50 });
    expect(boxCenterPercent(undefined)).toBeNull();
  });
});

describe("responseSchemaFor", () => {
  const required = (k: "image" | "html") =>
    (responseSchemaFor(k) as unknown as { properties: { issues: { items: { required: string[] } } } }).properties.issues.items.required;
  it("requires a box when there is a screenshot, not for HTML", () => {
    expect(required("image")).toContain("box_2d");
    // Called after the image variant: proves it didn't mutate the shared schema.
    expect(required("html")).not.toContain("box_2d");
  });
});
