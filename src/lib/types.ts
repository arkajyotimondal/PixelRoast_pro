// PixelRoast Pro — Shared Types (used by both API routes and the client)

export type AuditMode = "roast" | "accessibility" | "conversion";
export const AUDIT_MODES: readonly AuditMode[] = ["roast", "accessibility", "conversion"];

/** upload = screenshot only, url = fetched page (+ optional screenshot), html = pasted markup */
export type SourceType = "upload" | "url" | "html";
export type Severity = "Critical" | "Warning" | "Nitpick";
export type SeverityFilter = "All" | Severity;
export type InspectorTab = "issues" | "dom" | "export";

/**
 * measured     — produced by a deterministic rule over real markup; reproducible.
 * ai-estimated — produced by the vision model; a judgement, not a measurement.
 */
export type Evidence = "measured" | "ai-estimated";

/** Display category of an issue. */
export type IssueCategory = "Contrast" | "Hierarchy" | "Spacing" | "Typography" | "CTA" | "Accessibility";

export type ScoreCategory = "hierarchy" | "contrast" | "spacing" | "ctaClarity" | "semantics";
export const SCORE_CATEGORIES: readonly ScoreCategory[] = ["hierarchy", "contrast", "spacing", "ctaClarity", "semantics"];

/** Pin position as a percentage (0–100) of the stored screenshot's width/height. */
export interface AuditCoordinates {
  x: number;
  y: number;
}

export interface AuditIssue {
  id: number;
  /** Stable rule identifier, e.g. "img-alt" or "ai:cta-clarity" — used for re-audit diffs. */
  ruleId: string;
  evidence: Evidence;
  title: string;
  severity: Severity;
  category: IssueCategory;
  heuristic: string;
  location: string;
  /** CSS selector of the first offending element (measured issues only). */
  selector?: string;
  /** Number of elements affected (measured issues). */
  count?: number;
  /** Null when the issue can't be placed on the screenshot. */
  coordinates: AuditCoordinates | null;
  problem: string;
  recommendation: string;
  /** Copy-pasteable HTML fix. */
  fixCode: string;
}

/** null = this category was not assessed (e.g. spacing can't be measured from markup alone). */
export type CategoryScores = Record<ScoreCategory, number | null>;

export interface ContrastPair {
  fg: string;
  bg: string;
  ratio: number;
  passesAA: boolean;
  passesAAA: boolean;
}

export interface DomTelemetry {
  totalImages: number;
  missingAltCount: number;
  headingStructure: string[];
  headingSkipped: boolean;
  landmarkCount: number;
  formInputsWithoutLabels: number;
  metaTitle?: string;
  metaDescription?: string;
  lang?: string;
  /** Visible text in the raw markup is near-empty but scripts exist: a JS-rendered app shell. */
  likelyJsRendered?: boolean;
}

export interface ColorPaletteEntry {
  hex: string;
  role: string;
  luminance: number;
  /** Share of sampled pixels (0–1). */
  share?: number;
}

export interface AiStatus {
  available: boolean;
  model?: string;
  /** Why AI is unavailable, in plain words (never a raw upstream error). */
  reason?: string;
  cached?: boolean;
}

export interface AuditResult {
  _id?: string;
  title: string;
  sourceType: SourceType;
  targetUrl?: string;
  mode: AuditMode;
  overallScore: number | null;
  categoryScores: CategoryScores;
  /** Summary in the audit's persona at creation time. */
  summary: string;
  /** Persona only changes this text — never scores or issues. */
  summaries?: Partial<Record<AuditMode, string>>;
  positives: string[];
  domTelemetry?: DomTelemetry | null;
  colorPalette?: ColorPaletteEntry[];
  issues: AuditIssue[];
  ai: AiStatus;
  screenshot?: { url: string; width: number; height: number } | null;
  createdAt?: string;
}

export interface AuditAnalytics {
  totalAudits: number;
  avgScore: number;
  totalCritical: number;
}

export interface AuditsApiResponse {
  audits: AuditResult[];
  analytics: AuditAnalytics;
}

export interface ApiErrorPayload {
  error: { code: string; message: string };
}
