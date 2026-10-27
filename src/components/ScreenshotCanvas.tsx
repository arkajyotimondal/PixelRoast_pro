"use client";

import { useState } from "react";
import { AuditIssue } from "@/lib/types";
import { Eye, EyeOff } from "lucide-react";

interface ScreenshotCanvasProps {
  imageDataUrl: string | null;
  issues: AuditIssue[];
  activeIssueId: number | null;
  onPinClick: (issueId: number) => void;
  onPinHover: (issueId: number | null) => void;
}

export default function ScreenshotCanvas({
  imageDataUrl,
  issues,
  activeIssueId,
  onPinClick,
  onPinHover,
}: ScreenshotCanvasProps) {
  const [showPins, setShowPins] = useState(true);
  // Only issues with a known position get a pin (measured markup issues have none yet).
  const placed = issues.filter((i) => i.coordinates !== null);

  const severityColor = (severity: string) => {
    switch (severity) {
      case "Critical":
        return { bg: "bg-red-500", border: "border-red-400", ring: "ring-red-500/40" };
      case "Warning":
        return { bg: "bg-amber-500", border: "border-amber-400", ring: "ring-amber-500/40" };
      case "Nitpick":
        return { bg: "bg-blue-500", border: "border-blue-400", ring: "ring-blue-500/40" };
      default:
        return { bg: "bg-zinc-500", border: "border-zinc-400", ring: "ring-zinc-500/40" };
    }
  };

  if (!imageDataUrl) return null;

  return (
    <div className="relative">
      {/* Toggle */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
          Annotated Preview
          {issues.length > placed.length && (
            <span className="ml-2 normal-case tracking-normal text-[10px] text-zinc-400">
              {issues.length - placed.length} issue(s) without a pin
            </span>
          )}
        </span>
        {placed.length > 0 && (
          <button
            onClick={() => setShowPins(!showPins)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium
              bg-zinc-800/60 border border-zinc-700/50 text-zinc-400 
              hover:text-zinc-200 hover:border-zinc-600 transition-all duration-200"
          >
            {showPins ? (
              <EyeOff className="w-3 h-3" />
            ) : (
              <Eye className="w-3 h-3" />
            )}
            {showPins ? "Hide" : "Show"} Pins
          </button>
        )}
      </div>

      {/* Image container */}
      {/* The container is sized by the image itself (w-full h-auto), so percentage
          positions map 1:1 onto the picture at any width — no letterboxing to correct for. */}
      <div
        className="relative rounded-xl overflow-hidden border border-zinc-800/80 bg-zinc-900/40"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- dynamic, owner-scoped API image; next/image adds nothing here */}
        <img
          src={imageDataUrl}
          alt="Screenshot being audited, with numbered issue pins"
          className="w-full h-auto block"
          draggable={false}
        />

        {/* Hotspot pins overlay */}
        {showPins &&
          placed.map((issue) => {
            const colors = severityColor(issue.severity);
            const isActive = activeIssueId === issue.id;

            return (
              <button
                key={issue.id}
                onClick={() => onPinClick(issue.id)}
                onMouseEnter={() => onPinHover(issue.id)}
                onMouseLeave={() => onPinHover(null)}
                className={`absolute z-10 flex items-center justify-center
                  w-7 h-7 rounded-full text-xs font-bold text-white
                  ${colors.bg} border-2 ${colors.border}
                  shadow-lg cursor-pointer
                  transition-all duration-200
                  -translate-x-1/2 -translate-y-1/2
                  ${isActive ? `scale-125 ring-4 ${colors.ring}` : "hover:scale-110"}
                  hotspot-pin`}
                style={{ left: `${issue.coordinates!.x}%`, top: `${issue.coordinates!.y}%` }}
                title={issue.title}
                aria-label={`Issue ${issue.id}: ${issue.title}`}
              >
                {issue.id}
              </button>
            );
          })}
      </div>
    </div>
  );
}
