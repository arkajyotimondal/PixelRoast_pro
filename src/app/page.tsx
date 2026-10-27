"use client";

import { useState, useEffect, useRef, type ComponentType } from "react";
import {
  Upload,
  Link2,
  Sparkles,
  Flame,
  Accessibility,
  TrendingUp,
  Loader2,
  ImagePlus,
  AlertTriangle,
  Globe,
  CheckCircle2,
  ArrowRight,
  BarChart3,
  Bug,
  Zap,
  Gauge,
  FileOutput,
  Clipboard,
  Code2,
  Info,
} from "lucide-react";
import type {
  ApiErrorPayload,
  AuditAnalytics,
  AuditMode,
  AuditResult,
  AuditsApiResponse,
  InspectorTab,
  ScoreCategory,
  SeverityFilter,
  SourceType,
} from "@/lib/types";
import { prepareImage, generateFlawedSampleUI } from "@/lib/utils";
import { SAMPLE_HTML } from "@/lib/samples";
import ScoreRing, { MiniScoreBar } from "@/components/ScoreRing";
import ScreenshotCanvas from "@/components/ScreenshotCanvas";
import IssueList from "@/components/IssueList";
import AuditHistory from "@/components/AuditHistory";
import DomMathTab from "@/components/DomMathTab";
import ExportDiffTab from "@/components/ExportDiffTab";
import ToastContainer, { showToast } from "@/components/ToastContainer";

type Icon = ComponentType<{ className?: string }>;

const EMPTY_ANALYTICS: AuditAnalytics = { totalAudits: 0, avgScore: 0, totalCritical: 0 };

const MODES: { id: AuditMode; label: string; icon: Icon; desc: string }[] = [
  { id: "roast", label: "Roast", icon: Flame, desc: "Design Director" },
  { id: "accessibility", label: "A11y", icon: Accessibility, desc: "WCAG 2.1 AA Auditor" },
  { id: "conversion", label: "CRO", icon: TrendingUp, desc: "Conversion Strategist" },
];

const SOURCES: { id: SourceType; label: string; icon: Icon }[] = [
  { id: "upload", label: "Screenshot", icon: Upload },
  { id: "url", label: "Website URL", icon: Globe },
  { id: "html", label: "Paste HTML", icon: Code2 },
];

const CATEGORY_LABELS: Record<ScoreCategory, string> = {
  hierarchy: "Visual Hierarchy",
  contrast: "Color & Contrast",
  spacing: "Spacing & Layout",
  ctaClarity: "CTA Clarity",
  semantics: "Semantics & A11y",
};

const INSPECTOR_TABS: { id: InspectorTab; label: string; icon: Icon }[] = [
  { id: "issues", label: "Issues", icon: Bug },
  { id: "dom", label: "Metrics", icon: Gauge },
  { id: "export", label: "Export & Diff", icon: FileOutput },
];

