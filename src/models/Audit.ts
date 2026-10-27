/**
 * Audit Mongoose model.
 *
 * Every audit has an ownerId (the anonymous session) and is queried by it — see the
 * compound index. Screenshots are NOT embedded: `screenshot.ref` points at a document
 * in the separate Screenshot collection, keeping audit documents small and list
 * queries fast.
 */
import mongoose, { Schema, type Model } from "mongoose";
import type { AuditRecord } from "@/lib/store/types";

const PointSchema = new Schema({ x: Number, y: Number }, { _id: false });
const ScreenshotRefSchema = new Schema({ ref: String, width: Number, height: Number }, { _id: false });

const IssueSchema = new Schema(
  {
    id: Number,
    ruleId: String,
    evidence: { type: String, enum: ["measured", "ai-estimated"] },
    title: String,
    severity: { type: String, enum: ["Critical", "Warning", "Nitpick"] },
    category: String,
    heuristic: String,
    location: String,
    selector: String,
    count: Number,
    coordinates: { type: PointSchema, default: null },
    problem: String,
    recommendation: String,
    fixCode: String,
  },
  { _id: false }
);

const nullableScore = { type: Number, default: null };

// Untyped Schema: Mongoose's inference fights nullable fields; the Model below is typed.
const AuditSchema = new Schema(
  {
    ownerId: { type: String, required: true },
    title: { type: String, default: "Untitled Audit" },
    sourceType: { type: String, enum: ["upload", "url", "html"], required: true },
    targetUrl: String,
    mode: { type: String, enum: ["roast", "accessibility", "conversion"], default: "roast" },
    overallScore: nullableScore,
    categoryScores: {
      hierarchy: nullableScore,
      contrast: nullableScore,
      spacing: nullableScore,
      ctaClarity: nullableScore,
      semantics: nullableScore,
    },
    summary: { type: String, default: "" },
    summaries: { roast: String, accessibility: String, conversion: String },
    positives: [String],
    domTelemetry: { type: Schema.Types.Mixed, default: null },
    colorPalette: { type: Schema.Types.Mixed, default: [] },
    issues: [IssueSchema],
    ai: { available: Boolean, model: String, reason: String, cached: Boolean },
    screenshot: { type: ScreenshotRefSchema, default: null },
  },
  { timestamps: true }
);

AuditSchema.index({ ownerId: 1, createdAt: -1 });

// Reuse the compiled model across dev hot reloads.
const Audit: Model<AuditRecord> =
  (mongoose.models.Audit as Model<AuditRecord>) || mongoose.model<AuditRecord>("Audit", AuditSchema);

export default Audit;
