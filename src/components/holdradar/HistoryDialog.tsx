"use client";

import { motion } from "framer-motion";
import { Archive, Coins, TrendingUp } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { HistoryResponse } from "./types";

const MEDAL_TXT = ["text-amber-300", "text-zinc-300", "text-orange-300"];

/** Daily archive (blueprint §5 extension): what the top of the board looked
 *  like on each of the last ≤14 snapshot days. Session-gated upstream. */
export function HistoryDialog({
  open,
  onOpenChange,
  history,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  history: HistoryResponse | null;
}) {
  const snaps = [...(history?.snapshots ?? [])].reverse(); // newest first

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto border-white/[0.08] bg-[#0B0E14] p-0 sm:max-w-xl">
        <DialogHeader className="border-b border-white/[0.06] px-6 pt-6 pb-5">
          <DialogTitle className="flex items-center gap-2 text-lg font-extrabold">
            <Archive className="h-5 w-5 text-emerald-300" /> آرشیو روزانهٔ رتبه‌بندی
          </DialogTitle>
          <DialogDescription className="text-xs leading-6 text-zinc-500">
            {history && history.days > 0
              ? `${history.days} اسنپ‌شات ذخیره‌شده (حداکثر ۱۴ روز اخیر). هر روز ساعت ~۰۰:۱۰ UTC دادهٔ تازه محاسبه و آرشیو می‌شود.`
              : "هنوز اسنپ‌شاتی موجود نیست."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[62dvh] flex-col gap-3 overflow-y-auto px-6 py-5">
          {snaps.length === 0 && (
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-8 text-center text-xs text-zinc-500">
              آرشیو خالی است؛ بعد از اولین اجرای روزانهٔ pipeline پر می‌شود.
            </div>
          )}

          {snaps.map((s, i) => (
            <motion.div
              key={s.date}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.04, 0.3) }}
              className={`rounded-xl border p-4 ${i === 0 ? "border-emerald-400/20 bg-emerald-400/[0.03]" : "border-white/[0.07] bg-white/[0.02]"}`}
            >
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-bold">
                  {i === 0 && <span className="rounded-md bg-emerald-400/10 px-2 py-0.5 text-[10px] font-bold text-emerald-300">امروز</span>}
                  <span className="hr-num text-zinc-200" dir="ltr">{s.date}</span>
                </div>
                {s.avgScore != null && (
                  <span className="flex items-center gap-1 text-[10px] text-zinc-500">
                    <TrendingUp className="h-3 w-3 text-emerald-300/60" />
                    میانگین ۲۵ تایی: <span className="hr-num font-bold text-zinc-300">{s.avgScore.toFixed(1)}</span>
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                {s.top.map((t, j) => (
                  <div key={t.id} className="flex items-center gap-2.5 rounded-lg bg-black/20 px-3 py-1.5">
                    <span className={`hr-num w-5 text-center text-xs font-black ${MEDAL_TXT[j] ?? "text-zinc-500"}`}>{t.rank}</span>
                    {t.image ? (
                      <img src={t.image} alt={t.name} className="h-5 w-5 rounded-full ring-1 ring-white/10" />
                    ) : (
                      <Coins className="h-4 w-4 text-zinc-600" />
                    )}
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold text-zinc-300">{t.name}</span>
                    <span className="text-[10px] uppercase text-zinc-600">{t.symbol}</span>
                    <span className="hr-num text-xs font-black text-zinc-100">{t.composite.toFixed(1)}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
