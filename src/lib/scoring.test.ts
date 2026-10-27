import { describe, expect, it } from "vitest";
import { computeScores, decayScore, penalty } from "./scoring";
import { SCORE_CATEGORIES } from "./types";

const all = [...SCORE_CATEGORIES];

describe("computeScores", () => {
  it("no issues and everything assessed → 100", () => {
    expect(computeScores([], all)).toEqual({
      overallScore: 100,
      categoryScores: { hierarchy: 100, contrast: 100, spacing: 100, ctaClarity: 100, semantics: 100 },
    });
  });

  it("nothing assessed → null, not a free 100", () => {
    const r = computeScores([], []);
    expect(r.overallScore).toBeNull();
    expect(Object.values(r.categoryScores).every((v) => v === null)).toBe(true);
  });

  it("applies the documented weights", () => {
    expect(penalty({ severity: "Critical", evidence: "measured" })).toBe(20);
    expect(penalty({ severity: "Warning", evidence: "measured" })).toBe(8);
    expect(penalty({ severity: "Critical", evidence: "ai-estimated" })).toBe(15);

    const r = computeScores(
      [
        { severity: "Critical", evidence: "measured", category: "Accessibility" }, // semantics P=20
        { severity: "Warning", evidence: "measured", category: "Hierarchy" }, // hierarchy P=8
      ],
      ["semantics", "hierarchy"]
    );
    expect(r.categoryScores).toEqual({ hierarchy: 92, contrast: null, spacing: null, ctaClarity: null, semantics: 82 });
    expect(r.overallScore).toBe(decayScore(28)); // 76 — all issues together
  });

  it("decay curve reference points", () => {
    expect(decayScore(0)).toBe(100);
    expect(decayScore(20)).toBe(82);
    expect(decayScore(100)).toBe(37);
  });

  it("untouched categories cannot hide serious problems", () => {
    // Regression: two Critical AI contrast issues used to average out to 94.
    const r = computeScores(
      [
        { severity: "Critical", evidence: "ai-estimated", category: "Contrast" },
        { severity: "Critical", evidence: "ai-estimated", category: "CTA" },
        { severity: "Warning", evidence: "ai-estimated", category: "Accessibility" },
        { severity: "Warning", evidence: "ai-estimated", category: "Contrast" },
      ],
      all
    );
    expect(r.overallScore).toBe(66);
  });

  it("an issue marks its category as assessed", () => {
    const r = computeScores([{ severity: "Nitpick", evidence: "measured", category: "Spacing" }], []);
    expect(r.categoryScores.spacing).toBe(97);
  });

  it("never goes negative", () => {
    const many = Array.from({ length: 30 }, () => ({ severity: "Critical" as const, evidence: "measured" as const, category: "CTA" as const }));
    expect(computeScores(many, all).categoryScores.ctaClarity).toBe(0);
    expect(computeScores(many, all).overallScore).toBeGreaterThanOrEqual(0);
  });

  it("is deterministic and order-independent", () => {
    const issues = [
      { severity: "Critical" as const, evidence: "ai-estimated" as const, category: "Contrast" as const },
      { severity: "Nitpick" as const, evidence: "measured" as const, category: "Typography" as const },
    ];
    expect(computeScores(issues, all)).toEqual(computeScores([...issues].reverse(), all));
  });
});