/** Read the API's uniform error shape ({ error: { code, message } }). */
async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as Partial<ApiErrorPayload>;
    return body.error?.message ?? `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

export default function HomePage() {
  // ─── Input state ────────────────────────────────────────────
  const [source, setSource] = useState<SourceType>("upload");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageBlob, setImageBlob] = useState<Blob | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [htmlInput, setHtmlInput] = useState("");
  const [mode, setMode] = useState<AuditMode>("roast");
  const [isCapturingUrl, setIsCapturingUrl] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  // ─── Result state ───────────────────────────────────────────
  const [result, setResult] = useState<AuditResult | null>(null);
  const [previousResult, setPreviousResult] = useState<AuditResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("All");
  const [activeIssueId, setActiveIssueId] = useState<number | null>(null);
  const [highlightedIssueId, setHighlightedIssueId] = useState<number | null>(null);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("issues");

  // ─── History (scoped to this browser's owner cookie) ────────
  const [dbAudits, setDbAudits] = useState<AuditResult[]>([]);
  const [analytics, setAnalytics] = useState<AuditAnalytics>(EMPTY_ANALYTICS);
  const [historyLoading, setHistoryLoading] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const rightPaneRef = useRef<HTMLDivElement>(null);

  function applyHistory(data: AuditsApiResponse) {
    setDbAudits(data.audits);
    setAnalytics(data.analytics);
  }

  async function fetchAudits() {
    setHistoryLoading(true);
    try {
      const res = await fetch("/api/audits");
      if (!res.ok) throw new Error(await readError(res));
      applyHistory(await res.json());
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not load history", "error");
    } finally {
      setHistoryLoading(false);
    }
  }

  // Initial history load. State is only set in the async callback, never synchronously.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/audits")
      .then(async (res) => {
        if (!res.ok) throw new Error(await readError(res));
        return res.json() as Promise<AuditsApiResponse>;
      })
      .then((data) => !cancelled && applyHistory(data))
      .catch((err: Error) => !cancelled && showToast(err.message, "error"))
      .finally(() => !cancelled && setHistoryLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  // ─── Image input ────────────────────────────────────────────
  async function loadImage(sourceImage: Blob | string) {
    try {
      setError(null);
      setResult(null);
      const { blob, previewUrl } = await prepareImage(sourceImage);
      setImageBlob(blob);
      setPreviewUrl(previewUrl);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process image");
      return false;
    }
  }

  // Keep the latest loader in a ref so the global paste listener never goes stale.
  const loadImageRef = useRef(loadImage);
  useEffect(() => {
    loadImageRef.current = loadImage;
  });

  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("textarea, input")) return; // let normal text paste work
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith("image/"));
      const file = item?.getAsFile();
      if (!file) return;
      e.preventDefault();
      setSource("upload");
      if (await loadImageRef.current(file)) showToast("Image pasted from clipboard!", "success");
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, []);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please drop an image file (PNG, JPG, or WebP)");
      return;
    }
    loadImage(file).then((ok) => ok && showToast("Image uploaded!", "success"));
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file && (await loadImage(file))) showToast("Image uploaded!", "success");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  /**
   * Optional: grab a screenshot of the URL via microlink.io so the vision model and pins
   * have something to work with. The page's HTML is always fetched by our own server
   * (through the SSRF guard), screenshot or not.
   */
  async function handleUrlCapture() {
    if (!urlInput.trim()) return;
    setIsCapturingUrl(true);
    setError(null);
    try {
      const res = await fetch(
        // waitForTimeout: JavaScript apps (React, Streamlit…) show a spinner first; give them time to render.
        `https://api.microlink.io/?url=${encodeURIComponent(urlInput.trim())}&screenshot=true&meta=false&waitForTimeout=5000`
      );
      const data = await res.json();
      if (data.status !== "success" || !data.data?.screenshot?.url) throw new Error();
      const img = await fetch(data.data.screenshot.url);
      if (await loadImage(await img.blob())) showToast("Website captured!", "success");
    } catch {
      setError("Screenshot capture failed — you can still run the audit; the page's HTML will be analysed.");
    } finally {
      setIsCapturingUrl(false);
    }
  }

  async function handleLoadSample() {
    setSource("upload");
    if (await loadImage(await generateFlawedSampleUI())) showToast("Sample flawed UI loaded!", "info");
  }

  function handleLoadSampleHtml() {
    setSource("html");
    setHtmlInput(SAMPLE_HTML);
    setResult(null);
    showToast("Sample HTML loaded", "info");
  }

  // ─── Run audit ──────────────────────────────────────────────
  const canRun =
    !isLoading &&
    ((source === "upload" && !!imageBlob) ||
      (source === "url" && urlInput.trim().length > 0) ||
      (source === "html" && htmlInput.trim().length > 0));

  async function handleRunAudit() {
    if (!canRun) return;
    setIsLoading(true);
    setError(null);
    setPreviousResult(result);
    setResult(null);
    setSeverityFilter("All");
    setActiveIssueId(null);
    setInspectorTab("issues");

    const form = new FormData();
    form.set("source", source);
    form.set("mode", mode);
    if (source === "url") form.set("url", urlInput.trim());
    if (source === "html") form.set("html", htmlInput);
    if (source !== "html" && imageBlob) form.set("file", imageBlob, `screenshot.${imageBlob.type === "image/webp" ? "webp" : "jpg"}`);

    try {
      const res = await fetch("/api/audits", { method: "POST", body: form });
      if (!res.ok) throw new Error(await readError(res));
      const data: AuditResult = await res.json();
      setResult(data);
      if (!data.ai.available) showToast("AI review unavailable — showing measured results only", "info");
      fetchAudits();
      rightPaneRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run audit");
    } finally {
      setIsLoading(false);
    }
  }

  // ─── Interaction handlers ───────────────────────────────────
  function handlePinClick(issueId: number) {
    setActiveIssueId(issueId);
    setInspectorTab("issues");
  }

  function handleHistorySelect(audit: AuditResult) {
    setPreviousResult(result);
    setResult(audit);
    setMode(audit.mode);
    setSeverityFilter("All");
    setActiveIssueId(null);
    setInspectorTab("issues");
    showToast("Loaded audit from history", "info");
  }

  async function handleHistoryDelete(id: string) {
    const res = await fetch(`/api/audits/${id}`, { method: "DELETE" });
    if (!res.ok) {
      showToast(await readError(res), "error");
      return;
    }
    if (result?._id === id) setResult(null);
    showToast("Audit deleted", "info");
    fetchAudits();
  }

  // The screenshot shown is the one the audit was run on (server copy) once a result exists.
  const canvasImage = result ? (result.screenshot?.url ?? null) : source === "html" ? null : previewUrl;
  const summary = result ? (result.summaries?.[mode] ?? result.summary) : "";

  // ═══════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════
  return (
    <div className="flex flex-col min-h-screen">
      {/* ════════ HEADER ════════ */}
      <header className="flex-shrink-0 border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-[1800px] mx-auto px-4 sm:px-6">
          <div className="h-14 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center">
                <Flame className="w-4 h-4 text-white" aria-hidden />
              </div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-zinc-100 tracking-tight">PixelRoast</h1>
                <span className="hidden sm:inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest bg-orange-500/15 text-orange-400 border border-orange-500/25">
                  Pro
                </span>
              </div>
            </div>

            {/* Your stats (owner-scoped) */}
            <div className="hidden md:flex items-center gap-4" aria-label="Your audit statistics">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900/60 border border-zinc-800/60">
                <BarChart3 className="w-3.5 h-3.5 text-blue-400" aria-hidden />
                <span className="text-[11px] font-medium text-zinc-300">{analytics.totalAudits}</span>
                <span className="text-[10px] text-zinc-400">Audits</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900/60 border border-zinc-800/60">
                <Zap className="w-3.5 h-3.5 text-amber-400" aria-hidden />
                <span className="text-[11px] font-mono font-bold text-zinc-300">{analytics.avgScore}</span>
                <span className="text-[10px] text-zinc-400">Avg Score</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900/60 border border-zinc-800/60">
                <Bug className="w-3.5 h-3.5 text-red-400" aria-hidden />
                <span className="text-[11px] font-medium text-zinc-300">{analytics.totalCritical}</span>
                <span className="text-[10px] text-zinc-400">Critical</span>
              </div>
            </div>

            <div className="hidden sm:flex items-center gap-2 text-xs text-zinc-400">
              <Sparkles className="w-3.5 h-3.5 text-orange-400" aria-hidden />
              DOM checks + AI vision
            </div>
          </div>
        </div>
      </header>

      {/* ════════ MAIN ════════ */}
      <main className="flex-1 max-w-[1800px] mx-auto w-full px-4 sm:px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* ══════ LEFT PANE ══════ */}
          <div className="lg:col-span-5 lg:sticky lg:top-20 space-y-5">
            <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/60 overflow-hidden">
              {/* Source tabs */}
              <div role="tablist" aria-label="What to audit" className="grid grid-cols-3 border-b border-zinc-800/60">
                {SOURCES.map((s) => {
                  const Icon = s.icon;
                  const active = source === s.id;
                  return (
                    <button
                      key={s.id}
                      role="tab"
                      aria-selected={active}
                      onClick={() => {
                        setSource(s.id);
                        setError(null);
                      }}
                      className={`flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-semibold border-b-2 transition-colors
                        focus-visible:outline-2 focus-visible:outline-orange-400 focus-visible:-outline-offset-2
                        ${active ? "border-orange-500 text-orange-400 bg-orange-500/5" : "border-transparent text-zinc-400 hover:text-zinc-200"}`}
                    >
                      <Icon className="w-3.5 h-3.5" aria-hidden />
                      {s.label}
                    </button>
                  );
                })}
              </div>

              {/* Upload area (screenshot and optional URL screenshot) */}
              {source !== "html" && (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragOver(true);
                  }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={handleDrop}
                  className={`relative p-5 transition-colors border-b ${isDragOver ? "drag-over border-orange-500/30" : "border-zinc-800/60"}`}
                >
                  {!previewUrl ? (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full flex flex-col items-center gap-3 py-3 rounded-lg hover:bg-zinc-800/30 focus-visible:outline-2 focus-visible:outline-orange-400"
                    >
                      <div className="w-12 h-12 rounded-xl bg-zinc-800/60 border border-zinc-700/50 flex items-center justify-center">
                        <Upload className="w-5 h-5 text-zinc-400" aria-hidden />
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-medium text-zinc-300">
                          {source === "url" ? "Optional: add a screenshot, or " : "Drop a screenshot here or "}
                          <span className="text-orange-400">browse</span>
                        </p>
                        <p className="text-xs text-zinc-400 mt-1">
                          PNG, JPG, WebP up to 8 MB • or paste with{" "}
                          <kbd className="px-1 py-0.5 rounded bg-zinc-800 text-zinc-300 text-[10px] font-mono border border-zinc-700/50">
                            Cmd+V
                          </kbd>
                        </p>
                      </div>
                    </button>
                  ) : (
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" aria-hidden />
                      <span className="text-sm text-zinc-300 font-medium">Screenshot ready</span>
                      <button
                        onClick={() => {
                          setPreviewUrl(null);
                          setImageBlob(null);
                        }}
                        className="ml-auto text-xs text-zinc-400 hover:text-red-400"
                      >
                        Remove
                      </button>
                      <button onClick={() => fileInputRef.current?.click()} className="text-xs text-zinc-400 hover:text-orange-400">
                        Replace
                      </button>
                    </div>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleFileChange}
                    className="hidden"
                    aria-label="Upload screenshot"
                  />
                </div>
              )}

              {/* URL input */}
              {source === "url" && (
                <div className="px-4 py-3 border-b border-zinc-800/60 space-y-2">
                  <label htmlFor="url-input" className="text-xs font-medium text-zinc-400">
                    Page URL — its HTML is fetched by our server and checked deterministically
                  </label>
                  <div className="flex items-center gap-2">
                    <Globe className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" aria-hidden />
                    <input
                      id="url-input"
                      type="url"
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleRunAudit()}
                      placeholder="https://example.com"
                      className="flex-1 bg-transparent text-sm text-zinc-200 placeholder:text-zinc-500 outline-none font-mono"
                    />
                    <button
                      onClick={handleUrlCapture}
                      disabled={isCapturingUrl || !urlInput.trim()}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-zinc-800/60 border border-zinc-700/50 text-zinc-300
                        hover:text-zinc-100 hover:border-zinc-600 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {isCapturingUrl ? <Loader2 className="w-3 h-3 animate-spin" aria-hidden /> : <Link2 className="w-3 h-3" aria-hidden />}
                      {isCapturingUrl ? "Capturing… (~10s)" : "Capture screenshot"}
                    </button>
                  </div>
                </div>
              )}

              {/* HTML input */}
              {source === "html" && (
                <div className="px-4 py-3 border-b border-zinc-800/60 space-y-2">
                  <label htmlFor="html-input" className="text-xs font-medium text-zinc-400">
                    Paste a full HTML document (max 500 KB)
                  </label>
                  <textarea
                    id="html-input"
                    value={htmlInput}
                    onChange={(e) => setHtmlInput(e.target.value)}
                    rows={10}
                    spellCheck={false}
                    placeholder="<!doctype html>…"
                    className="w-full rounded-lg bg-zinc-950 border border-zinc-800 p-3 text-[11px] font-mono text-zinc-200 placeholder:text-zinc-500
                      focus:outline-none focus:border-orange-500/50"
                  />
                </div>
              )}

              {/* Samples */}
              <div className="px-4 py-3 grid grid-cols-2 gap-2">
                <button
                  onClick={handleLoadSample}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium bg-zinc-800/40 border border-dashed border-zinc-700/50 text-zinc-300
                    hover:text-orange-400 hover:border-orange-500/30"
                >
                  <ImagePlus className="w-3.5 h-3.5" aria-hidden />
                  Sample screenshot
                </button>
                <button
                  onClick={handleLoadSampleHtml}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium bg-zinc-800/40 border border-dashed border-zinc-700/50 text-zinc-300
                    hover:text-orange-400 hover:border-orange-500/30"
                >
                  <Code2 className="w-3.5 h-3.5" aria-hidden />
                  Sample HTML
                </button>
              </div>
            </div>

            {/* Persona selector */}
            <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Persona</span>
                <span className="text-[10px] text-zinc-400">Changes tone only — never scores or issues</span>
              </div>
              <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Persona">
                {MODES.map((m) => {
                  const Icon = m.icon;
                  const isActive = mode === m.id;
                  return (
                    <button
                      key={m.id}
                      role="radio"
                      aria-checked={isActive}
                      onClick={() => setMode(m.id)}
                      className={`flex flex-col items-center gap-1.5 px-3 py-3 rounded-lg border transition-colors text-center
                        ${isActive ? "border-orange-500/40 bg-orange-500/10 text-orange-400" : "border-zinc-800/60 bg-zinc-900/40 text-zinc-400 hover:text-zinc-200"}`}
                    >
                      <Icon className="w-4 h-4" aria-hidden />
                      <span className="text-xs font-semibold">{m.label}</span>
                      <span className="text-[10px] opacity-80">{m.desc}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              onClick={handleRunAudit}
              disabled={!canRun}
              className="w-full flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl font-semibold text-sm transition-colors
                disabled:opacity-40 disabled:cursor-not-allowed bg-orange-500 hover:bg-orange-400 text-zinc-950
                focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                  Analyzing… (AI review can take up to a minute)
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" aria-hidden />
                  Run Audit
                  <ArrowRight className="w-4 h-4" aria-hidden />
                </>
              )}
            </button>

            {error && (
              <div role="alert" className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-300">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" aria-hidden />
                <span>{error}</span>
              </div>
            )}

            {canvasImage && (
              <ScreenshotCanvas
                imageDataUrl={canvasImage}
                issues={result?.issues ?? []}
                activeIssueId={activeIssueId ?? highlightedIssueId}
                onPinClick={handlePinClick}
                onPinHover={setHighlightedIssueId}
              />
            )}

            <AuditHistory
              audits={dbAudits}
              isLoading={historyLoading}
              onSelect={handleHistorySelect}
              onDelete={handleHistoryDelete}
              onRefresh={fetchAudits}
            />
          </div>

          {/* ══════ RIGHT PANE ══════ */}
          <div ref={rightPaneRef} className="lg:col-span-7 space-y-5">
            {isLoading && (
              <div className="space-y-4" aria-busy="true" aria-label="Running audit">
                <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-6">
                  <div className="flex items-center gap-6">
                    <div className="w-40 h-40 rounded-full shimmer" />
                    <div className="flex-1 space-y-3">
                      <div className="h-4 w-3/4 rounded shimmer" />
                      <div className="h-3 w-1/2 rounded shimmer" />
                      <div className="h-8 w-full rounded shimmer mt-4" />
                      <div className="h-8 w-full rounded shimmer" />
                    </div>
                  </div>
                </div>
                {[1, 2, 3].map((i) => (
                  <div key={i} className="rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-5 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-full shimmer" />
                      <div className="h-4 w-48 rounded shimmer" />
                    </div>
                    <div className="h-3 w-full rounded shimmer" />
                    <div className="h-3 w-3/4 rounded shimmer" />
                  </div>
                ))}
              </div>
            )}

            {!isLoading && !result && (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <div className="w-16 h-16 rounded-2xl bg-zinc-800/40 border border-zinc-700/40 flex items-center justify-center mb-5">
                  <Sparkles className="w-7 h-7 text-zinc-400" aria-hidden />
                </div>
                <h2 className="text-lg font-semibold text-zinc-300 mb-2">No audit yet</h2>
                <p className="text-sm text-zinc-400 max-w-sm">
                  Upload a screenshot, enter a URL, or paste HTML — or try a sample. You get deterministic
                  accessibility checks, an AI design review, a score, and copy-pasteable fixes.
                </p>
              </div>
            )}

            {!isLoading && result && (
              <div className="space-y-5 animate-fade-in-up">
                {/* AI status */}
                {result.ai.available ? (
                  <p className="flex items-center gap-1.5 text-[11px] text-zinc-400">
                    <Info className="w-3 h-3" aria-hidden />
                    AI review by {result.ai.model}
                    {result.ai.cached && " (cached — identical input)"}
                  </p>
                ) : (
                  <div role="status" className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-sm text-amber-200">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" aria-hidden />
                    <span>
                      <strong>AI review unavailable</strong> — {result.ai.reason}. This report shows only measured,
                      deterministic results; categories that weren&apos;t checked are marked &quot;not assessed&quot;.
                    </span>
                  </div>
                )}

                {result.domTelemetry?.likelyJsRendered && (
                  <div role="status" className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-blue-500/10 border border-blue-500/25 text-sm text-blue-200">
                    <Info className="w-4 h-4 flex-shrink-0 mt-0.5" aria-hidden />
                    <span>
                      <strong>This site renders its content with JavaScript</strong>, so the markup checks only saw an
                      empty app shell.{" "}
                      {result.screenshot
                        ? "The AI review used your screenshot for the visible design."
                        : "For a full review, click “Capture screenshot” (or upload one) and run the audit again."}
                    </span>
                  </div>
                )}

                {/* Scorecard */}
                <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-6">
                  <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
                    <div className="flex-shrink-0">
                      <ScoreRing score={result.overallScore} />
                    </div>
                    <div className="flex-1 w-full space-y-4">
                      <div>
                        <h2 className="text-sm font-semibold text-zinc-100 mb-1">{result.title}</h2>
                        <p className="text-sm text-zinc-300 leading-relaxed">{summary}</p>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {(Object.keys(CATEGORY_LABELS) as ScoreCategory[]).map((key) => (
                          <MiniScoreBar key={key} label={CATEGORY_LABELS[key]} score={result.categoryScores[key]} />
                        ))}
                      </div>
                      <p className="text-[11px] text-zinc-400">
                        Computed from the issues below, not by the AI. Overall = product of the category scores, so
                        problems in one area can&apos;t be averaged away by the others.
                      </p>
                      {result.positives.length > 0 && (
                        <ul className="flex flex-wrap gap-2 pt-1">
                          {result.positives.map((p, i) => (
                            <li
                              key={i}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"
                            >
                              <CheckCircle2 className="w-3 h-3" aria-hidden />
                              {p}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>

                {/* Inspector */}
                <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/60 overflow-hidden">
                  <div role="tablist" aria-label="Report sections" className="flex items-center border-b border-zinc-800/60 px-4">
                    {INSPECTOR_TABS.map((tab) => {
                      const Icon = tab.icon;
                      const isActive = inspectorTab === tab.id;
                      return (
                        <button
                          key={tab.id}
                          role="tab"
                          aria-selected={isActive}
                          onClick={() => setInspectorTab(tab.id)}
                          className={`flex items-center gap-1.5 px-4 py-3 text-xs font-semibold border-b-2 transition-colors
                            ${isActive ? "border-orange-500 text-orange-400" : "border-transparent text-zinc-400 hover:text-zinc-200"}`}
                        >
                          <Icon className="w-3.5 h-3.5" aria-hidden />
                          {tab.label}
                          {tab.id === "issues" && result.issues.length > 0 && (
                            <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${isActive ? "bg-orange-500/20" : "bg-zinc-800/60"}`}>
                              {result.issues.length}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  <div className="p-4">
                    {inspectorTab === "issues" && (
                      <IssueList
                        issues={result.issues}
                        severityFilter={severityFilter}
                        onSeverityFilterChange={setSeverityFilter}
                        activeIssueId={activeIssueId}
                        highlightedIssueId={highlightedIssueId}
                        onIssueHover={setHighlightedIssueId}
                        onIssueClick={(id) => setActiveIssueId((prev) => (prev === id ? null : id))}
                      />
                    )}
                    {inspectorTab === "dom" && (
                      <DomMathTab domTelemetry={result.domTelemetry ?? null} colorPalette={result.colorPalette} />
                    )}
                    {inspectorTab === "export" && <ExportDiffTab result={result} previousResult={previousResult} mode={mode} />}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      <footer className="flex-shrink-0 border-t border-zinc-800/60 py-4 mt-auto">
        <div className="max-w-[1800px] mx-auto px-4 sm:px-6 flex items-center justify-between text-xs text-zinc-400">
          <span>PixelRoast Pro — deterministic DOM checks + AI vision review</span>
          <span className="flex items-center gap-1">
            <Clipboard className="w-3 h-3" aria-hidden />
            Paste a screenshot anywhere with Cmd+V
          </span>
        </div>
      </footer>

      <ToastContainer />
    </div>
  );
}
