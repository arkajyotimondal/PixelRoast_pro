"use client";

import { AuditIssue, SeverityFilter } from "@/lib/types";
import { Copy, MapPin, Code, Eye, Ruler, Sparkles } from "lucide-react";
import { showToast } from "./ToastContainer";
import { useCallback, useEffect, useRef, useState } from "react";

// ─── Single Issue Card ───────────────────────────────────────────

interface IssueCardProps {
  issue: AuditIssue;
  isActive: boolean;
  isHighlighted: boolean;
  onHover: (id: number | null) => void;
  onClick: (id: number) => void;
}

function IssueCard({
  issue,
  isActive,
  isHighlighted,
  onHover,
  onClick,
}: IssueCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [showLive, setShowLive] = useState(false);

  useEffect(() => {
    if (isActive && ref.current) {
      ref.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [isActive]);

  const severityStyles = {
    Critical: "bg-red-500/15 text-red-400 border-red-500/30",
    Warning: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    Nitpick: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  };

  const copyCode = useCallback(() => {
    navigator.clipboard.writeText(issue.fixCode).then(() => {
      showToast("Code copied to clipboard!");
    });
  }, [issue.fixCode]);

  // Build the isolated iframe srcDoc with Tailwind CDN
  const iframeSrcDoc = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://cdn.tailwindcss.com"><\/script>
  <style>
    body { 
      display: flex; 
      align-items: center; 
      justify-content: center; 
      min-height: 100vh; 
      margin: 0; 
      padding: 16px;
      background: #18181b; 
      font-family: system-ui, -apple-system, sans-serif;
    }
  </style>
</head>
<body>
  ${issue.fixCode}
</body>
</html>`;

  return (
    <div
      ref={ref}
      id={`issue-card-${issue.id}`}
      onMouseEnter={() => onHover(issue.id)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onClick(issue.id)}
      className={`group rounded-xl border transition-all duration-300 cursor-pointer
        ${
          isActive
            ? "border-orange-500/50 bg-orange-500/5 shadow-lg shadow-orange-500/5"
            : isHighlighted
            ? "border-zinc-700/80 bg-zinc-800/40 highlight-flash"
            : "border-zinc-800/80 bg-zinc-900/60 hover:border-zinc-700/80 hover:bg-zinc-800/40"
        }`}
    >
      {/* Header */}
      <div className="px-4 pt-4 pb-3 flex items-start gap-3">
        {/* Issue number */}
        <div
          className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center
          text-xs font-bold text-white
          ${issue.severity === "Critical" ? "bg-red-500" : issue.severity === "Warning" ? "bg-amber-500" : "bg-blue-500"}`}
        >
          {issue.id}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            {/* Severity badge */}
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider border ${severityStyles[issue.severity]}`}
            >
              {issue.severity}
            </span>

            {/* Category tag */}
            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium uppercase tracking-wider bg-zinc-800/80 text-zinc-300 border border-zinc-700/50">
              {issue.category}
            </span>

            {/* Evidence: was this measured by a rule, or estimated by the model? */}
            {issue.evidence === "measured" ? (
              <span
                title="Found by a deterministic rule over the page's markup — reproducible"
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider bg-emerald-500/10 text-emerald-300 border border-emerald-500/30"
              >
                <Ruler className="w-3 h-3" aria-hidden /> Measured
              </span>
            ) : (
              <span
                title="Estimated by the AI vision model — a judgement, not a measurement"
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider bg-violet-500/10 text-violet-300 border border-violet-500/30"
              >
                <Sparkles className="w-3 h-3" aria-hidden /> AI-estimated
              </span>
            )}
          </div>

          <h3 className="text-sm font-semibold text-zinc-100 leading-snug">
            {issue.title}
          </h3>
        </div>
      </div>

      {/* Heuristic */}
      <div className="px-4 pb-2">
        <span className="inline-flex items-center gap-1 text-[10px] font-mono font-medium text-zinc-400 bg-zinc-800/40 px-2 py-0.5 rounded">
          {issue.heuristic}
        </span>
      </div>

      {/* Location */}
      <div className="px-4 pb-2">
        <div className="flex items-center gap-1 text-xs text-zinc-400">
          <MapPin className="w-3 h-3 flex-shrink-0" aria-hidden />
          {issue.selector ? (
            <code className="font-mono text-zinc-300 break-all">{issue.selector}</code>
          ) : (
            <span>{issue.location}</span>
          )}
          {issue.count && issue.count > 1 ? <span className="text-zinc-400 ml-1">· {issue.count} elements</span> : null}
        </div>
      </div>

      {/* Problem */}
      <div className="px-4 pb-3">
        <p className="text-xs text-zinc-400 leading-relaxed">
          <span className="font-semibold text-zinc-300">Problem: </span>
          {issue.problem}
        </p>
      </div>

      {/* Recommendation */}
      <div className="px-4 pb-3">
        <p className="text-xs text-zinc-400 leading-relaxed">
          <span className="font-semibold text-emerald-400">Fix: </span>
          {issue.recommendation}
        </p>
      </div>

      {/* Code / Live Preview Toggle */}
      {issue.fixCode && (
      <div className="px-4 pb-4">
        <div className="relative rounded-lg bg-zinc-950 border border-zinc-800/60 overflow-hidden">
          {/* Toggle Header */}
          <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-900/80 border-b border-zinc-800/60">
            <div className="flex items-center gap-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowLive(false);
                }}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-all
                  ${!showLive ? "text-orange-400 bg-orange-500/10" : "text-zinc-500 hover:text-zinc-300"}`}
              >
                <Code className="w-3 h-3" />
                View Code
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowLive(true);
                }}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-all
                  ${showLive ? "text-emerald-400 bg-emerald-500/10" : "text-zinc-500 hover:text-zinc-300"}`}
              >
                <Eye className="w-3 h-3" />
                Live Preview
              </button>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                copyCode();
              }}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium
                text-zinc-500 hover:text-orange-400 hover:bg-orange-500/10 transition-all"
            >
              <Copy className="w-3 h-3" />
              Copy
            </button>
          </div>

          {/* Code View */}
          {!showLive && (
            <pre className="px-3 py-2.5 overflow-x-auto code-block">
              <code className="text-[11px] font-mono leading-relaxed text-zinc-300">
                {issue.fixCode}
              </code>
            </pre>
          )}

          {/* Live Rendered Preview */}
          {showLive && (
            <div className="relative">
              <iframe
                srcDoc={iframeSrcDoc}
                title={`Live preview: ${issue.title}`}
                className="w-full border-0 rounded-b-lg bg-zinc-900"
                style={{ height: "160px" }}
                sandbox="allow-scripts"
              />
              <div className="absolute top-2 right-2">
                <span className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-widest bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  Live
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
      )}
    </div>
  );
}

// ─── Issue List with Filters ─────────────────────────────────────

interface IssueListProps {
  issues: AuditIssue[];
  severityFilter: SeverityFilter;
  onSeverityFilterChange: (filter: SeverityFilter) => void;
  activeIssueId: number | null;
  highlightedIssueId: number | null;
  onIssueHover: (id: number | null) => void;
  onIssueClick: (id: number) => void;
}

export default function IssueList({
  issues,
  severityFilter,
  onSeverityFilterChange,
  activeIssueId,
  highlightedIssueId,
  onIssueHover,
  onIssueClick,
}: IssueListProps) {
  const filteredIssues =
    severityFilter === "All"
      ? issues
      : issues.filter((i) => i.severity === severityFilter);

  const counts = {
    All: issues.length,
    Critical: issues.filter((i) => i.severity === "Critical").length,
    Warning: issues.filter((i) => i.severity === "Warning").length,
    Nitpick: issues.filter((i) => i.severity === "Nitpick").length,
  };

  const filterButtons: { label: SeverityFilter; style: string; activeStyle: string }[] = [
    {
      label: "All",
      style: "text-zinc-400 border-zinc-700/50",
      activeStyle: "text-zinc-100 bg-zinc-800 border-zinc-600",
    },
    {
      label: "Critical",
      style: "text-red-400/70 border-red-500/20",
      activeStyle: "text-red-300 bg-red-500/15 border-red-500/40",
    },
    {
      label: "Warning",
      style: "text-amber-400/70 border-amber-500/20",
      activeStyle: "text-amber-300 bg-amber-500/15 border-amber-500/40",
    },
    {
      label: "Nitpick",
      style: "text-blue-400/70 border-blue-500/20",
      activeStyle: "text-blue-300 bg-blue-500/15 border-blue-500/40",
    },
  ];

  return (
    <div>
      {/* Severity Filter Bar */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {filterButtons.map((btn) => (
          <button
            key={btn.label}
            onClick={() => onSeverityFilterChange(btn.label)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
              border transition-all duration-200
              ${severityFilter === btn.label ? btn.activeStyle : btn.style}
              hover:opacity-90`}
          >
            {btn.label}
            <span
              className={`inline-flex items-center justify-center min-w-[18px] h-[18px] 
                rounded-full text-[10px] font-bold px-1
                ${severityFilter === btn.label ? "bg-white/10" : "bg-zinc-800/60"}`}
            >
              {counts[btn.label]}
            </span>
          </button>
        ))}
      </div>

      {/* Issue Cards */}
      <div className="flex flex-col gap-3 stagger-children">
        {filteredIssues.map((issue) => (
          <IssueCard
            key={issue.id}
            issue={issue}
            isActive={activeIssueId === issue.id}
            isHighlighted={highlightedIssueId === issue.id}
            onHover={onIssueHover}
            onClick={onIssueClick}
          />
        ))}
        {filteredIssues.length === 0 && (
          <div className="text-center py-8 text-zinc-500 text-sm">
            No {severityFilter.toLowerCase()} issues found.
          </div>
        )}
      </div>
    </div>
  );
}
