/**
 * Screenshot binary, stored separately from audits. Images are normalised to ≤1600px
 * WebP (~50–300 KB) before saving, comfortably inside MongoDB's 16 MB document limit,
 * so a plain Buffer field is enough — GridFS would only be needed for larger files.
 */
import mongoose, { Schema, type Model } from "mongoose";

export interface ScreenshotDoc {
  ownerId: string;
  data: Buffer;
  mimeType: string;
}

const ScreenshotSchema = new Schema<ScreenshotDoc>(
  {
    ownerId: { type: String, required: true, index: true },
    data: { type: Buffer, required: true },
    mimeType: { type: String, required: true },
  },
  { timestamps: true }
);

const Screenshot: Model<ScreenshotDoc> =
  (mongoose.models.Screenshot as Model<ScreenshotDoc>) || mongoose.model<ScreenshotDoc>("Screenshot", ScreenshotSchema);

export default Screenshot;
