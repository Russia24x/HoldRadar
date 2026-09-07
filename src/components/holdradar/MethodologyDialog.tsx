"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { motion } from "framer-motion";
import { TrendingUp, Scale, Flame, ShieldCheck, Layers, Database, ExternalLink, Info } from "lucide-react";
import { fmtCompactUsd } from "./format";
import type { RankingsResponse } from "./types";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  realYield: TrendingUp,
  scarcity: Scale,
  holderShare: Flame,
  maturity: ShieldCheck,
  ecosystem: Layers,
};

/** Public methodology (blueprint §4): the formula is transparent for everyone. */
export function MethodologyDialog({
  open,
  onOpenChange,
  data,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  data: RankingsResponse | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto border-white/[0.08] bg-[#0B0E14] p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-white/[0.06] px-6 pt-6 pb-5">
          <DialogTitle className="text-lg font-extrabold">روش‌شناسی «امتیاز ارزش برای هولدر»</DialogTitle>
          <DialogDescription className="text-xs leading-6 text-zinc-500">
            فرمول کامل، وزن هر معیار و منبع هر داده — شفاف و بدون عدد پنهان.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-5">
          <p className="text-[13px] leading-7 text-zinc-400">
            هر روز، ۳۰۰ ارز برتر از نظر ارزش بازار (CoinGecko) به‌عنوان «جامعهٔ نامزدها» انتخاب می‌شوند و با دادهٔ
            کارمزد/درآمد/TVL پروتکل‌ها (DefiLlama) از طریق شناسهٔ <code dir="ltr" className="text-emerald-300/80">gecko_id</code> تطبیق
            داده می‌شوند. هر زیرمعیار نسبت به کل جامعهٔ همان روز در بازهٔ ۰ تا ۱۰۰ نرمال‌سازی می‌شود (Min-Max) و نهایتاً با
            وزن‌های زیر ترکیب می‌گردد. اگر داده‌ای برای یک معیار در دسترس نباشد، آن معیار برای آن دارایی «امتیاز صفر»
            می‌گیرد و وزنش حفظ می‌شود — چون شاخص به مکانیک اثبات‌شدهٔ ارزش‌آفرینی برای هولدر جایزه می‌دهد و «ناشناخته»
            خوب حساب نمی‌شود. (دادهٔ صفرِ واقعی با دادهٔ ناموجود اشتباه گرفته نمی‌شود.)
          </p>

          <div className="mt-6 flex flex-col gap-3">
            {(data?.weights ?? [
              { key: "realYield", label: "بازده واقعی هولدر", weight: 0.3, formula: "درآمد ۳۰روزهٔ رسیده به هولدرها × ۱۲ ÷ ارزش بازار" },
              { key: "scarcity", label: "کمیابی و انتشار", weight: 0.2, formula: "نسبت عرضهٔ در گردش به حداکثر + نسبت ارزش بازار به FDV" },
              { key: "holderShare", label: "بازخرید، سوزاندن و سهم هولدر", weight: 0.2, formula: "درآمد هولدر ۳۰روزه ÷ کل درآمد ۳۰روزهٔ پروتکل" },
              { key: "maturity", label: "ذخیرهٔ ارزش و بلوغ", weight: 0.15, formula: "پایداری قیمت ۹۰روزه + رتبهٔ ارزش بازار" },
              { key: "ecosystem", label: "اندازه و رشد اکوسیستم", weight: 0.15, formula: "TVL فعلی + روند ۳۰روزهٔ TVL" },
            ]).map((w, i) => {
              const Icon = ICONS[w.key] ?? Database;
              const cov = data?.coverage?.[w.key];
              return (
                <motion.div
                  key={w.key}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.06 }}
                  className="hr-card rounded-xl p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-400/10 ring-1 ring-emerald-400/20">
                        <Icon className="h-4 w-4 text-emerald-300" />
                      </div>
                      <div className="text-sm font-bold">{w.label}</div>
                    </div>
                    <div className="hr-num rounded-lg bg-white/[0.05] px-2.5 py-1 text-xs font-black text-emerald-300">
                      {Math.round(w.weight * 100)}٪
                    </div>
                  </div>
                  <div className="mt-2.5 text-[11px] leading-6 text-zinc-400">{w.formula}</div>
                  {cov && (
                    <div className="mt-2 flex items-center gap-1.5 text-[10px] text-zinc-600">
                      <Database className="h-3 w-3" />
                      پوشش امروز: <span className="hr-num text-zinc-400">{cov.pct}٪</span> از جامعه ({cov.covered} از {cov.total})
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>

          <div className="mt-6 flex flex-col gap-3">
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
              <div className="mb-2 flex items-center gap-2 text-xs font-bold text-zinc-200">منابع داده (رایگان و بدون کلید)</div>
              <div className="flex flex-col gap-2 text-[11px] text-zinc-500">
                <a href="https://www.coingecko.com/en/api" target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:text-emerald-300">
                  CoinGecko — قیمت، ارزش بازار، عرضه، FDV، تغییرات ۹۰روزه <ExternalLink className="h-3 w-3" />
                </a>
                <a href="https://defillama.com/en/api" target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:text-emerald-300">
                  DefiLlama — درآمد پروتکل، درآمد هولدرها، TVL <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>

            <div className="flex items-start gap-2.5 rounded-xl border border-amber-300/15 bg-amber-300/[0.03] p-4 text-[11px] leading-6 text-amber-200/70">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-300/70" />
              <span>
                نکتهٔ صادقانه: دادهٔ «بازخرید و سوزاندن» از متریک «درآمد رسیده به هولدرها»ٔ DefiLlama استخراج می‌شود که
                شامل توزیع‌ها، بازخریدها و سوزاندن‌هاست؛ پوشش این معیار بین ارزها یکسان نیست و در جدول بالا شفاف گزارش
                شده. روند ۳۰روزهٔ TVL از اسنپ‌شات‌های روزانهٔ خود سایت محاسبه می‌شود، بنابراین از روز دوم به بعد در
                امتیاز لحاظ می‌گردد.
              </span>
            </div>

            {data && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  ["جامعهٔ نامزدها", data.poolSize + " ارز"],
                  ["زمان محاسبه", Math.round(data.pipelineMs / 100) / 10 + " ثانیه"],
                  ["بزرگ‌ترین ارزش بازار", fmtCompactUsd(data.rows.find((r) => r.marketCap != null)?.marketCap ?? null)],
                  ["تاریخ اسنپ‌شات", data.date],
                ].map(([l, v]) => (
                  <div key={l} className="rounded-lg bg-white/[0.03] px-3 py-2 text-center">
                    <div className="text-[9px] text-zinc-600">{l}</div>
                    <div className="hr-num mt-0.5 text-[11px] font-bold text-zinc-200">{v}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
