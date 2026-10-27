/**
 * WCAG 2.x colour maths (pure functions, unit tested).
 *
 * Relative luminance: https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 * Contrast ratio:     (L_lighter + 0.05) / (L_darker + 0.05), range 1–21.
 */
import type { ContrastPair } from "@/lib/types";

export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace(/^#/, "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean.slice(0, 6);
  if (!/^[0-9a-f]{6}$/i.test(full)) throw new Error(`Invalid hex colour: ${hex}`);
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}

/** sRGB channel (0–255) → linear light (0–1). */
function linearize(channel: number): number {
  const s = channel / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

export function contrastRatio(a: string, b: string): number {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/** AA for normal text is 4.5:1, AAA is 7:1. */
export function contrastPair(fg: string, bg: string): ContrastPair {
  const ratio = Math.round(contrastRatio(fg, bg) * 100) / 100;
  return { fg, bg, ratio, passesAA: ratio >= 4.5, passesAAA: ratio >= 7 };
}

/**
 * Every combination of palette colours. This is a *reference* table ("would these two
 * colours be readable as text on background?"), not a measurement of real elements.
 */
export function paletteContrastPairs(colors: string[]): ContrastPair[] {
  const pairs: ContrastPair[] = [];
  for (let i = 0; i < colors.length; i++) {
    for (let j = i + 1; j < colors.length; j++) pairs.push(contrastPair(colors[i], colors[j]));
  }
  return pairs;
}
