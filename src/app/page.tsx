"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Loader2, RefreshCw, Radar } from "lucide-react";
import { Header } from "@/components/holdradar/Header";
import { LockHero } from "@/components/holdradar/LockHero";
import { PaymentDialog } from "@/components/holdradar/PaymentDialog";
import { RankingsView } from "@/components/holdradar/RankingsView";
import { MethodologyDialog } from "@/components/holdradar/MethodologyDialog";
import { OwnerDialog } from "@/components/holdradar/OwnerDialog";
import { Footer } from "@/components/holdradar/Footer";
import type { RankingsResponse, StatusResponse } from "@/components/holdradar/types";

type Phase = "loading" | "locked" | "unlocked-loading" | "unlocked" | "error";

export default function Home() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [rankings, setRankings] = useState<RankingsResponse | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [methodOpen, setMethodOpen] = useState(false);
  const [ownerOpen, setOwnerOpen] = useState(false);

  const loadStatus = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch("/api/status", { cache: "no-store" });
      const j = (await res.json()) as StatusResponse;
      setStatus(j);
      return !j.locked;
    } catch {
      setPhase("error");
      return false;
    }
  }, []);

  const loadRankings = useCallback(async () => {
    setPhase((p) => (p === "unlocked" ? "unlocked" : "unlocked-loading"));
    try {
      const res = await fetch("/api/rankings", { cache: "no-store" });
      if (res.status === 401) {
        setPhase("locked");
        void loadStatus();
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const j = (await res.json()) as RankingsResponse;
      setRankings(j);
      setPhase("unlocked");
    } catch {
      setPhase("error");
    }
  }, [loadStatus]);

  useEffect(() => {
    (async () => {
      const unlocked = await loadStatus();
      if (unlocked) await loadRankings();
      else setPhase("locked");
    })();
  }, [loadStatus, loadRankings]);

  const handleUnlocked = useCallback(() => {
    void loadStatus().then((ok) => {
      if (ok) void loadRankings();
    });
  }, [loadStatus, loadRankings]);

  return (
    <div className="flex min-h-dvh flex-col">
      <Header
        unlocked={phase === "unlocked"}
        onMethodology={() => setMethodOpen(true)}
        onOwner={() => setOwnerOpen(true)}
        snapshotAgeHours={status?.ageHours ?? null}
      />

      <main className="flex flex-1 flex-col">
        {phase === "loading" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 py-32 text-zinc-500">
            <div className="relative flex h-12 w-12 items-center justify-center">
              <Loader2 className="h-12 w-12 animate-spin text-emerald-300/70" />
            </div>
            <div className="text-xs">در حال بررسی وضعیت نشست…</div>
          </div>
        )}

        {phase === "error" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 py-32">
            <Radar className="h-10 w-10 text-red-400/60" />
            <div className="text-sm font-bold text-zinc-200">ارتباط با سرور برقرار نشد</div>
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2 text-xs text-zinc-300 hover:bg-white/[0.08]"
            >
              <RefreshCw className="h-3.5 w-3.5" /> تلاش مجدد
            </button>
          </div>
        )}

        {phase === "locked" && (
          <LockHero status={status} onUnlock={() => setPayOpen(true)} onOwner={() => setOwnerOpen(true)} />
        )}

        {phase === "unlocked-loading" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 py-32 text-zinc-500">
            <Loader2 className="h-10 w-10 animate-spin text-emerald-300/70" />
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-xs">
              در حال دریافت رتبه‌بندی امروز…
            </motion.div>
          </div>
        )}

        {phase === "unlocked" && rankings && (
          <RankingsView data={rankings} onMethodology={() => setMethodOpen(true)} />
        )}
      </main>

      <Footer />

      <PaymentDialog open={payOpen} onOpenChange={setPayOpen} status={status} onUnlocked={handleUnlocked} />
      <MethodologyDialog open={methodOpen} onOpenChange={setMethodOpen} data={rankings} />
      <OwnerDialog open={ownerOpen} onOpenChange={setOwnerOpen} onUnlocked={handleUnlocked} />
    </div>
  );
}
