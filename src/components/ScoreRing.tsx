"use client";

/** Traffic-light colour for a 0–100 score; grey when not assessed. */
function scoreColor(score: number | null): string {
  if (score === null) return "#71717a";
  if (score < 50) return "#ef4444";
  if (score < 80) return "#f59e0b";
  return "#10b981";
}

interface ScoreRingProps {
  /** null = nothing could be assessed */
  score: number | null;
  size?: number;
  strokeWidth?: number;
  label?: string;
}

export default function ScoreRing({
  score,
  size = 180,
  strokeWidth = 10,
  label = "UX Score",
}: ScoreRingProps) {
  const color = scoreColor(score);

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - ((score ?? 0) / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          {/* Background ring */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="rgba(63, 63, 70, 0.4)"
            strokeWidth={strokeWidth}
          />
          {/* Animated score ring */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference}
            className="score-ring-animated"
            style={
              {
                "--ring-circumference": circumference,
                "--ring-offset": offset,
              } as React.CSSProperties
            }
          />
        </svg>
        {/* Score number centered */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="font-mono font-bold tracking-tight"
            style={{ fontSize: size * 0.28, color }}
          >
            {score ?? "—"}
          </span>
          <span
            className="text-zinc-400 font-medium"
            style={{ fontSize: size * 0.08 }}
          >
            {score === null ? "not assessed" : "/ 100"}
          </span>
        </div>
      </div>
      <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
        {label}
      </span>
    </div>
  );
}

interface MiniScoreBarProps {
  label: string;
  score: number | null;
}

export function MiniScoreBar({ label, score }: MiniScoreBarProps) {
  const color = score === null ? "bg-zinc-600" : score < 50 ? "bg-red-500" : score < 80 ? "bg-amber-500" : "bg-emerald-500";
  const textColor =
    score === null ? "text-zinc-400" : score < 50 ? "text-red-400" : score < 80 ? "text-amber-400" : "text-emerald-400";

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-300">{label}</span>
        <span className={`text-xs font-mono font-bold ${textColor}`}>{score ?? "not assessed"}</span>
      </div>
      <div
        className="h-1.5 rounded-full bg-zinc-800/60 overflow-hidden"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={score ?? undefined}
      >
        <div className={`h-full rounded-full ${color} progress-bar-animated`} style={{ width: `${score ?? 0}%` }} />
      </div>
    </div>
  );
}
