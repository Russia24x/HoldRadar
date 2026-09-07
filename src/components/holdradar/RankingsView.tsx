"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown,
  Search,
  Trophy,
  Database,
  TrendingUp,
  Flame,
  ShieldCheck,
  Scale,
  Layers,
  Coins,
  ExternalLink,
  Lock,
  RefreshCw,
  Share2,
  ChartColumn as ChartIcon,
  Archive,
  FileSpreadsheet,
  FileJson,
  Crown,
  LineChart,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { fmtCompactUsd, fmtPct, fmtPrice, fmtFaDateTime, fmtNum } from "./format";
import { RankDelta, LiveCountdown, Change90Chip } from "./badges";
import { Sparkline, trendStats } from "./Sparkline";
import { HistoryDialog } from "./HistoryDialog";
import type { RankingsResponse, RankRow, HistoryResponse, TrendPoint } from "./types";

const CRITERIA_META: Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  realYield: { label: "بازده واقعی هولدر", icon: TrendingUp },
  scarcity: { label: "کمیابی و انتشار", icon: Scale },
  holderShare: { label: "بازخرید و سهم هولدر", icon: Flame },
  maturity: { label: "ذخیرهٔ ارزش و بلوغ", icon: ShieldCheck },
  ecosystem: { label: "اندازه و رشد اکوسیستم", icon: Layers },
};

const MEDALS = [
  { ring: "ring-amber-300/40", text: "text-amber-300", bg: "bg-amber-300/10", label: "۱" },
  { ring: "ring-zinc-300/30", text: "text-zinc-300", bg: "bg-zinc-300/10", label: "۲" },
  { ring: "ring-orange-400/30", text: "text-orange-300", bg: "bg-orange-400/10", label: "۳" },
];

