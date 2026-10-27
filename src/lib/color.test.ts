import { describe, expect, it } from "vitest";
import { contrastPair, contrastRatio, hexToRgb, paletteContrastPairs, relativeLuminance } from "./color";

describe("WCAG colour maths", () => {
  it("parses 3- and 6-digit hex", () => {
    expect(hexToRgb("#fff")).toEqual([255, 255, 255]);
    expect(hexToRgb("1a2b3c")).toEqual([26, 43, 60]);
    expect(() => hexToRgb("#zzz")).toThrow();
  });

  it("luminance endpoints", () => {
    expect(relativeLuminance("#000000")).toBe(0);
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 10);
  });

  it("black on white is 21:1 and is symmetric", () => {
    expect(contrastRatio("#000", "#fff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#fff", "#000")).toBeCloseTo(21, 5);
  });

  it("matches known reference values", () => {
    // #777 on white is the classic "just fails AA" grey (4.48:1)
    expect(contrastPair("#777777", "#ffffff")).toMatchObject({ ratio: 4.48, passesAA: false, passesAAA: false });
    // #767676 is the lightest grey that passes AA on white (4.54:1)
    expect(contrastPair("#767676", "#ffffff")).toMatchObject({ ratio: 4.54, passesAA: true });
    expect(contrastPair("#595959", "#ffffff").passesAAA).toBe(true); // 7.0:1
  });

  it("palette pairs are every combination", () => {
    expect(paletteContrastPairs(["#000", "#fff", "#777"])).toHaveLength(3);
    expect(paletteContrastPairs(["#000"])).toHaveLength(0);
  });
});
