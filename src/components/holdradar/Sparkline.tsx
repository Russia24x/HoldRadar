"use client";

import { useId } from "react";

/**
 * Dependency-free SVG sparkline for score trends.
 * Time axis is LTR (chart convention) regardless of page RTL.
 * `positive` colors the line emerald (last >= first), otherwise warm amber-red.
 */
export function Sparkline({
  points,
  width = 120,
  height = 36,
  strokeWidth = 2,
  showArea = true,
  responsive = false,
  className = "",
}: {
  points: number[];
  width?: number;
  height?: number;
  strokeWidth?: number;
  showArea?: boolean;
  responsive?: boolean;
  className?: string;
}) {
  const gid = useId().replace(/[:]/g, "");
  if (points.length < 2) {
    return (
      <div
        dir="ltr"
        className={`flex items-center justify-center text-[10px] text-zinc-600 ${className}`}
        style={{ width: responsive ? "100%" : width, height }}
        title="برای رسم روند، حداقل دو روز داده لازم است"
      >
        روند در حال جمع‌آوری…
      </div>
    );
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const pad = strokeWidth + 2;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;

  const xy = points.map((p, i) => {
    const x = pad + (i / (points.length - 1)) * innerW;
    const y = pad + innerH - ((p - min) / span) * innerH;
    return [x, y] as const;
  });

  const line = xy.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${xy[xy.length - 1]![0].toFixed(1)},${(height - pad).toFixed(1)} L${xy[0]![0].toFixed(1)},${(height - pad).toFixed(1)} Z`;

  const rising = points[points.length - 1]! >= points[0]!;
  const stroke = rising ? "#00d28c" : "#f0b13c";
  const [lastX, lastY] = xy[xy.length - 1]!;

  return (
    <div
      dir="ltr"
      className={`relative ${responsive ? "w-full" : ""} ${className}`}
      style={responsive ? { maxWidth: width, height } : { width, height }}
    >
      <svg
        width={responsive ? "100%" : width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="روند امتیاز"
        className={responsive ? "h-auto w-full" : ""}
      >
        <defs>
          <linearGradient id={`hr-spark-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        {showArea && <path d={area} fill={`url(#hr-spark-${gid})`} />}
        <path d={line} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <circle cx={lastX} cy={lastY} r={strokeWidth + 1.2} fill={stroke} className="hr-spark-dot" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}

/** Compact stats around a trend series (Δ score, min/max, days). */
export function trendStats(points: { d: string; s: number }[]) {
  if (points.length < 2) return null;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const scores = points.map((p) => p.s);
  return {
    days: points.length,
    delta: Math.round((last.s - first.s) * 10) / 10,
    firstDate: first.d,
    lastDate: last.d,
    min: Math.min(...scores),
    max: Math.max(...scores),
  };
}
