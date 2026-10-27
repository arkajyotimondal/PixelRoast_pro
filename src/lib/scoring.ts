/**
 * Deterministic, documented scoring. The LLM never produces a score.
 *
 *   penalty(issue) = SEVERITY_WEIGHT[severity] × EVIDENCE_FACTOR[evidence]
 *   P              = Σ penalty over the relevant issues
 *   score(P)       = round(100 × e^(−P/100))
 *
 *   overall  = score(P over all issues)
 *   category = score(P over that category's issues)
 *
 * Why exponential decay rather than "100 − P" or an average of categories:
 * - averaging five categories let untouched categories (each a free 100) hide serious
 *   problems — a page with two Critical contrast failures still scored 94;
 * - "100 − P" hits 0 after a handful of issues and then can't distinguish bad from worse.
 * With e^(−P/100), each penalty point removes ~1% of the *remaining* score: one Critical
 * measured issue → 82, five → 37. Monotonic, never negative, easy to reason about.
 * Because e^(−(a+b)) = e^(−a)·e^(−b), overall/100 = Π(category/100) over assessed
 * categories (up to rounding) — the overall is the product of the parts.
 *
 * - Measured issues count fully; AI-estimated ones count at 0.75 because they are
 *   judgements, not measurements.
 * - A category is "assessed" only if some check actually covered it. A category that
 *   nothing looked at is null ("not assessed"), not a free 100.
 * - Same issues in → same score out. Persona is not an input.
 */
import type { AuditIssue, CategoryScores, Evidence, IssueCategory, ScoreCategory, Severity } from "@/lib/types";
import { SCORE_CATEGORIES } from "@/lib/types";

export const SEVERITY_WEIGHT: Record<Severity, number> = { Critical: 20, Warning: 8, Nitpick: 3 };
export const EVIDENCE_FACTOR: Record<Evidence, number> = { measured: 1, "ai-estimated": 0.75 };

/** Which score bucket each display category feeds. */
export const CATEGORY_TO_SCORE: Record<IssueCategory, ScoreCategory> = {
  Contrast: "contrast",
  Hierarchy: "hierarchy",
  Typography: "hierarchy",
  Spacing: "spacing",
  CTA: "ctaClarity",
  Accessibility: "semantics",
};

/** Categories covered by the deterministic DOM rules (see domAnalyzer.ts). */
export const DOM_ASSESSED: readonly ScoreCategory[] = ["semantics", "hierarchy"];

export function penalty(issue: Pick<AuditIssue, "severity" | "evidence">): number {
  return SEVERITY_WEIGHT[issue.severity] * EVIDENCE_FACTOR[issue.evidence];
}

/** score(P) = round(100 × e^(−P/100)). */
export function decayScore(totalPenalty: number): number {
  return Math.round(100 * Math.exp(-totalPenalty / 100));
}

export interface ScoreResult {
  overallScore: number | null;
  categoryScores: CategoryScores;
}

export function computeScores(
  issues: Pick<AuditIssue, "severity" | "evidence" | "category">[],
  assessed: Iterable<ScoreCategory>
): ScoreResult {
  const assessedSet = new Set(assessed);
  const lost: Record<ScoreCategory, number> = { hierarchy: 0, contrast: 0, spacing: 0, ctaClarity: 0, semantics: 0 };
  for (const i of issues) {
    const bucket = CATEGORY_TO_SCORE[i.category];
    lost[bucket] += penalty(i);
    assessedSet.add(bucket); // an issue in a category means it was looked at
  }

  const categoryScores = {} as CategoryScores;
  for (const c of SCORE_CATEGORIES) {
    categoryScores[c] = assessedSet.has(c) ? decayScore(lost[c]) : null;
  }

  const total = SCORE_CATEGORIES.reduce((sum, c) => sum + lost[c], 0);
  const overallScore = assessedSet.size > 0 ? decayScore(total) : null;
  return { overallScore, categoryScores };
}
