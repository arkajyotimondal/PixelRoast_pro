import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { normalizeImage, sniffImageType } from "./image";
import { checkRateLimit, resetRateLimits } from "./security/rateLimit";

const png = (w: number, h: number) =>
  sharp({ create: { width: w, height: h, channels: 3, background: "#ff0000" } }).png().toBuffer();

describe("sniffImageType", () => {
  it("recognises real images by magic bytes", async () => {
    expect(sniffImageType(await png(4, 4))).toBe("png");
    expect(sniffImageType(await sharp(await png(4, 4)).jpeg().toBuffer())).toBe("jpeg");
    expect(sniffImageType(await sharp(await png(4, 4)).webp().toBuffer())).toBe("webp");
  });
  it("rejects HTML pretending to be an image", () => {
    expect(sniffImageType(Buffer.from("<script>alert(1)</script>"))).toBeNull();
  });
});

describe("normalizeImage", () => {
  it("downsizes wide images to 1600px WebP and hashes deterministically", async () => {
    const input = await png(3200, 1000);
    const a = await normalizeImage(input);
    const b = await normalizeImage(input);
    expect(a).toMatchObject({ width: 1600, height: 500, mimeType: "image/webp", truncated: false });
    expect(a.sha256).toBe(b.sha256);
  });

  it("crops very tall pages", async () => {
    const r = await normalizeImage(await png(800, 12000));
    expect(r.height).toBe(5000);
    expect(r.truncated).toBe(true);
  });

  it("rejects non-images and truncated files", async () => {
    await expect(normalizeImage(Buffer.from("hello"))).rejects.toMatchObject({ code: "INVALID_IMAGE" });
    const truncated = (await png(100, 100)).subarray(0, 40);
    await expect(normalizeImage(truncated)).rejects.toMatchObject({ code: "INVALID_IMAGE" });
  });

  it("rejects oversized uploads", async () => {
    await expect(normalizeImage(Buffer.alloc(9 * 1024 * 1024))).rejects.toMatchObject({ code: "PAYLOAD_TOO_LARGE" });
  });
});

describe("rate limiter", () => {
  it("allows max requests per window, then blocks until reset", () => {
    resetRateLimits();
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) expect(checkRateLimit("ip", 3, 60_000, t0).allowed).toBe(true);
    const blocked = checkRateLimit("ip", 3, 60_000, t0 + 1000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBe(59);
    expect(checkRateLimit("other-ip", 3, 60_000, t0).allowed).toBe(true);
    expect(checkRateLimit("ip", 3, 60_000, t0 + 60_000).allowed).toBe(true);
  });
});
