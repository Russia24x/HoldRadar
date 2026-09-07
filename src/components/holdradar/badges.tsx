"use client";

import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, Sparkles, Minus } from "lucide-react";

/** Rank-change badge vs yesterday (↑ improved / ↓ dropped / ✦ new / – unchanged). */
export function RankDelta({ change, isNew }: { change: number | null; isNew: boolean }) {
  if (isNew) {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full border border-amber-300/25 bg-amber-300/[0.08] px-1.5 py-0.5 text-[9px] font-bold text-amber-200">
        <Sparkles className="h-2.5 w-2.5" /> جدید
      </span>
    );
  }
  if (change == null || change === 0) {
    return (
      <span
        title="بدون تغییر نسبت به اسنپ‌شات قبل"
        className="hidden items-center gap-0.5 rounded-full border border-white/[0.07] bg-white/[0.02] px-1.5 py-0.5 text-[9px] font-semibold text-zinc-500 sm:inline-flex"
      >
        <Minus className="h-2.5 w-2.5" /> ثابت
      </span>
    );
  }
  const up = change > 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${
        up
          ? "border border-emerald-400/25 bg-emerald-400/[0.08] text-emerald-300"
          : "border border-red-400/25 bg-red-400/[0.07] text-red-300/90"
      }`}
      title={up ? `${change} رتبه صعود نسبت به دیروز` : `${Math.abs(change)} رتبه نزول نسبت به دیروز`}
    >
      {up ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
      <span className="hr-num">{up ? "+" : ""}{change}</span>
    </span>
  );
}

/** Live ticking countdown; warns when the session is about to expire. */
export function LiveCountdown({ expiresAt, prefix = "" }: { expiresAt: number; prefix?: string }) {
  const [msLeft, setMsLeft] = useState(() => expiresAt - Date.now());

  useEffect(() => {
    const t = setInterval(() => setMsLeft(expiresAt - Date.now()), 30_000);
    return () => clearInterval(t);
  }, [expiresAt]);

  if (msLeft <= 0) return <span className="text-red-300">{prefix}منقضی شد</span>;
  const h = Math.floor(msLeft / 3600_000);
  const m = Math.floor((msLeft % 3600_000) / 60_000);
  const critical = msLeft < 60 * 60_000;
  return (
    <span className={critical ? "font-bold text-amber-300" : ""}>
      {prefix}
      <span className="hr-num">{h}</span> ساعت و <span className="hr-num">{m}</span> دقیقه
      {critical && " — به‌زودی منقضی می‌شود"}
    </span>
  );
}

/** Colored 90-day price change chip. */
export function Change90Chip({ value }: { value: number | null }) {
  if (value == null || !Number.isFinite(value)) {
    return <span className="text-[10px] text-zinc-600">—</span>;
  }
  const up = value >= 0;
  return (
    <span
      className={`hr-num inline-flex items-center gap-0.5 text-[10px] font-semibold ${
        up ? "text-emerald-300/90" : "text-red-300/90"
      }`}
    >
      {up ? "▲" : "▼"} {Math.abs(value).toFixed(0)}%
    </span>
  );
}
