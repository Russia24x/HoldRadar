"use client";

import { Radar, ExternalLink, ShieldAlert, Database } from "lucide-react";

/** Sticky bottom footer (mt-auto inside the flex-col root). */
export function Footer() {
  return (
    <footer className="mt-auto border-t border-white/[0.06] bg-[#06080B] pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-4 text-[10px] text-zinc-600 sm:flex-row sm:px-6">
        <div className="flex items-center gap-1.5">
          <Radar className="h-3.5 w-3.5 text-emerald-400/50" />
          <span className="font-semibold text-zinc-500">HoldRadar</span>
          <span className="text-zinc-700">·</span>
          <span>رتبه‌بندی روزانهٔ ارزش برای هولدر</span>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
          <a
            href="https://www.coingecko.com"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 transition hover:text-emerald-300"
          >
            <Database className="h-3 w-3" /> CoinGecko <ExternalLink className="h-2.5 w-2.5" />
          </a>
          <a
            href="https://defillama.com"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 transition hover:text-emerald-300"
          >
            <Database className="h-3 w-3" /> DefiLlama <ExternalLink className="h-2.5 w-2.5" />
          </a>
        </div>

        <div className="flex items-center gap-1.5 text-center sm:text-left">
          <ShieldAlert className="h-3 w-3" />
          <span>داده‌محور است، نه توصیهٔ سرمایه‌گذاری. خرید دارایی دیجیتال با ریسک همراه است.</span>
        </div>
      </div>
    </footer>
  );
}
