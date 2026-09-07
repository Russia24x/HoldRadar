"use client";

import { motion } from "framer-motion";
import { Lock, ShieldCheck, Database, Coins, Zap, ChevronLeft, Crown } from "lucide-react";
import { fmtFaDateTime } from "./format";
import type { StatusResponse } from "./types";

/** Pre-payment lock screen (blueprint §4): zero ranking data here. */
export function LockHero({
  status,
  onUnlock,
  onOwner,
}: {
  status: StatusResponse | null;
  onUnlock: () => void;
  onOwner: () => void;
}) {
  const chains = status?.requirements.chains ?? [];

  return (
    <section className="hr-glow relative flex flex-1 flex-col items-center justify-center px-4 py-16 sm:py-24">
      {/* radar visual */}
      <div className="pointer-events-none absolute inset-x-0 top-10 mx-auto h-72 w-72 opacity-40" aria-hidden>
        <div className="absolute inset-0 rounded-full border border-emerald-400/20" />
        <div className="absolute inset-6 rounded-full border border-emerald-400/15" />
        <div className="absolute inset-12 rounded-full border border-emerald-400/10" />
        <div className="absolute inset-[4.5rem] rounded-full border border-emerald-400/[0.08]" />
        <div className="hr-scanline absolute inset-x-12 top-0 h-8 bg-gradient-to-b from-transparent via-emerald-400/25 to-transparent blur-[2px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: "easeOut" }}
        className="relative z-10 flex max-w-3xl flex-col items-center text-center"
      >
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-1.5 text-xs text-zinc-400">
          <Zap className="h-3.5 w-3.5 text-amber-300" />
          رتبه‌بندی روزانه، محاسبه‌شده از داده‌های زندهٔ CoinGecko و DefiLlama
        </div>

        <h1 className="text-4xl font-black leading-[1.15] tracking-tight sm:text-5xl lg:text-6xl">
          ارزش واقعی
          <span className="text-emerald-300"> برای هولدر</span>
          <br />
          <span className="text-zinc-400">در یک رادار.</span>
        </h1>

        <p className="mt-6 max-w-xl text-balance text-sm leading-7 text-zinc-400 sm:text-base sm:leading-8">
          هر روز ۲۵ دارایی برتر از میان ۳۰۰ ارز بزرگ بازار، با «امتیاز ارزش برای هولدر» رتبه‌بندی می‌شوند:
          بازدهٔ واقعی، کمیابی، بازخرید و سوزاندن، بلوغ بازار و sức اکوسیستم — همه از دادهٔ زنده، بدون عدد ساختگی.
        </p>

        {/* price card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.25, duration: 0.5 }}
          className="hr-card mt-10 w-full max-w-md rounded-2xl p-6 backdrop-blur-sm"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              <Lock className="h-3.5 w-3.5" />
              دسترسی یک‌روزه به رتبه‌بندی
            </div>
            <div className="text-[11px] text-zinc-500">{status ? `به‌روزرسانی: ${fmtFaDateTime(status.lastComputedAt)}` : "…"}</div>
          </div>

          <div className="mt-4 flex items-end justify-between gap-4">
            <div>
              <div className="text-4xl font-black tracking-tight">
                <span className="hr-num">$1</span>
              </div>
              <div className="mt-1 text-[11px] text-zinc-500">یک بار پرداخت، بدون اشتراک — نشست ۲۴ ساعته</div>
            </div>
            <button
              onClick={onUnlock}
              className="group inline-flex h-12 items-center gap-2 rounded-xl bg-emerald-400 px-6 text-sm font-bold text-[#06231A] shadow-[0_8px_30px_-6px_rgba(0,210,140,0.55)] transition hover:bg-emerald-300 active:scale-[0.98]"
            >
              باز کردن رادار
              <ChevronLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
            </button>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-4">
            {chains.map((c) => (
              <span
                key={c.network}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] text-zinc-400"
              >
                <Coins className="h-3 w-3 text-zinc-500" />
                {c.label}
                <span className="text-zinc-600">·</span>
                {c.assets.map((a) => a.symbol).join(" / ")}
              </span>
            ))}
          </div>
        </motion.div>

        <button
          onClick={onOwner}
          className="mt-6 inline-flex items-center gap-1.5 text-xs text-zinc-500 transition hover:text-amber-200/90"
        >
          <Crown className="h-3.5 w-3.5" />
          صاحب یکی از خزانه‌ها هستید؟ بدون پرداخت وارد شوید
        </button>

        {/* trust row */}
        <div className="mt-14 grid w-full max-w-2xl grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            { icon: ShieldCheck, title: "راستی‌آزمایی آنچین", desc: "پرداخت روی زنجیره توسط سرور تأیید می‌شود، نه ادعای کلاینت." },
            { icon: Database, title: "دادهٔ کاملاً واقعی", desc: "قیمت‌ها و درآمدها از CoinGecko و DefiLlama؛ جایی داده نبود، صادقانه اعلام می‌شود." },
            { icon: Zap, title: "بدون اشتراک", desc: "هزینهٔ ثابت ماهانه‌ای وجود ندارد؛ فقط یک دلار برای هر روز دسترسی." },
          ].map((f) => (
            <div key={f.title} className="hr-card rounded-xl p-4 text-right">
              <f.icon className="h-4 w-4 text-emerald-300/80" />
              <div className="mt-2 text-xs font-bold text-zinc-200">{f.title}</div>
              <div className="mt-1 text-[11px] leading-5 text-zinc-500">{f.desc}</div>
            </div>
          ))}
        </div>
      </motion.div>
    </section>
  );
}
