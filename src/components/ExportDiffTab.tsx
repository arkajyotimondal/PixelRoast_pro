"use client";

import type { AuditMode, AuditResult, ScoreCategory } from "@/lib/types";
import { generateMarkdownReport, generateJsonReport } from "@/lib/utils";
import {
  Download,
  ClipboardCopy,
  FileJson,
  FileText,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from "lucide-react";
import { showToast } from "./ToastContainer";
import { useCallback, useMemo } from "react";

interface ExportDiffTabProps {
  result: AuditResult;
  previousResult: AuditResult | null;
  /** Persona currently selected — only changes the exported summary text. */
  mode: AuditMode;
}

/** Difference between two scores, or null if either wasn't assessed. */
const delta = (a: number | null, b: number | null) => (a === null || b === null ? null : a - b);

export default function ExportDiffTab({ result, previousResult, mode }: ExportDiffTabProps) {
  const handleExportMarkdown = useCallback(() => {
    const md = generateMarkdownReport(result, mode);
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pixelroast-audit-${new Date().toISOString().split("T")[0]}.md`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Markdown report downloaded!", "success");
  }, [result, mode]);

  const handleExportJson = useCallback(() => {
    const json = generateJsonReport(result);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pixelroast-audit-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("JSON report downloaded!", "success");
  }, [result]);

  const handleCopyMarkdown = useCallback(() => {
    const md = generateMarkdownReport(result, mode);
    navigator.clipboard.writeText(md).then(() => {
      showToast("Markdown copied to clipboard!", "success");
    });
  }, [result, mode]);

  const handleCopyJson = useCallback(() => {
    const json = generateJsonReport(result);
    navigator.clipboard.writeText(json).then(() => {
      showToast("JSON copied to clipboard!", "success");
    });
  }, [result]);

  // Compare with the previously viewed audit
  const deltas = useMemo(() => {
    if (!previousResult) return null;
    const cat = (k: ScoreCategory) => delta(result.categoryScores[k], previousResult.categoryScores[k]);
    return {
      overall: delta(result.overallScore, previousResult.overallScore),
      hierarchy: cat("hierarchy"),
      contrast: cat("contrast"),
      spacing: cat("spacing"),
      ctaClarity: cat("ctaClarity"),
      semantics: cat("semantics"),
    };
  }, [result, previousResult]);

  // Issues are matched across audits by rule id (stable), not by title text.
  const issueDiff = useMemo(() => {
    if (!previousResult) return null;
    const before = new Set(previousResult.issues.map((i) => i.ruleId));
    const after = new Set(result.issues.map((i) => i.ruleId));
    return {
      fixed: [...before].filter((r) => !after.has(r)).length,
      added: [...after].filter((r) => !before.has(r)).length,
      remaining: [...after].filter((r) => before.has(r)).length,
    };
  }, [result, previousResult]);

  const DeltaBadge = ({ value }: { value: number | null }) => {
    if (value === null) {
      return <span className="text-[10px] text-zinc-400">n/a</span>;
    }
    if (value === 0) {
      return (
        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-zinc-800/60 text-zinc-400">
          <Minus className="w-2.5 h-2.5" /> 0
        </span>
      );
    }
    if (value > 0) {
      return (
        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
          <ArrowUpRight className="w-2.5 h-2.5" /> +{value} pts
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-500/15 text-red-400 border border-red-500/25">
        <ArrowDownRight className="w-2.5 h-2.5" /> {value} pts
      </span>
    );
  };

  return (
    <div className="space-y-5 animate-fade-in-up">
      {/* ── Score Comparison ───────────────────────────────────── */}
      {deltas ? (
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-4">
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-4">
            Score Comparison vs. Previous Audit
          </h3>
          <div className="space-y-3">
            {[
              { label: "Overall Score", current: result.overallScore, delta: deltas.overall },
              { label: "Visual Hierarchy", current: result.categoryScores.hierarchy, delta: deltas.hierarchy },
              { label: "Color & Contrast", current: result.categoryScores.contrast, delta: deltas.contrast },
              { label: "Spacing & Alignment", current: result.categoryScores.spacing, delta: deltas.spacing },
              { label: "CTA Clarity", current: result.categoryScores.ctaClarity, delta: deltas.ctaClarity },
              { label: "Semantic Structure", current: result.categoryScores.semantics, delta: deltas.semantics },
            ].map((row) => (
              <div
                key={row.label}
                className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-800/30"
              >
                <span className="text-xs font-medium text-zinc-300">{row.label}</span>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono font-bold text-zinc-200">
                    {row.current === null ? "—" : `${row.current}/100`}
                  </span>
                  <DeltaBadge value={row.delta} />
                </div>
              </div>
            ))}
          </div>
          {issueDiff && (
            <p className="mt-4 text-xs text-zinc-300">
              Issues vs previous: <span className="text-emerald-300 font-semibold">{issueDiff.fixed} fixed</span>,{" "}
              <span className="text-red-300 font-semibold">{issueDiff.added} new</span>, {issueDiff.remaining} remaining
              <span className="text-zinc-400"> (matched by rule id)</span>
            </p>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-4">
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
            Score Comparison
          </h3>
          <p className="text-xs text-zinc-400">
            No previous audit to compare. Run another audit to see score deltas.
          </p>
        </div>
      )}

      {/* ── Export Buttons ─────────────────────────────────────── */}
      <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-4">
        <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-4">
          Export Engineering Report
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={handleExportMarkdown}
            className="flex flex-col items-center gap-2 p-4 rounded-xl border border-zinc-800/60
              bg-zinc-800/30 hover:bg-zinc-800/50 hover:border-zinc-700/60
              transition-all duration-200 group"
          >
            <div className="w-10 h-10 rounded-lg bg-zinc-800/60 flex items-center justify-center group-hover:bg-orange-500/10 transition-colors">
              <FileText className="w-5 h-5 text-zinc-400 group-hover:text-orange-400 transition-colors" />
            </div>
            <div className="flex items-center gap-1">
              <Download className="w-3 h-3 text-zinc-400" />
              <span className="text-xs font-medium text-zinc-300">Download .md</span>
            </div>
          </button>

          <button
            onClick={handleExportJson}
            className="flex flex-col items-center gap-2 p-4 rounded-xl border border-zinc-800/60
              bg-zinc-800/30 hover:bg-zinc-800/50 hover:border-zinc-700/60
              transition-all duration-200 group"
          >
            <div className="w-10 h-10 rounded-lg bg-zinc-800/60 flex items-center justify-center group-hover:bg-blue-500/10 transition-colors">
              <FileJson className="w-5 h-5 text-zinc-400 group-hover:text-blue-400 transition-colors" />
            </div>
            <div className="flex items-center gap-1">
              <Download className="w-3 h-3 text-zinc-400" />
              <span className="text-xs font-medium text-zinc-300">Download .json</span>
            </div>
          </button>

          <button
            onClick={handleCopyMarkdown}
            className="flex flex-col items-center gap-2 p-4 rounded-xl border border-zinc-800/60
              bg-zinc-800/30 hover:bg-zinc-800/50 hover:border-zinc-700/60
              transition-all duration-200 group"
          >
            <div className="w-10 h-10 rounded-lg bg-zinc-800/60 flex items-center justify-center group-hover:bg-emerald-500/10 transition-colors">
              <ClipboardCopy className="w-5 h-5 text-zinc-400 group-hover:text-emerald-400 transition-colors" />
            </div>
            <span className="text-xs font-medium text-zinc-300">Copy Markdown</span>
          </button>

          <button
            onClick={handleCopyJson}
            className="flex flex-col items-center gap-2 p-4 rounded-xl border border-zinc-800/60
              bg-zinc-800/30 hover:bg-zinc-800/50 hover:border-zinc-700/60
              transition-all duration-200 group"
          >
            <div className="w-10 h-10 rounded-lg bg-zinc-800/60 flex items-center justify-center group-hover:bg-amber-500/10 transition-colors">
              <ClipboardCopy className="w-5 h-5 text-zinc-400 group-hover:text-amber-400 transition-colors" />
            </div>
            <span className="text-xs font-medium text-zinc-300">Copy JSON</span>
          </button>
        </div>
      </div>
    </div>
  );
}
