/**
 * Dominant-colour extraction, done server-side from the normalised screenshot so the
 * palette can't be spoofed by the client.
 *
 * Method: downscale to 64px wide, quantise each channel to 16 levels (drop the low 4
 * bits) so near-identical shades cluster, then rank buckets by pixel count.
 */
import sharp from "sharp";
import type { ColorPaletteEntry } from "@/lib/types";
import { relativeLuminance, rgbToHex } from "@/lib/color";

export async function extractPalette(image: Buffer, topN = 5): Promise<ColorPaletteEntry[]> {
  const { data, info } = await sharp(image)
    .resize({ width: 64 })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const counts = new Map<number, number>();
  for (let i = 0; i < data.length; i += info.channels) {
    const key = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const total = data.length / info.channels;

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([key, count], i) => {
      // Use the bucket centre (+8) rather than its floor for a truer colour.
      const hex = rgbToHex((((key >> 8) & 15) << 4) + 8, (((key >> 4) & 15) << 4) + 8, ((key & 15) << 4) + 8);
      return {
        hex,
        role: i === 0 ? "dominant" : i === 1 ? "secondary" : `color-${i + 1}`,
        luminance: Math.round(relativeLuminance(hex) * 10000) / 10000,
        share: Math.round((count / total) * 1000) / 1000,
      };
    });
}
