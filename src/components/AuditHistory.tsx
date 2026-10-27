"use client";

import { AuditResult } from "@/lib/types";
import { Clock, Trash2, RefreshCw, Loader2, Flame, Accessibility, TrendingUp } from "lucide-react";

interface AuditHistoryProps {
  audits: AuditResult[];
  isLoading: boolean;
  onSelect: (audit: AuditResult) => void;
  onDelete: (id: string) => void;
  onRefresh: () => void;
}

export default function AuditHistory({
  audits,
  isLoading,
  onSelect,
  onDelete,
  onRefresh,
}: AuditHistoryProps) {
  const modeIcon = { roast: Flame, accessibility: Accessibility, conversion: TrendingUp };

  const scoreColor = (score: number | null) => {
    if (score === null) return "text-zinc-400";
    if (score < 50) return "text-red-400";
    if (score < 80) return "text-amber-400";
    return "text-emerald-400";
  };

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Clock className="w-3.5 h-3.5 text-zinc-400" />
          <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
            Audit History
          </span>
          {audits.length > 0 && (
            <span className="text-[10px] font-mono text-zinc-400">
              ({audits.length})
            </span>
          )}
        </div>
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium
            text-zinc-400 hover:text-zinc-300 hover:bg-zinc-800/40 transition-all
            disabled:opacity-40"
        >
          {isLoading ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <RefreshCw className="w-3 h-3" />
          )}
          Refresh
        </button>
      </div>

      {audits.length === 0 && !isLoading && (
        <div className="text-center py-6 text-zinc-400 text-xs">
          No audits saved yet. Run your first audit!
        </div>
      )}

      {isLoading && audits.length === 0 && (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-14 rounded-lg shimmer" />
          ))}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        {audits.map((audit) => (
          <div
            key={audit._id}
            className="group flex items-center gap-3 w-full px-3 py-2.5 rounded-lg
              bg-zinc-900/40 border border-zinc-800/60 
              hover:border-zinc-700/80 hover:bg-zinc-800/40
              transition-all duration-200"
          >
            {/* Click to load */}
            <button
              onClick={() => onSelect(audit)}
              className="flex-1 flex items-center gap-3 text-left min-w-0"
            >
              {/* Mode + Score */}
              <div className="flex items-center gap-1.5">
                {(() => {
                  const Icon = modeIcon[audit.mode] ?? Flame;
                  return <Icon className="w-3.5 h-3.5 text-zinc-400" aria-label={audit.mode} />;
                })()}
                <span
                  className={`text-xs font-mono font-bold ${scoreColor(audit.overallScore)}`}
                >
                  {audit.overallScore ?? "—"}
                </span>
                <span className="text-zinc-400 text-[10px]">/ 100</span>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-medium text-zinc-300 truncate">
                  {audit.title || "Untitled"}
                </p>
                <p className="text-[10px] text-zinc-400 truncate">
                  {audit.summary?.slice(0, 80)}
                </p>
              </div>

              {/* Timestamp */}
              <span className="flex-shrink-0 text-[10px] text-zinc-400 font-mono">
                {audit.createdAt ? formatTimeAgo(new Date(audit.createdAt).getTime()) : ""}
              </span>
            </button>

            {/* Delete */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (audit._id) onDelete(audit._id);
              }}
              aria-label={`Delete audit ${audit.title}`}
              className="flex-shrink-0 opacity-60 group-hover:opacity-100 focus-visible:opacity-100 p-1 rounded
                text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-all"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}
