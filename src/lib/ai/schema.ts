/**
 * The contract for the vision model's output, defined twice on purpose:
 *
 *  - RESPONSE_SCHEMA is sent to Gemini (JSON-schema response mode) so it *generates*
 *    the right shape.
 *  - AiReviewSchema (Zod) *validates* what actually came back. The model can still
 *    return out-of-range numbers or over-long strings; anything invalid is rejected
 *    (and retried) rather than silently patched with made-up defaults.
 *
 * The model returns no scores — those are computed in scoring.ts.
 */
import { SchemaType, type ResponseSchema } from "@google/generative-ai";
import { z } from "zod";

export const PROMPT_VERSION = "v3"; // bump to invalidate cached reviews when the contract changes

const CATEGORIES = ["Contrast", "Hierarchy", "Spacing", "Typography", "CTA", "Accessibility"] as const;
const SEVERITIES = ["Critical", "Warning", "Nitpick"] as const;

/** Gemini's native box format: [ymin, xmin, ymax, xmax], each normalised to 0–1000. */
const BoxSchema = z
  .array(z.number().min(0).max(1000))
  .length(4)
  .refine(([ymin, xmin, ymax, xmax]) => ymin <= ymax && xmin <= xmax, "box min must be <= max");

export const AiIssueSchema = z.object({
  title: z.string().trim().min(3).max(140),
  severity: z.enum(SEVERITIES),
  category: z.enum(CATEGORIES),
  heuristic: z.string().trim().min(2).max(140),
  location: z.string().trim().min(2).max(140),
  box_2d: BoxSchema.optional(),
  problem: z.string().trim().min(10).max(800),
  recommendation: z.string().trim().min(5).max(400),
  fixCode: z.string().trim().max(2000),
});

export const AiReviewSchema = z.object({
  summaries: z.object({
    roast: z.string().trim().min(10).max(600),
    accessibility: z.string().trim().min(10).max(600),
    conversion: z.string().trim().min(10).max(600),
  }),
  positives: z.array(z.string().trim().min(3).max(200)).max(5),
  issues: z.array(AiIssueSchema).min(1).max(8),
});

export type AiIssue = z.infer<typeof AiIssueSchema>;
export type AiReview = z.infer<typeof AiReviewSchema>;

/** Parse raw model text. Throws a ZodError / SyntaxError on anything malformed. */
export function parseAiReview(text: string): AiReview {
  return AiReviewSchema.parse(JSON.parse(text));
}

/** Centre of a [ymin, xmin, ymax, xmax] 0–1000 box, as 0–100 percentages. */
export function boxCenterPercent(box: number[] | undefined): { x: number; y: number } | null {
  if (!box) return null;
  const [ymin, xmin, ymax, xmax] = box;
  return { x: Math.round((xmin + xmax) / 20), y: Math.round((ymin + ymax) / 20) };
}

const str = (description: string, maxLength?: number) =>
  ({ type: SchemaType.STRING, description, ...(maxLength ? { maxLength } : {}) }) as const;

const RESPONSE_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    summaries: {
      type: SchemaType.OBJECT,
      description: "The same verdict written in three voices. Facts must be identical across all three.",
      properties: {
        roast: str("2 sentences, witty and blunt design-director voice"),
        accessibility: str("2 sentences, precise WCAG auditor voice"),
        conversion: str("2 sentences, conversion-rate strategist voice"),
      },
      required: ["roast", "accessibility", "conversion"],
    },
    positives: { type: SchemaType.ARRAY, items: str("A specific strength"), maxItems: 4 },
    issues: {
      type: SchemaType.ARRAY,
      minItems: 1,
      maxItems: 6,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          title: str("Concise, specific issue title"),
          severity: { type: SchemaType.STRING, format: "enum", enum: [...SEVERITIES] },
          category: { type: SchemaType.STRING, format: "enum", enum: [...CATEGORIES] },
          heuristic: str("Heuristic or WCAG criterion, e.g. 'WCAG 1.4.3 Contrast (Minimum)'"),
          location: str("Human-readable region, e.g. 'Hero call-to-action'"),
          box_2d: {
            type: SchemaType.ARRAY,
            description: "Bounding box of the problem area: [ymin, xmin, ymax, xmax] normalised 0-1000. Omit if not applicable.",
            items: { type: SchemaType.INTEGER },
          },
          problem: str("2-3 sentences: the flaw and its impact"),
          recommendation: str("1 sentence fix"),
          fixCode: str("Self-contained HTML + Tailwind snippet implementing the fix"),
        },
        required: ["title", "severity", "category", "heuristic", "location", "problem", "recommendation", "fixCode"],
      },
    },
  },
  required: ["summaries", "positives", "issues"],
};

/**
 * With a screenshot, box_2d is *required* so every AI issue gets a pin (lighter models
 * skip optional fields). For HTML-only reviews there is nothing to point at, so it stays
 * optional. The Zod side keeps it optional either way; a missing box just means no pin.
 */
export function responseSchemaFor(kind: "image" | "html"): ResponseSchema {
  if (kind === "html") return RESPONSE_SCHEMA;
  const schema = structuredClone(RESPONSE_SCHEMA) as ResponseSchema & {
    properties: { issues: { items: { required: string[] } } };
  };
  schema.properties.issues.items.required.push("box_2d");
  return schema;
}
