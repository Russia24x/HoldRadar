"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import {
  Coins,
  Copy,
  Check,
  ExternalLink,
  Loader2,
  ShieldCheck,
  XCircle,
  BadgeCheck,
  Wallet,
  QrCode,
  ArrowRight,
  Info,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import type { StatusResponse } from "./types";
import {
  ensureAbstractChain,
  erc20TransferData,
  evmSignMessage,
  getEvmWallet,
} from "./wallets";

type Step = "chain" | "asset" | "pay";

interface PaymentState {
  chain?: "abstract" | "solana";
  asset?: string;
  txHash: string;
  phase: "idle" | "verifying" | "done";
  error?: string;
  evmSending: boolean;
}

const PRICE_TOLERANCE_MULT = 1.01; // display 1% above $1 to stay safely above threshold

export function PaymentDialog({
  open,
  onOpenChange,
  status,
  onUnlocked,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  status: StatusResponse | null;
  onUnlocked: () => void;
}) {
  const [st, setSt] = useState<PaymentState>({ txHash: "", phase: "idle", evmSending: false });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) setSt({ txHash: "", phase: "idle", evmSending: false });
  }, [open]);

  const chainSpec = useMemo(() => status?.requirements.chains.find((c) => (c.network.includes("2741") ? c.key === "abstract" : true) && c.network.includes(st.chain === "abstract" ? "2741" : "solana")), [status, st.chain]);
  const chainData = status?.requirements.chains.find((c) =>
    st.chain === "abstract" ? c.network === "eip155:2741" : c.network === "solana:mainnet"
  );
  const assetData = chainData?.assets.find((a) => a.symbol === st.asset);

  /** exact payable amount in the asset (≈ $1, slightly above) */
  const amount = useMemo(() => {
    if (!assetData) return null;
    if (assetData.stable) return 1.0 * PRICE_TOLERANCE_MULT;
    const cgId =
      assetData.symbol === "SOL" ? "solana" : assetData.symbol === "PENGU" ? "pudgy-penguins" : "ethereum";
    const p = status?.prices?.[cgId];
    if (!p) return null;
    return (PRICE_TOLERANCE_MULT / p) * 1;
  }, [assetData, status]);

  const qrUri = useMemo(() => {
    if (!chainData || !assetData || amount == null || st.chain !== "solana") return null;
    const a = amount.toFixed(assetData.symbol === "SOL" ? 4 : 2);
    const base = `solana:${chainData.treasury}?amount=${a}&label=HoldRadar`;
    return assetData.contract ? `${base}&spl-token=${assetData.contract}` : base;
  }, [chainData, assetData, amount, st.chain]);

  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!qrUri) {
      setQrDataUrl(null);
      return;
    }
    let cancelled = false;
    import("qrcode")
      .then((m) => m.default.toDataURL(qrUri, { margin: 1, width: 220, color: { dark: "#e8f7f1", light: "#0b0f12" } }))
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => setQrDataUrl(null));
    return () => {
      cancelled = true;
    };
  }, [qrUri]);

  const copyAddress = useCallback(() => {
    if (!chainData) return;
    navigator.clipboard
      .writeText(chainData.treasury)
      .then(() => {
        setCopied(true);
        toast({ title: "آدرس خزانه کپی شد" });
        setTimeout(() => setCopied(false), 1800);
      })
      .catch(() => toast({ title: "کپی ناموفق بود", variant: "destructive" }));
  }, [chainData]);

  async function submit() {
    if (!st.chain || !st.asset || !st.txHash.trim()) return;
    setSt((s) => ({ ...s, phase: "verifying", error: undefined }));
    try {
      const res = await fetch("/api/unlock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chain: st.chain, asset: st.asset, txHash: st.txHash.trim() }),
      });
      const j = await res.json();
      if (res.ok && j.ok) {
        setSt((s) => ({ ...s, phase: "done" }));
        toast({ title: "پرداخت تأیید شد ✅", description: "نشست ۲۴ ساعتهٔ شما فعال شد." });
        setTimeout(() => {
          onUnlocked();
          onOpenChange(false);
        }, 900);
      } else {
        setSt((s) => ({
          ...s,
          phase: "idle",
          error: j.error ?? `راستی‌آزمایی ناموفق بود (کد ${res.status}).`,
        }));
      }
    } catch {
      setSt((s) => ({ ...s, phase: "idle", error: "ارتباط با سرور برقرار نشد." }));
    }
  }

  /** in-browser EVM payment on Abstract (ETH native or USDC.e ERC-20) */
  async function sendFromWallet() {
    if (!chainData || !assetData || amount == null) return;
    const wallet = getEvmWallet();
    if (!wallet) {
      toast({ title: "کیف‌پول EVM در مرورگر پیدا نشد", description: "می‌توانید هش تراکنش را دستی وارد کنید.", variant: "destructive" });
      return;
    }
    setSt((s) => ({ ...s, evmSending: true }));
    try {
      await ensureAbstractChain(wallet);
      const accounts = (await wallet.request({ method: "eth_requestAccounts" })) as string[];
      const from = accounts?.[0];
      if (!from) throw new Error("no account");
      const value =
        assetData.symbol === "ETH"
          ? "0x" + BigInt(Math.round(amount * 1e18)).toString(16)
          : undefined;
      const data =
        assetData.symbol === "ETH" ? undefined : erc20TransferData(chainData.treasury, BigInt(Math.round(amount * 10 ** assetData.decimals)));
      const hash = (await wallet.request({
        method: "eth_sendTransaction",
        params: [{ from, to: assetData.symbol === "ETH" ? chainData.treasury : assetData.contract!, value, data }],
      })) as string;
      setSt((s) => ({ ...s, txHash: hash, evmSending: false }));
      toast({ title: "تراکنش ارسال شد", description: "پس از تأیید شبکه، «راستی‌آزمایی» را بزنید." });
    } catch (e) {
      setSt((s) => ({ ...s, evmSending: false }));
      toast({ title: "ارسال تراکنش ناموفق بود", description: e instanceof Error ? e.message : "خطای کیف‌پول", variant: "destructive" });
    }
  }

  const step: Step = !st.chain ? "chain" : !st.asset ? "asset" : "pay";
  void chainSpec;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto border-white/[0.08] bg-[#0B0E14] p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-white/[0.06] px-6 pt-6 pb-5">
          <DialogTitle className="flex items-center gap-2 text-lg font-extrabold">
            <ShieldCheck className="h-5 w-5 text-emerald-300" />
            باز کردن رتبه‌بندی — پرداخت <span className="hr-num">$1</span>
          </DialogTitle>
          <DialogDescription className="text-xs leading-6 text-zinc-500">
            پرداخت مستقیماً به خزانه انجام می‌شود و سرور آن را روی زنجیره راستی‌آزمایی می‌کند؛ سپس نشست ۲۴ ساعته صادر می‌شود.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-5">
          {/* step indicator */}
          <div className="mb-6 flex items-center gap-2 text-[11px] text-zinc-500">
            {[
              { key: "chain", label: "زنجیره" },
              { key: "asset", label: "دارایی" },
              { key: "pay", label: "پرداخت" },
            ].map((s, i) => {
              const active = step === s.key;
              const done = (step === "asset" && i === 0) || (step === "pay" && i < 2) || st.phase === "done";
              return (
                <div key={s.key} className="flex items-center gap-2">
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-bold ${
                      active
                        ? "border-emerald-400/50 bg-emerald-400/10 text-emerald-300"
                        : done
                          ? "border-emerald-400/30 text-emerald-400/80"
                          : "border-white/10 text-zinc-600"
                    }`}
                  >
                    {done ? <Check className="h-3 w-3" /> : i + 1}
                  </span>
                  <span className={active ? "text-zinc-200" : ""}>{s.label}</span>
                  {i < 2 && <div className="h-px w-6 bg-white/10" />}
                </div>
              );
            })}
          </div>

          <AnimatePresence mode="wait">
            {/* STEP 1 — chain */}
            {step === "chain" && (
              <motion.div key="chain" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} className="grid grid-cols-2 gap-3">
                {[
                  { key: "abstract" as const, title: "Abstract", desc: "ETH · USDC.e", network: "eip155:2741" },
                  { key: "solana" as const, title: "Solana", desc: "SOL · PENGU · USDC", network: "solana:mainnet" },
                ].map((c) => (
                  <button
                    key={c.key}
                    onClick={() => setSt((s) => ({ ...s, chain: c.key, asset: undefined }))}
                    className="hr-card group rounded-2xl p-5 text-right transition hover:border-emerald-400/30 hover:bg-emerald-400/[0.04]"
                  >
                    <Coins className="h-5 w-5 text-emerald-300/70 transition group-hover:text-emerald-300" />
                    <div className="mt-3 text-sm font-bold">{c.title}</div>
                    <div className="mt-1 text-[11px] text-zinc-500">{c.desc}</div>
                    <div className="mt-3 text-[10px] text-zinc-600">{c.network}</div>
                  </button>
                ))}
              </motion.div>
            )}

            {/* STEP 2 — asset */}
            {step === "asset" && chainData && (
              <motion.div key="asset" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} className="flex flex-col gap-3">
                <button onClick={() => setSt((s) => ({ ...s, chain: undefined, asset: undefined }))} className="inline-flex w-fit items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-300">
                  <ArrowRight className="h-3 w-3" /> تغییر زنجیره
                </button>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {chainData.assets.map((a) => {
                    const cgId = a.symbol === "SOL" ? "solana" : a.symbol === "PENGU" ? "pudgy-penguins" : a.symbol === "ETH" ? "ethereum" : null;
                    const price = cgId ? status?.prices?.[cgId] : a.stable ? 1 : undefined;
                    return (
                      <button
                        key={a.symbol}
                        onClick={() => setSt((s) => ({ ...s, asset: a.symbol }))}
                        className="hr-card group rounded-xl p-4 text-right transition hover:border-emerald-400/30"
                      >
                        <div className="text-sm font-bold">{a.symbol}</div>
                        <div className="mt-1 text-[10px] text-zinc-500">
                          {a.stable ? "استیبل‌کوین" : price ? `≈ $${price < 1 ? price.toFixed(4) : price.toFixed(2)}` : "قیمت زنده"}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {/* STEP 3 — pay */}
            {step === "pay" && chainData && assetData && (
              <motion.div key="pay" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} className="flex flex-col gap-5">
                <button onClick={() => setSt((s) => ({ ...s, asset: undefined }))} className="inline-flex w-fit items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-300">
                  <ArrowRight className="h-3 w-3" /> تغییر دارایی ({st.chain === "abstract" ? "Abstract" : "سولانا"})
                </button>

                {/* amount + address */}
                <div className="hr-card rounded-2xl p-4">
                  <div className="flex items-center justify-between text-[11px] text-zinc-500">
                    <span>مبلغ دقیق (≈ $1.01)</span>
                    <span>{assetData.symbol}</span>
                  </div>
                  <div className="mt-1.5 text-2xl font-black tracking-tight">
                    {amount != null ? <span className="hr-num">{amount.toFixed(assetData.symbol === "ETH" ? 6 : 4)} {assetData.symbol}</span> : "قیمت در دسترس نیست"}
                  </div>
                  <div className="mt-4 border-t border-white/[0.06] pt-3">
                    <div className="text-[11px] text-zinc-500">آدرس خزانه ({st.chain === "abstract" ? "Abstract" : "سولانا"})</div>
                    <button onClick={copyAddress} className="group mt-1.5 flex w-full items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-right transition hover:border-emerald-400/30">
                      <code dir="ltr" className="flex-1 truncate text-[11px] text-zinc-300">{chainData.treasury}</code>
                      {copied ? <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" /> : <Copy className="h-3.5 w-3.5 shrink-0 text-zinc-500 group-hover:text-zinc-300" />}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-5">
                  {qrDataUrl && (
                    <div className="hr-card col-span-2 flex flex-col items-center justify-center rounded-2xl p-4">
                      <div className="text-[10px] text-zinc-500">اسکن با کیف‌پول سولانا (Solana Pay)</div>
                      { }
                      <img src={qrDataUrl} alt="Solana Pay QR" className="mt-3 h-[170px] w-[170px] rounded-lg ring-1 ring-white/10" />
                      <div className="mt-2 inline-flex items-center gap-1 text-[10px] text-zinc-600"><QrCode className="h-3 w-3" /> {assetData.symbol}</div>
                    </div>
                  )}

                  <div className={`flex flex-col gap-3 ${qrDataUrl ? "col-span-3" : "col-span-5"}`}>
                    {/* in-browser wallet pay (EVM only) */}
                    {st.chain === "abstract" && (
                      <Button
                        onClick={sendFromWallet}
                        disabled={st.evmSending || amount == null}
                        className="h-10 w-full gap-2 bg-emerald-400/90 text-[#06231A] hover:bg-emerald-300"
                      >
                        {st.evmSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
                        ارسال از کیف‌پول مرورگر (Abstract)
                      </Button>
                    )}

                    <div>
                      <label className="mb-1.5 block text-[11px] text-zinc-500">هش/امضای تراکنش را پس از واریز وارد کنید:</label>
                      <Input
                        dir="ltr"
                        value={st.txHash}
                        onChange={(e) => setSt((s) => ({ ...s, txHash: e.target.value }))}
                        placeholder={st.chain === "abstract" ? "0x…" : "امضای تراکنش سولانا (base58)"}
                        className="h-10 border-white/10 bg-black/30 font-mono text-[11px]"
                      />
                    </div>

                    <Button
                      onClick={submit}
                      disabled={st.phase === "verifying" || !st.txHash.trim()}
                      className="h-11 w-full gap-2"
                      variant={st.phase === "done" ? "secondary" : "default"}
                    >
                      {st.phase === "verifying" ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" /> در حال راستی‌آزمایی روی زنجیره…
                        </>
                      ) : st.phase === "done" ? (
                        <>
                          <BadgeCheck className="h-4 w-4" /> تأیید شد! در حال باز شدن…
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="h-4 w-4" /> راستی‌آزمایی پرداخت
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {st.error && (
                  <div className="flex items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/[0.06] p-3 text-xs leading-6 text-red-300/90">
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    {st.error}
                  </div>
                )}

                <div className="flex items-start gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-[10px] leading-5 text-zinc-500">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  هر تراکنش فقط یک‌بار قابل استفاده است (جلوگیری از replay). تراکنش را می‌توانید از هر کیف‌پول یا صرافی ارسال کنید؛ چیزی که اهمیت دارد رسید مبلغ به خزانه است.
                  {assetData && st.chain === "solana" && assetData.contract && (
                    <a
                      href={`https://solscan.io/token/${assetData.contract}`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-emerald-300/80 hover:text-emerald-300"
                      dir="ltr"
                    >
                      قرارداد {assetData.symbol} <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
}
