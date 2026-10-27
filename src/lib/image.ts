/**
 * Server-side upload validation and normalisation.
 *
 * We never trust the client's Content-Type: the first bytes ("magic numbers") must
 * match PNG, JPEG or WebP. sharp then decodes it for real (a truncated or forged file
 * fails here), strips metadata, and downsizes to a bounded size so storage and the
 * vision call stay cheap. The stored image is exactly what the model saw, so issue
 * coordinates line up with it.
 */
import { createHash } from "node:crypto";
import sharp from "sharp";
import { ApiError } from "@/lib/http/errors";

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const MAX_WIDTH = 1600;
const MAX_HEIGHT = 5000; // taller pages are cropped to the top section

export type ImageKind = "png" | "jpeg" | "webp";

export function sniffImageType(buf: Buffer): ImageKind | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "png";
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    return "webp";
  }
  return null;
}

export interface NormalizedImage {
  data: Buffer;
  mimeType: "image/webp";
  width: number;
  height: number;
  /** sha256 of the normalised bytes — identical uploads give identical hashes (used as AI cache key). */
  sha256: string;
  truncated: boolean;
}

export async function normalizeImage(input: Buffer): Promise<NormalizedImage> {
  if (input.length === 0) throw new ApiError(400, "INVALID_IMAGE", "The uploaded file is empty.");
  if (input.length > MAX_UPLOAD_BYTES) {
    throw new ApiError(413, "PAYLOAD_TOO_LARGE", `Images must be under ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`);
  }
  if (!sniffImageType(input)) {
    throw new ApiError(400, "INVALID_IMAGE", "Only PNG, JPEG or WebP images are accepted.");
  }

  try {
    // limitInputPixels guards against decompression bombs (tiny file, huge canvas).
    const resized = await sharp(input, { limitInputPixels: 50_000_000 })
      .rotate() // honour EXIF orientation before metadata is stripped
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .toBuffer({ resolveWithObject: true });

    let pipeline = sharp(resized.data);
    const truncated = resized.info.height > MAX_HEIGHT;
    if (truncated) {
      pipeline = pipeline.extract({ left: 0, top: 0, width: resized.info.width, height: MAX_HEIGHT });
    }
    const out = await pipeline.webp({ quality: 82 }).toBuffer({ resolveWithObject: true });

    return {
      data: out.data,
      mimeType: "image/webp",
      width: out.info.width,
      height: out.info.height,
      sha256: createHash("sha256").update(out.data).digest("hex"),
      truncated,
    };
  } catch {
    throw new ApiError(400, "INVALID_IMAGE", "The image could not be decoded. Is the file corrupted?");
  }
}
