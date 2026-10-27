"use client";

import type { ColorPaletteEntry, DomTelemetry } from "@/lib/types";
import { paletteContrastPairs } from "@/lib/color";
import { ImageIcon, Heading, Landmark, TextCursorInput, CheckCircle2, XCircle, FileText, Languages } from "lucide-react";
import type { ReactNode } from "react";

interface DomMathTabProps {
  domTelemetry: DomTelemetry | null;
  colorPalette?: ColorPaletteEntry[];
}

function PassFail({ pass }: { pass: boolean }) {
  return pass ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/25">
      <CheckCircle2 className="w-3 h-3" aria-hidden /> PASS
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/15 text-red-300 border border-red-500/25">
      <XCircle className="w-3 h-3" aria-hidden /> FAIL
    </span>
  );
}

function Metric({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-zinc-800/30">
      <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-zinc-800/60 flex items-center justify-center text-zinc-300">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-zinc-200">{title}</p>
        {children}
      </div>
    </div>
  );
}

const good = "text-xs text-emerald-300";
const bad = "text-xs text-red-300";

export default function DomMathTab({ domTelemetry, colorPalette = [] }: DomMathTabProps) {
  const pairs = paletteContrastPairs(colorPalette.map((c) => c.hex));

  return (
    <div className="space-y-5 animate-fade-in-up">
      {/* ── Markup metrics ─────────────────────────────────────── */}
      {domTelemetry ? (
        <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-4 space-y-3">
          <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">Markup metrics (measured)</h3>

          <Metric icon={<ImageIcon className="w-4 h-4" aria-hidden />} title={`Images: ${domTelemetry.totalImages}`}>
            <p className={domTelemetry.missingAltCount > 0 ? bad : good}>
              {domTelemetry.missingAltCount > 0
                ? `${domTelemetry.missingAltCount} missing alt attribute`
                : domTelemetry.totalImages > 0
                  ? "Every image has an alt attribute"
                  : "No <img> elements in the markup"}
            </p>
          </Metric>

          <Metric icon={<Heading className="w-4 h-4" aria-hidden />} title="Heading outline">
            {domTelemetry.headingStructure.length > 0 ? (
              <>
                <p className={domTelemetry.headingSkipped ? bad : good}>
                  {domTelemetry.headingSkipped ? "Levels are skipped" : "Levels are in order"}
                </p>
                <ol className="flex flex-col gap-0.5 mt-1">
                  {domTelemetry.headingStructure.map((h, i) => (
                    <li
                      key={i}
                      className="text-[11px] font-mono text-zinc-300"
                      style={{ paddingLeft: `${((parseInt(h.charAt(1)) || 1) - 1) * 12}px` }}
                    >
                      {h}
                    </li>
                  ))}
                </ol>
              </>
            ) : (
              <p className={bad}>No headings found</p>
            )}
          </Metric>

          <Metric icon={<Landmark className="w-4 h-4" aria-hidden />} title={`Landmarks: ${domTelemetry.landmarkCount}`}>
            <p className="text-xs text-zinc-400">header / nav / main / aside / footer and ARIA equivalents</p>
          </Metric>

          <Metric icon={<TextCursorInput className="w-4 h-4" aria-hidden />} title="Form fields">
            <p className={domTelemetry.formInputsWithoutLabels > 0 ? bad : good}>
              {domTelemetry.formInputsWithoutLabels > 0
                ? `${domTelemetry.formInputsWithoutLabels} without a label`
                : "No unlabeled fields"}
            </p>
          </Metric>

          <Metric icon={<Languages className="w-4 h-4" aria-hidden />} title="Document">
            <p className="text-xs text-zinc-400">
              lang: <span className={domTelemetry.lang ? "text-zinc-200" : "text-red-300"}>{domTelemetry.lang || "missing"}</span>
              {" · "}title: <span className={domTelemetry.metaTitle ? "text-zinc-200" : "text-red-300"}>{domTelemetry.metaTitle || "missing"}</span>
            </p>
            {domTelemetry.metaDescription && <p className="text-xs text-zinc-400 mt-0.5">description: {domTelemetry.metaDescription}</p>}
          </Metric>
        </section>
      ) : (
        <section className="flex flex-col items-center justify-center py-10 text-center rounded-xl border border-dashed border-zinc-800">
          <FileText className="w-7 h-7 text-zinc-500 mb-3" aria-hidden />
          <p className="text-sm text-zinc-300">Markup not analysed</p>
          <p className="text-xs text-zinc-400 max-w-sm mt-1">
            A screenshot alone has no HTML to measure. Audit a URL or paste HTML to get deterministic accessibility metrics.
          </p>
        </section>
      )}

      {/* ── Palette ─────────────────────────────────────────────── */}
      {colorPalette.length > 0 && (
        <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-4">
          <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-3">Dominant colours (from screenshot pixels)</h3>
          <ul className="flex flex-wrap gap-3">
            {colorPalette.map((c) => (
              <li key={c.hex} className="flex flex-col items-center gap-1.5">
                <div className="w-12 h-12 rounded-lg border border-zinc-700/50" style={{ backgroundColor: c.hex }} aria-hidden />
                <span className="text-[10px] font-mono text-zinc-300">{c.hex}</span>
                <span className="text-[10px] text-zinc-400">
                  {c.share !== undefined ? `${Math.round(c.share * 100)}%` : c.role} · L {c.luminance.toFixed(3)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {pairs.length > 0 && (
        <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-4">
          <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">Palette contrast reference</h3>
          <p className="text-[11px] text-zinc-400 mt-1 mb-3">
            WCAG ratio for each pair of dominant colours — &quot;would this pair be readable as text on background?&quot;.
            A reference for choosing colours, not a measurement of specific elements, so it does not affect the score.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-800/60 text-zinc-400">
                  <th scope="col" className="px-3 py-2 text-left font-medium">Colour A</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Colour B</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Ratio</th>
                  <th scope="col" className="px-3 py-2 text-center font-medium">AA (≥4.5)</th>
                  <th scope="col" className="px-3 py-2 text-center font-medium">AAA (≥7)</th>
                </tr>
              </thead>
              <tbody>
                {pairs.map((p) => (
                  <tr key={p.fg + p.bg} className="border-b border-zinc-800/40">
                    {[p.fg, p.bg].map((hex) => (
                      <td key={hex} className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="w-5 h-5 rounded border border-zinc-700/50" style={{ backgroundColor: hex }} aria-hidden />
                          <span className="font-mono text-zinc-200">{hex}</span>
                        </div>
                      </td>
                    ))}
                    <td className="px-3 py-2 font-mono font-bold text-zinc-100">{p.ratio}:1</td>
                    <td className="px-3 py-2 text-center"><PassFail pass={p.passesAA} /></td>
                    <td className="px-3 py-2 text-center"><PassFail pass={p.passesAAA} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