/** generic client-side file download (Blob → anchor → revoke) */
function downloadBlob(name: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

function SubScoreDots({ row }: { row: RankRow }) {
  const keys = Object.keys(CRITERIA_META);
  return (
    <div className="flex items-end gap-1" title="پنج زیرمعیار (۰ تا ۱۰۰)">
      {keys.map((k) => {
        const s = row.sub[k];
        const h = s ? Math.max(3, (s.score / 100) * 18) : 3;
        return (
          <div key={k} className="flex w-1.5 flex-col items-center gap-1">
            <div
              className={`w-1.5 rounded-full ${s ? "hr-score-bar" : "bg-white/10"}`}
              style={{ height: `${h}px`, opacity: s ? 0.9 : 0.5 }}
            />
          </div>
        );
      })}
    </div>
  );
}

function ScoreBar({ value, className = "" }: { value: number; className?: string }) {
  return (
    <div className={`h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06] ${className}`}>
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${Math.max(2, Math.min(100, value))}%` }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="hr-score-bar h-full rounded-full"
      />
    </div>
  );
}

function TopPodium({ rows, trends }: { rows: RankRow[]; trends?: Record<string, TrendPoint[]> }) {
  const top = rows.slice(0, 3);
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {top.map((r, i) => {
        const m = MEDALS[i]!;
        const trend = trends?.[r.id]?.map((p) => p.s);
        return (
          <motion.div
            key={r.id}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.12, duration: 0.5 }}
            className={`hr-card relative overflow-hidden rounded-2xl p-5 ring-1 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_40px_-12px_rgba(0,210,140,0.28)] ${m.ring}`}
          >
            <div className={`absolute inset-x-0 top-0 h-[2px] ${m.bg}`} />
            {i === 0 && (
              <>
                <div className="pointer-events-none absolute -inset-x-8 -top-8 h-24 bg-gradient-to-b from-amber-300/[0.07] to-transparent blur-xl" />
                <div className="pointer-events-none absolute inset-0 overflow-hidden">
                  <div className="hr-shine" />
                </div>
                <Crown className="absolute left-4 top-4 h-4 w-4 text-amber-300/60" />
              </>
            )}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                {r.image ? (
                  <img src={r.image} alt={r.name} className="h-10 w-10 rounded-full ring-1 ring-white/10" />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5"><Coins className="h-5 w-5 text-zinc-500" /></div>
                )}
                <div>
                  <div className="text-sm font-bold">{r.name}</div>
                  <div className="text-[11px] uppercase text-zinc-500">{r.symbol}</div>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-black ${m.bg} ${m.text}`}>{m.label}</div>
                <RankDelta change={r.rankChange} isNew={r.prevRank == null} />
              </div>
            </div>
            <div className="mt-4 flex items-end justify-between">
              <div>
                <div className="text-[10px] text-zinc-500">امتیاز ارزش برای هولدر</div>
                <div className={`hr-num text-3xl font-black tracking-tight ${i === 0 ? "hr-grad-text" : "text-zinc-50"}`}>{r.composite.toFixed(1)}</div>
              </div>
              <Trophy className={`h-5 w-5 ${m.text} opacity-70`} />
            </div>
            <ScoreBar value={r.composite} className="mt-3" />
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-white/[0.03] px-2 py-1.5 transition-colors hover:bg-white/[0.06]">
                <div className="text-[9px] text-zinc-500">بازده سالانه</div>
                <div className="hr-num text-[11px] font-bold text-emerald-300">{r.holderYieldAnnual != null ? (r.holderYieldAnnual * 100).toFixed(1) + "%" : "—"}</div>
              </div>
              <div className="rounded-lg bg-white/[0.03] px-2 py-1.5 transition-colors hover:bg-white/[0.06]">
                <div className="text-[9px] text-zinc-500">سهم هولدر</div>
                <div className="hr-num text-[11px] font-bold text-amber-200">{r.holderShare != null ? (r.holderShare * 100).toFixed(0) + "%" : "—"}</div>
              </div>
              <div className="rounded-lg bg-white/[0.03] px-2 py-1.5 transition-colors hover:bg-white/[0.06]">
                <div className="text-[9px] text-zinc-500">TVL</div>
                <div className="hr-num text-[11px] font-bold text-zinc-200">{fmtCompactUsd(r.tvl)}</div>
              </div>
            </div>
            {trend && trend.length >= 2 && (
              <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/[0.05] pt-3">
                <span className="text-[9px] text-zinc-600">روند {trend.length} روزه</span>
                <Sparkline points={trend} width={92} height={26} strokeWidth={1.8} />
              </div>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}

function RowDetail({ row, trend }: { row: RankRow; trend?: TrendPoint[] }) {
  const keys = Object.keys(CRITERIA_META);
  const stats = trendStats(trend ?? []);
  return (
    <div className="grid grid-cols-1 gap-6 border-t border-white/[0.06] bg-black/20 px-4 py-6 sm:px-8 lg:grid-cols-2">
      {/* score trend across archived days */}
      {stats && (
        <div className="lg:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-zinc-300">
              <LineChart className="h-4 w-4 text-emerald-300" /> روند امتیاز کل ({stats.days} روز آرشیو)
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
              <span className={`hr-num rounded-md px-2 py-1 font-bold ${stats.delta >= 0 ? "bg-emerald-400/10 text-emerald-300" : "bg-amber-400/10 text-amber-300"}`}>
                {stats.delta >= 0 ? "+" : ""}{stats.delta.toFixed(1)} از {stats.firstDate}
              </span>
              <span className="hr-num rounded-md bg-white/[0.04] px-2 py-1 text-zinc-500">کمینه {stats.min.toFixed(1)}</span>
              <span className="hr-num rounded-md bg-white/[0.04] px-2 py-1 text-zinc-500">بیشینه {stats.max.toFixed(1)}</span>
            </div>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-black/25 px-3 py-2">
            <Sparkline points={(trend ?? []).map((p) => p.s)} width={640} height={52} responsive />
          </div>
        </div>
      )}

      {/* subscores */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2 text-xs font-bold text-zinc-300">
          <ChartIcon className="h-4 w-4 text-emerald-300" /> زیرمعیارها (۰ تا ۱۰۰)
        </div>
        {keys.map((k) => {
          const s = row.sub[k];
          const meta = CRITERIA_META[k]!;
          const w = row.effectiveWeights[k];
          return (
            <div key={k} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="flex items-center gap-1.5 text-zinc-400">
                  <meta.icon className="h-3.5 w-3.5 text-zinc-500" />
                  {meta.label}
                  {w != null && <span className="text-zinc-600">({Math.round(w * 100)}٪)</span>}
                </span>
                <span className="hr-num font-bold text-zinc-200">{s ? s.score.toFixed(0) : "داده‌ای نیست"}</span>
              </div>
              <ScoreBar value={s?.score ?? 0} />
              {s?.note && <div className="text-[10px] text-zinc-600">{s.note}</div>}
            </div>
          );
        })}
      </div>

      {/* raw metrics */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 text-xs font-bold text-zinc-300">
          <Database className="h-4 w-4 text-emerald-300" /> داده‌های خام
        </div>
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          {[
            ["قیمت", fmtPrice(row.price)],
            ["ارزش بازار", fmtCompactUsd(row.marketCap)],
            ["رتبهٔ بازار", row.marketCapRank != null ? "#" + row.marketCapRank : "—"],
            ["FDV", fmtCompactUsd(row.fdv)],
            ["بازده سالانهٔ هولدر", row.holderYieldAnnual != null ? (row.holderYieldAnnual * 100).toFixed(2) + "%" : "—"],
            ["سهم هولدر از درآمد", row.holderShare != null ? (row.holderShare * 100).toFixed(1) + "%" : "—"],
            ["نسبت عرضهٔ در گردش", row.circRatio != null ? (row.circRatio * 100).toFixed(1) + "%" : "—"],
            ["نسبت MCap/FDV", row.mcapFdvRatio != null ? (row.mcapFdvRatio * 100).toFixed(1) + "%" : "—"],
            ["تغییر قیمت ۹۰روزه", fmtPct(row.priceChange90d, 1)],
            ["TVL", fmtCompactUsd(row.tvl)],
            ["رشد TVL", row.tvlGrowth30d != null ? fmtPct(row.tvlGrowth30d, 1) : "—"],
            ["رتبهٔ دیروز", row.prevRank != null ? "#" + row.prevRank : "جدید"],
            ["عرضهٔ در گردش", row.circulatingSupply != null ? fmtNum(row.circulatingSupply) : "—"],
          ].map(([label, val]) => (
            <div key={label as string} className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2 transition-colors hover:bg-white/[0.055]">
              <span className="text-zinc-500">{label}</span>
              <span className="hr-num font-semibold text-zinc-200">{val}</span>
            </div>
          ))}
        </div>
        <a
          href={`https://www.coingecko.com/en/coins/${row.id}`}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-flex w-fit items-center gap-1.5 text-[11px] text-emerald-300/80 transition hover:text-emerald-300"
        >
          مشاهده در CoinGecko <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}

function RankItem({ row, index, trend }: { row: RankRow; index: number; trend?: TrendPoint[] }) {
  const [open, setOpen] = useState(false);
  const medal = index < 3 ? MEDALS[index] : null;
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.4) }}
      className={`hr-card overflow-hidden rounded-xl transition-all duration-200 hover:border-emerald-400/15 ${open ? "border-emerald-400/20 shadow-[0_8px_30px_-14px_rgba(0,210,140,0.2)]" : ""}`}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="group flex w-full items-center gap-2 px-3 py-3 text-right outline-none transition hover:bg-emerald-400/[0.03] focus-visible:ring-2 focus-visible:ring-emerald-400/40 sm:gap-3 sm:px-5"
      >
        <div className="flex shrink-0 flex-col items-center gap-1">
          <div className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-black ${medal ? medal.bg + " " + medal.text : "bg-white/[0.05] text-zinc-500"} transition-transform duration-200 group-hover:scale-110`}>
            <span className="hr-num">{row.rank}</span>
          </div>
          <RankDelta change={row.rankChange} isNew={row.prevRank == null} />
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-3">
          {row.image ? (
            <img src={row.image} alt={row.name} className="h-8 w-8 shrink-0 rounded-full ring-1 ring-white/10 transition-transform duration-200 group-hover:scale-105" />
          ) : (
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/5"><Coins className="h-4 w-4 text-zinc-500" /></div>
          )}
          <div className="min-w-0">
            <div className="truncate text-sm font-bold transition-colors group-hover:text-emerald-50">{row.name}</div>
            <div className="text-[10px] uppercase tracking-wide text-zinc-500">{row.symbol}</div>
          </div>
        </div>

        <div className="hidden w-24 shrink-0 items-center md:flex">
          <div className="w-full">
            <div className="mb-1 flex justify-between text-[9px] text-zinc-500"><span>بازده</span><span className="hr-num">{row.holderYieldAnnual != null ? (row.holderYieldAnnual * 100).toFixed(1) + "%" : "—"}</span></div>
            <ScoreBar value={row.sub.realYield?.score ?? 0} />
          </div>
        </div>

        <div className="hidden w-20 shrink-0 text-left lg:block">
          <div className="text-[9px] text-zinc-500">قیمت</div>
          <div className="hr-num text-[11px] font-semibold text-zinc-300">{fmtPrice(row.price)}</div>
        </div>
        <div className="hidden w-20 shrink-0 text-left lg:block">
          <div className="text-[9px] text-zinc-500">ارزش بازار</div>
          <div className="hr-num text-[11px] font-semibold text-zinc-300">{fmtCompactUsd(row.marketCap)}</div>
        </div>

        <div className="hidden w-16 shrink-0 text-left lg:block">
          <div className="text-[9px] text-zinc-500">۹۰روزه</div>
          <Change90Chip value={row.priceChange90d} />
        </div>

        <div className="hidden shrink-0 sm:block"><SubScoreDots row={row} /></div>

        <div className="flex shrink-0 items-center gap-2">
          <div className="text-left">
            <div className={`hr-num text-lg font-black tracking-tight ${medal ? "hr-grad-text" : "text-zinc-50"}`}>{row.composite.toFixed(1)}</div>
          </div>
          <ChevronDown className={`h-4 w-4 text-zinc-600 transition-transform duration-300 ${open ? "rotate-180 text-emerald-300" : ""}`} />
        </div>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="detail"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <RowDetail row={row} trend={trend} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export function RankingsView({
  data,
  onMethodology,
}: {
  data: RankingsResponse;
  onMethodology: () => void;
}) {
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState("composite");
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);

  // load the score-history archive (silent-fail: sparklines are optional sugar)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/history", { cache: "no-store" });
        if (!res.ok) return;
        const j = (await res.json()) as HistoryResponse;
        if (!cancelled) setHistory(j);
      } catch {
        /* optional feature — ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // "/" focuses search (standard data-table UX)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (e.key === "/" && !typing) {
        e.preventDefault();
        document.getElementById("hr-search")?.focus();
      }
      if (e.key === "Escape" && target?.id === "hr-search") (target as HTMLInputElement).blur();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /** share a compact Persian text summary of today's top-25 */
  async function shareTop() {
    const lines = data.rows.slice(0, 25).map((r) => `${r.rank}. ${r.name} (${r.symbol}) — ${r.composite.toFixed(1)}`);
    const text =
      `🛰 HoldRadar — ۲۵ دارایی برتر «امتیاز ارزش برای هولدر»\n` +
      `📅 ${fmtFaDateTime(data.computedAt)}\n\n` +
      lines.join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "خلاصهٔ رتبه‌بندی کپی شد", description: "می‌توانید در هر جایی paste کنید." });
    } catch {
      toast({ title: "کپی ناموفق بود", variant: "destructive" });
    }
  }

  /** UTF-8-BOM CSV of today's top-25 (Excel-friendly, Persian headers) */
  function exportCsv() {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const header = ["رتبه", "نام", "نماد", "امتیاز هولدرادار", "بازده سالانه هولدر", "سهم هولدر", "نسبت عرضه در گردش", "قیمت (USD)", "ارزش بازار (USD)", "TVL (USD)", "تغییر ۹۰روزه (%)", "رتبهٔ دیروز", "تغییر رتبه"];
    const lines = data.rows.slice(0, 25).map((r) =>
      [
        r.rank,
        r.name,
        r.symbol,
        r.composite.toFixed(1),
        r.holderYieldAnnual != null ? (r.holderYieldAnnual * 100).toFixed(2) : "",
        r.holderShare != null ? (r.holderShare * 100).toFixed(1) : "",
        r.circRatio != null ? (r.circRatio * 100).toFixed(1) : "",
        r.price != null ? r.price : "",
        r.marketCap != null ? r.marketCap : "",
        r.tvl != null ? r.tvl : "",
        r.priceChange90d != null ? r.priceChange90d : "",
        r.prevRank ?? "جدید",
        r.rankChange != null ? (r.rankChange > 0 ? "+" + r.rankChange : String(r.rankChange)) : "",
      ]
        .map(esc)
        .join(",")
    );
    const csv = "\uFEFF" + header.map(esc).join(",") + "\n" + lines.join("\n");
    downloadBlob(`holdradar-${data.date}.csv`, csv, "text/csv;charset=utf-8");
    toast({ title: "فایل CSV دانلود شد", description: `holdradar-${data.date}.csv` });
  }

  /** raw JSON export of today's top-25 with formula metadata */
  function exportJson() {
    const payload = {
      site: "HoldRadar",
      date: data.date,
      computedAt: data.computedAt,
      poolSize: data.poolSize,
      weights: data.weights,
      coverage: data.coverage,
      rows: data.rows.slice(0, 25).map(({ sub, ...rest }) => ({
        ...rest,
        subScores: Object.fromEntries(Object.entries(sub).map(([k, v]) => [k, v?.score ?? null])),
      })),
    };
    downloadBlob(`holdradar-${data.date}.json`, JSON.stringify(payload, null, 2), "application/json");
    toast({ title: "فایل JSON دانلود شد", description: `holdradar-${data.date}.json` });
  }

  const rows = useMemo(() => {
    let r = [...data.rows];
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      r = r.filter((x) => x.name.toLowerCase().includes(q) || x.symbol.toLowerCase().includes(q));
    }
    const val = (x: RankRow): number => {
      switch (sortBy) {
        case "realYield": return x.sub.realYield?.score ?? -1;
        case "holderShare": return x.sub.holderShare?.score ?? -1;
        case "ecosystem": return x.sub.ecosystem?.score ?? -1;
        case "maturity": return x.sub.maturity?.score ?? -1;
        case "marketCap": return x.marketCap ?? -1;
        case "yield": return x.holderYieldAnnual ?? -1;
        default: return x.composite;
      }
    };
    return r.sort((a, b) => val(b) - val(a));
  }, [data.rows, query, sortBy]);

  const metaBtn =
    "inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] text-zinc-400 transition-all duration-200 hover:border-emerald-400/30 hover:bg-emerald-400/[0.05] hover:text-emerald-300 active:scale-95";

  return (
    <motion.section initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      {/* meta strip */}
      <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-zinc-500">
          <span className="flex items-center gap-1.5 text-zinc-300"><RefreshCw className="h-3.5 w-3.5 text-emerald-300" /> {fmtFaDateTime(data.computedAt)}</span>
          <span className="flex items-center gap-1.5"><Database className="h-3 w-3" /> جامعهٔ نامزدها: <span className="hr-num text-zinc-300">{data.poolSize}</span> دارایی</span>
          {data.prevDate && (
            <span className="flex items-center gap-1.5" title={`تغییر رتبه‌ها نسبت به اسنپ‌شات ${data.prevDate} محاسبه شده`}>
              <TrendingUp className="h-3 w-3" /> مقایسه با: <span className="hr-num text-zinc-300" dir="ltr">{data.prevDate}</span>
            </span>
          )}
          {history && history.days > 1 && (
            <span className="flex items-center gap-1.5">
              <Archive className="h-3 w-3" /> آرشیو: <span className="hr-num text-zinc-300">{history.days}</span> روز
            </span>
          )}
          <span className="flex items-center gap-1.5"><Lock className="h-3 w-3" /> نشست فعال: <LiveCountdown expiresAt={data.sessionExpiresAt} /></span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={shareTop} className={metaBtn} title="کپی خلاصهٔ متنی در کلیپ‌بورد">
            <Share2 className="h-3 w-3" /> اشتراک‌گذاری
          </button>
          <button onClick={exportCsv} className={metaBtn} title="دانلود CSV برای اکسل">
            <FileSpreadsheet className="h-3 w-3" /> CSV
          </button>
          <button onClick={exportJson} className={metaBtn} title="دانلود JSON خام">
            <FileJson className="h-3 w-3" /> JSON
          </button>
          <button onClick={() => setArchiveOpen(true)} className={metaBtn} title="رتبه‌بندی روزهای گذشته">
            <Archive className="h-3 w-3" /> آرشیو
          </button>
          <button onClick={onMethodology} className={metaBtn}>
            روش‌شناسی و فرمول امتیاز
          </button>
        </div>
      </div>

      <TopPodium rows={data.rows} trends={history?.trends} />

      {/* controls */}
      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600 transition-colors peer-focus:text-emerald-300" />
          <Input
            id="hr-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="جست‌وجو در نام یا نماد… (کلید /)"
            className="peer h-10 border-white/10 bg-black/25 pr-9 text-xs transition-all duration-200 focus-visible:border-emerald-400/40 focus-visible:shadow-[0_0_0_3px_rgba(0,210,140,0.08)]"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              aria-label="پاک‌کردن جست‌وجو"
              className="absolute left-2.5 top-1/2 -translate-y-1/2 rounded-md px-1.5 py-0.5 text-[10px] text-zinc-500 transition hover:bg-white/5 hover:text-zinc-300"
            >
              پاک‌کردن
            </button>
          )}
        </div>
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="h-10 w-full border-white/10 bg-black/25 text-xs transition-colors hover:border-emerald-400/20 sm:w-48">
            <SelectValue placeholder="مرتب‌سازی" />
          </SelectTrigger>
          <SelectContent className="border-white/10 bg-[#0B0E14]">
            <SelectItem value="composite">امتیاز کل هولدرادار</SelectItem>
            <SelectItem value="yield">بازده واقعی (خام)</SelectItem>
            <SelectItem value="realYield">نمرهٔ بازده هولدر</SelectItem>
            <SelectItem value="holderShare">نمرهٔ بازخرید/سهم</SelectItem>
            <SelectItem value="ecosystem">نمرهٔ اکوسیستم</SelectItem>
            <SelectItem value="maturity">نمرهٔ بلوغ</SelectItem>
            <SelectItem value="marketCap">ارزش بازار</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* rows */}
      <div className="mt-4 flex flex-col gap-2">
        {rows.map((r) => (
          <RankItem key={r.id} row={r} index={data.rows.indexOf(r)} trend={history?.trends?.[r.id]} />
        ))}
        {rows.length === 0 && (
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-8 text-center text-xs text-zinc-500">
            نتیجه‌ای یافت نشد.
          </div>
        )}
      </div>

      {/* honest coverage note */}
      <div className="mt-8 flex items-start gap-2.5 rounded-2xl border border-amber-300/15 bg-amber-300/[0.03] p-4 text-[11px] leading-6 text-amber-200/70">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-300/70" />
        <span>
          پوشش داده‌ها صادقانه گزارش می‌شود: بازده هولدر برای <b className="text-amber-100">{data.coverage.realYield?.pct ?? 0}٪</b> از
          ردیف‌ها، سهم هولدر برای <b className="text-amber-100">{data.coverage.holderShare?.pct ?? 0}٪</b>، و اکوسیستم (TVL) برای{" "}
          <b className="text-amber-100">{data.coverage.ecosystem?.pct ?? 0}٪</b> از جامعهٔ نامزدها در دسترس بوده است؛ جایی که داده نبود، آن
          معیار برای آن ارز امتیاز صفر گرفته است — چون این شاخص به «داشتن مکانیک اثبات‌شدهٔ ارزش‌آفرینی برای هولدر»
          امتیاز می‌دهد؛ ناشناخته، خوب حساب نمی‌شود.
        </span>
      </div>

      <HistoryDialog open={archiveOpen} onOpenChange={setArchiveOpen} history={history} />
    </motion.section>
  );
}
