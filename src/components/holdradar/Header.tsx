"use client";

import { Radar, Lock, Unlock, ScrollText, Crown } from "lucide-react";
import { motion } from "framer-motion";

export function Header({
  unlocked,
  onMethodology,
  onOwner,
  snapshotAgeHours,
}: {
  unlocked: boolean;
  onMethodology: () => void;
  onOwner: () => void;
  snapshotAgeHours: number | null;
}) {
  const fresh = snapshotAgeHours != null && snapshotAgeHours < 24;
  return (
    <motion.header
      initial={{ y: -24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#07090D]/80 backdrop-blur-xl"
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-400/10 ring-1 ring-emerald-400/30">
            <Radar className="h-5 w-5 text-emerald-300" strokeWidth={1.8} />
          </div>
          <div className="leading-tight">
            <div className="text-base font-extrabold tracking-tight">
              Hold<span className="text-emerald-300">Radar</span>
            </div>
            <div className="hidden text-[11px] text-zinc-500 sm:block">رادار ارزش برای هولدر</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium md:inline-flex ${
              fresh
                ? "border-emerald-400/25 bg-emerald-400/[0.07] text-emerald-300"
                : "border-white/10 bg-white/[0.04] text-zinc-400"
            }`}
          >
            <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${fresh ? "hr-pulse bg-emerald-400" : "bg-zinc-500"}`} />
            {snapshotAgeHours == null ? "در حال آماده‌سازی داده" : fresh ? "اسنپ‌شات روزانه آماده" : `اسنپ‌شات ${snapshotAgeHours}h قبل`}
          </span>

          <button
            onClick={onMethodology}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-white/20 hover:bg-white/[0.06] hover:text-white"
          >
            <ScrollText className="h-3.5 w-3.5" />
            روش‌شناسی
          </button>

          {!unlocked && (
            <button
              onClick={onOwner}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300/25 bg-amber-300/[0.06] px-3 py-1.5 text-xs font-medium text-amber-200/90 transition hover:border-amber-300/40 hover:bg-amber-300/10"
            >
              <Crown className="h-3.5 w-3.5" />
              ورود مالک
            </button>
          )}

          <span
            className={`inline-flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-semibold ${
              unlocked
                ? "bg-emerald-400/10 text-emerald-300 ring-1 ring-emerald-400/30"
                : "bg-white/[0.05] text-zinc-400 ring-1 ring-white/10"
            }`}
            title={unlocked ? "نشست فعال" : "قفل"}
          >
            {unlocked ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
            {unlocked ? "باز" : "قفل"}
          </span>
        </div>
      </div>
    </motion.header>
  );
}
